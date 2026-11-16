/**
 * Supabase implementation of {@link IntegrationBackend} (tables from
 * `supabase/migrations/20261118000000_integrations.sql`, Edge Function
 * `supabase/functions/todoist-daily`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyPlan, IntegrationBackend, TodoistSettings } from '../services/integrations';
import { defaultTodoistSettings } from '../services/integrations';

/** Row of `public.integrations`. */
interface IntegrationRow {
  todoist_enabled: boolean;
  project_name: string;
  timezone: string;
  title_template: string;
  labels: string[];
  priority: number;
  last_run_date: string | null;
  last_run_at: string | null;
  last_result: string | null;
  last_error: string | null;
}

/** Todoist integration via Supabase. */
export class SupabaseIntegrationBackend implements IntegrationBackend {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async load(): Promise<TodoistSettings> {
    const { data, error } = await this.client
      .from('integrations')
      .select('*')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const token = await this.client.rpc('has_todoist_token');
    const base = defaultTodoistSettings();
    const row = data as IntegrationRow | null;
    if (!row) return { ...base, hasToken: Boolean(token.data) };
    return {
      enabled: row.todoist_enabled,
      projectName: row.project_name,
      timezone: row.timezone,
      titleTemplate: row.title_template,
      labels: row.labels ?? [],
      priority: Math.min(4, Math.max(1, row.priority)) as TodoistSettings['priority'],
      hasToken: Boolean(token.data),
      lastRunDate: row.last_run_date,
      lastRunAt: row.last_run_at ? Date.parse(row.last_run_at) : null,
      lastResult: row.last_result,
      lastError: row.last_error,
    };
  }

  async save(s: Parameters<IntegrationBackend['save']>[0]): Promise<void> {
    const row: Record<string, unknown> = {
      user_id: this.userId,
      updated_at: new Date().toISOString(),
    };
    if (s.enabled !== undefined) row.todoist_enabled = s.enabled;
    if (s.projectName !== undefined) row.project_name = s.projectName;
    if (s.timezone !== undefined) row.timezone = s.timezone;
    if (s.titleTemplate !== undefined) row.title_template = s.titleTemplate;
    if (s.labels !== undefined) row.labels = s.labels;
    if (s.priority !== undefined) row.priority = s.priority;
    const { error } = await this.client.from('integrations').upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }

  async setToken(token: string | null): Promise<void> {
    const { error } = await this.client.rpc('set_todoist_token', { p_token: token });
    if (error) throw new Error(error.message);
  }

  async uploadPlans(plans: readonly DailyPlan[]): Promise<void> {
    const rows = plans.map((p) => ({
      user_id: this.userId,
      plan_date: p.date,
      tasks: p.tasks,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await this.client
      .from('daily_plans')
      .upsert(rows, { onConflict: 'user_id,plan_date' });
    if (error) throw new Error(error.message);
  }

  async runNow(date: string): Promise<string> {
    const { data, error } = await this.client.functions.invoke('todoist-daily', {
      body: { mode: 'now', date },
    });
    if (error) throw new Error(error.message);
    const result = data as { result?: string; error?: string };
    if (result.error) throw new Error(result.error);
    return result.result ?? 'OK';
  }
}
