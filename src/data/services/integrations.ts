/**
 * Task-manager integrations (currently Todoist).
 *
 * The browser computes the study plan for the next days with the real
 * scheduler (same queue as the practice screen) and uploads it as
 * `daily_plans`. A Supabase Edge Function (`supabase/functions/todoist-daily`)
 * runs every hour; at 00:01 in the user's time zone it creates one Todoist
 * task per course for that day (with a duration estimate), or updates the
 * tasks it created earlier. The plan is refreshed whenever cards, reviews or
 * exams change, so the server never needs the scheduler itself.
 */
import { buildDailyTasks, courseOf, estimateFromLogs } from '@core/planning/daily';
import type { DailyTask } from '@core/planning/daily';
import { buildGlobalQueue } from '@core/scheduling/queue';
import type { ExamQuota, QueueEntry } from '@core/scheduling/queue';
import { isExamActive, resolveInheritance } from '@core/scheduling/inheritance';
import { planExam } from '@core/scheduling/exam';
import type { RemId, Timestamp } from '@core/model/types';
import { addStudyDays, isoDate, MINUTE, startOfStudyDay } from '@core/util/time';
import {
  cardStateOf,
  schedulerById,
  selectCardIndex,
  selectLogs,
  selectSettings,
  selectTodayLogs,
} from '../selectors';
import type { Store } from '../store/store';

/** Days planned ahead (covers a week of not opening the app). */
export const PLAN_DAYS = 14;

/** Todoist settings stored on the server (the API token is stored separately, write-only). */
export interface TodoistSettings {
  enabled: boolean;
  /** Project the tasks go to (created if missing). */
  projectName: string;
  /** IANA time zone deciding when "00:01" is. */
  timezone: string;
  /** Title template: `{course}`, `{minutes}`. */
  titleTemplate: string;
  labels: string[];
  /** Todoist priority 1 (normal) - 4 (urgent). */
  priority: 1 | 2 | 3 | 4;
  /** A token is stored (the token itself is never sent back). */
  hasToken: boolean;
  lastRunDate: string | null;
  lastRunAt: number | null;
  lastResult: string | null;
  lastError: string | null;
}

/** Defaults for a new integration. */
export function defaultTodoistSettings(): TodoistSettings {
  return {
    enabled: false,
    projectName: 'RemCraft',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
    titleTemplate: '{course} lernen (~{minutes} min)',
    labels: [],
    priority: 1,
    hasToken: false,
    lastRunDate: null,
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  };
}

/** The plan of one day. */
export interface DailyPlan {
  date: string;
  tasks: DailyTask[];
}

/** Server operations of the integration. */
export interface IntegrationBackend {
  load(): Promise<TodoistSettings>;
  save(
    settings: Partial<
      Omit<TodoistSettings, 'hasToken' | 'lastRunDate' | 'lastRunAt' | 'lastResult' | 'lastError'>
    >,
  ): Promise<void>;
  /** Stores (or with `null` removes) the Todoist API token. */
  setToken(token: string | null): Promise<void>;
  uploadPlans(plans: readonly DailyPlan[]): Promise<void>;
  /** Sends today's tasks right now (same code path as the nightly run). */
  runNow(date: string): Promise<string>;
}

/**
 * Computes the study tasks of the next days.
 *
 * Day 0 uses today's real activity (cards already introduced count against
 * the limits); later days assume the plan is followed from scratch, with the
 * current card states - exactly what the queue would show on that morning if
 * nothing is practised before.
 *
 * @param store The store.
 * @param now Current time.
 * @param days Number of days.
 * @param opts Title template and practice link builder.
 */
