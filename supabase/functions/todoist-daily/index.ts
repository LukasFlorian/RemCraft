/**
 * Edge Function `todoist-daily` (Deno).
 *
 * - **Nightly** (`{"mode":"cron"}`, authorised with `CRON_SECRET`): called
 *   every hour at minute 1. For every user with the integration enabled who
 *   has not been served today, sends that day's planned tasks to Todoist on
 *   the first call after local midnight - i.e. at 00:01 local time (failed
 *   runs are retried hourly until 06:00).
 * - **Now** (`{"mode":"now","date":"YYYY-MM-DD"}`, authorised with the
 *   user's JWT): the "Jetzt senden" button in the settings.
 *
 * Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (provided by Supabase)
 * and `CRON_SECRET` (set with `supabase secrets set CRON_SECRET=...`).
 * Deploy with `supabase functions deploy todoist-daily --no-verify-jwt`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isDue, localTime, sendDailyTasks, summarize, TodoistClient } from '../_shared/todoist.ts';
import type { PlannedTask, TaskMap } from '../_shared/todoist.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** JSON response. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Row of `integrations`. */
interface Integration {
  user_id: string;
  todoist_enabled: boolean;
  project_name: string;
  project_id: string | null;
  timezone: string;
  labels: string[];
  priority: number;
  task_map: TaskMap;
  last_run_date: string | null;
}

/** Sends the tasks of `date` for one user and records the outcome. */
async function runFor(row: Integration, date: string): Promise<string> {
  const { data: secret } = await admin
    .from('integration_secrets')
    .select('todoist_token')
    .eq('user_id', row.user_id)
    .maybeSingle();
  const token = (secret as { todoist_token: string | null } | null)?.todoist_token;
  try {
    if (!token) throw new Error('Kein Todoist-Token hinterlegt');
    const { data: plan } = await admin
      .from('daily_plans')
      .select('tasks')
      .eq('user_id', row.user_id)
      .eq('plan_date', date)
      .maybeSingle();
    const tasks = ((plan as { tasks: PlannedTask[] } | null)?.tasks ?? []).filter(
      (t) => t.minutes > 0,
    );
    const client = new TodoistClient(token, (url, init) => fetch(url, init));
    const projectId = tasks.length
      ? (row.project_id ?? (await client.ensureProject(row.project_name)))
      : row.project_id;
    const res = await sendDailyTasks(
      client,
      tasks,
      { projectId, labels: row.labels ?? [], priority: row.priority },
      row.task_map ?? {},
    );
    const result = plan
      ? summarize(res, tasks.length)
      : 'Kein Plan für heute (App seit über 2 Wochen nicht geöffnet?)';
    await admin
      .from('integrations')
      .update({
        project_id: projectId,
        task_map: res.taskMap,
        last_run_date: date,
        last_run_at: new Date().toISOString(),
        last_result: result,
        last_error: null,
      })
      .eq('user_id', row.user_id);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Not marked as done, so the next hourly call retries. The project id is
    // reset in case the project was deleted (it is looked up by name again).
    await admin
      .from('integrations')
      .update({ project_id: null, last_run_at: new Date().toISOString(), last_error: message })
      .eq('user_id', row.user_id);
    throw e;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = (await req.json().catch(() => ({}))) as { mode?: string; date?: string };
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (body.mode === 'cron') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || auth !== secret) return json({ error: 'unauthorised' }, 401);
    const { data } = await admin.from('integrations').select('*').eq('todoist_enabled', true);
    const now = new Date();
    const results: Record<string, string> = {};
    for (const row of (data ?? []) as Integration[]) {
      const { due, date } = isDue(now, row.timezone, row.last_run_date);
      if (!due) continue;
      results[row.user_id] = await runFor(row, date).catch(
        (e: unknown) => `Fehler: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return json({ ran: Object.keys(results).length, results });
  }

  // "Jetzt senden": the signed-in user only.
  const { data: user } = await admin.auth.getUser(auth);
  if (!user.user) return json({ error: 'Nicht angemeldet' }, 401);
  const { data: row } = await admin
    .from('integrations')
    .select('*')
    .eq('user_id', user.user.id)
    .maybeSingle();
  if (!row) return json({ error: 'Todoist ist nicht eingerichtet' }, 400);
  const integration = row as Integration;
  const date = body.date ?? localTime(new Date(), integration.timezone).date;
  try {
    return json({ result: await runFor(integration, date) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }
});