export function forecastDailyPlans(
  store: Store,
  now: Timestamp,
  days = PLAN_DAYS,
  opts: { titleTemplate?: string; practiceUrl?: (groupId: RemId) => string } = {},
): DailyPlan[] {
  const settings = selectSettings(store);
  const dsh = settings.dayStartHour;
  const index = selectCardIndex(store);
  const exams = store.all('exams');
  const estimate = estimateFromLogs(selectLogs(store));
  const todayLogs = selectTodayLogs(store, now);
  const states = new Map(index.specs.map((s) => [s.id, cardStateOf(store, s)] as const));
  const scheduler = schedulerById(store, undefined);
  const groupCache = new Map<RemId, ReturnType<typeof courseOf>>();
  const groupOf = (remId: RemId): ReturnType<typeof courseOf> => {
    if (!groupCache.has(remId)) groupCache.set(remId, courseOf(store, remId));
    return groupCache.get(remId);
  };

  const plans: DailyPlan[] = [];
  for (let i = 0; i < days; i++) {
    // A moment after the study day starts (or now, for today).
    const at = i === 0 ? now : startOfStudyDay(addStudyDays(now, i, dsh), dsh) + MINUTE;
    const inherited = resolveInheritance(store, exams, at);
    const entries: QueueEntry[] = index.specs.map((spec) => ({
      cardId: spec.id,
      remId: spec.remId,
      state: states.get(spec.id)!,
      priority: inherited.get(spec.remId)?.priority ?? 'none',
      examIds: inherited.get(spec.remId)?.examIds ?? [],
      docOrder: index.docOrder.get(spec.remId) ?? 0,
    }));
    const examCardIds = new Set(entries.filter((e) => e.priority === 'exam').map((e) => e.cardId));
    const logs = i === 0 ? todayLogs : [];
    const examQuotas = new Map<string, ExamQuota>();
    for (const exam of exams) {
      if (!isExamActive(exam, at)) continue;
      const inExam = entries.filter((e) => e.examIds.includes(exam.id) && !e.state.disabled);
      const ids = new Set(inExam.map((e) => e.cardId));
      const examLogs = logs.filter((l) => ids.has(l.cardId));
      const plan = planExam(
        exam,
        inExam.map((e) => e.state),
        {
          introducedToday: new Set(
            examLogs.filter((l) => l.before.phase === 'new').map((l) => l.cardId),
          ).size,
          correctToday: examLogs.filter((l) => l.rating > 1).length,
        },
        at,
        dsh,
        scheduler,
      );
      examQuotas.set(exam.id, {
        newQuota: plan.todayNewQuota,
        finalReviewQuota: plan.todayFinalReviewQuota,
        finalReviewStart: plan.finalReviewStart,
      });
    }
    const queue = buildGlobalQueue(entries, {
      now: at,
      dayStartHour: dsh,
      newCardsPerDay: settings.newCardsPerDay,
      newIntroducedToday: new Set(
        logs
          .filter((l) => l.before.phase === 'new' && !examCardIds.has(l.cardId))
          .map((l) => l.cardId),
      ).size,
      examQuotas,
      retrievability: () => 0,
      learnAheadMinutes: settings.learnAheadMinutes ?? 15,
    });
    const date = isoDate(startOfStudyDay(at, dsh) + 12 * 60 * MINUTE);
    plans.push({
      date,
      tasks: buildDailyTasks(queue, {
        date,
        remOf: (cardId) => index.byId.get(cardId)?.remId,
        groupOf,
        examName: (id) => exams.find((e) => e.id === id)?.name,
        estimate,
        ...(opts.practiceUrl ? { practiceUrl: opts.practiceUrl } : {}),
        ...(opts.titleTemplate ? { titleTemplate: opts.titleTemplate } : {}),
      }),
    });
  }
  return plans;
}

/** Keeps the server-side plan fresh and exposes the Todoist settings. */
export class IntegrationService {
  private backend: IntegrationBackend | null = null;
  private settings: TodoistSettings | null = null;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Builds practice links (set by the UI, which knows the app URL). */
  practiceUrl: ((groupId: RemId) => string) | undefined;

  constructor(private readonly store: Store) {}

  /** Connects the backend (signed in) or disconnects it (`null`). */
  async connect(backend: IntegrationBackend | null): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.backend = backend;
    this.settings = null;
    this.emit();
    if (!backend) return;
    try {
      this.settings = await backend.load();
    } catch {
      this.settings = null; // integration tables not installed: feature stays off
    }
    this.emit();
    // Refresh the plan when practice-relevant data changes (debounced).
    this.unsubscribe = this.store.onCommit((e) => {
      if (
        e.changes.some(
          (c) =>
            c.collection === 'cards' ||
            c.collection === 'logs' ||
            c.collection === 'exams' ||
            c.collection === 'rems' ||
            c.collection === 'settings',
        )
      )
        this.schedule();
    });
    this.schedule(1000);
  }

  /** Current settings (`null` = not available: offline or not set up). */
  getSettings(): TodoistSettings | null {
    return this.settings;
  }

  /** Subscribes to settings changes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Saves settings (and uploads the plan when enabled). */
  async save(patch: Partial<TodoistSettings>): Promise<void> {
    const backend = this.require();
    const {
      hasToken: _h,
      lastRunDate: _d,
      lastRunAt: _a,
      lastResult: _r,
      lastError: _e,
      ...editable
    } = patch;
    await backend.save(editable);
    this.settings = { ...(this.settings ?? defaultTodoistSettings()), ...editable };
    this.emit();
    this.schedule(0);
  }

  /** Stores or removes the Todoist API token. */
  async setToken(token: string | null): Promise<void> {
    await this.require().setToken(token);
    this.settings = { ...(this.settings ?? defaultTodoistSettings()), hasToken: token !== null };
    this.emit();
  }

  /** Uploads the plan now and sends today's tasks to Todoist. */
  async runNow(): Promise<string> {
    const backend = this.require();
    await this.uploadPlan();
    const result = await backend.runNow(this.plans(1)[0]!.date);
    this.settings = await backend.load();
    this.emit();
    return result;
  }

  /** Plans of the next days (for the settings preview). */
  plans(days = PLAN_DAYS): DailyPlan[] {
    return forecastDailyPlans(this.store, Date.now(), days, {
      ...(this.settings?.titleTemplate ? { titleTemplate: this.settings.titleTemplate } : {}),
      ...(this.practiceUrl ? { practiceUrl: this.practiceUrl } : {}),
    });
  }

  /** Uploads the forecast (no-op unless enabled). */
  async uploadPlan(): Promise<void> {
    if (!this.backend || !this.settings?.enabled) return;
    await this.backend.uploadPlans(this.plans());
  }

  /** Stops timers and listeners. */
  dispose(): void {
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay = 30_000): void {
    if (!this.backend || !this.settings?.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.uploadPlan().catch(() => undefined), delay);
  }

  private require(): IntegrationBackend {
    if (!this.backend) throw new Error('Integrationen brauchen ein Konto (Einstellungen → Konto).');
    return this.backend;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
