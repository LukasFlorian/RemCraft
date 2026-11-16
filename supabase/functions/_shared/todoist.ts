/**
 * Todoist client and the daily task synchronisation used by the
 * `todoist-daily` Edge Function. Plain TypeScript with an injected `fetch`,
 * so it runs in Deno (Edge Functions) and in Vitest alike.
 *
 * API: Todoist API v1 (`https://api.todoist.com/api/v1`), bearer token
 * authentication. Tasks are created as all-day tasks on the plan's date with
 * a duration in minutes; if Todoist rejects a duration without a time, the
 * task is created without it (the estimate is in the title anyway).
 */

/** Base URL of the Todoist API. */
export const TODOIST_API = 'https://api.todoist.com/api/v1';

/** A planned task as uploaded by the app (subset of `DailyTask`). */
export interface PlannedTask {
  key: string;
  date: string;
  content: string;
  description: string;
  minutes: number;
}

/** Settings relevant for sending tasks. */
export interface SendOptions {
  projectId: string | null;
  labels: string[];
  priority: number;
}

/** `date → task key → Todoist task id` (tasks created by RemCraft). */
export type TaskMap = Record<string, Record<string, string>>;

/** Result of {@link sendDailyTasks}. */
export interface SendResult {
  created: number;
  updated: number;
  skipped: number;
  taskMap: TaskMap;
}

/** Minimal fetch signature. */
export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/** HTTP error of the Todoist API. */
export class TodoistError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin Todoist API client. */
export class TodoistClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFn,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${TODOIST_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok)
      throw new TodoistError(
        res.status,
        `Todoist ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** Finds a project by name or creates it; returns its id. */
  async ensureProject(name: string): Promise<string> {
    let cursor: string | null = null;
    do {
      const page: unknown = await this.call(
        'GET',
        `/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      // v1 returns `{ results, next_cursor }`; older APIs returned an array.
      const list = (
        Array.isArray(page) ? page : ((page as { results?: unknown[] }).results ?? [])
      ) as { id: string; name: string }[];
      const hit = list.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (hit) return String(hit.id);
      cursor = Array.isArray(page)
        ? null
        : ((page as { next_cursor?: string | null }).next_cursor ?? null);
    } while (cursor);
    const created = await this.call<{ id: string }>('POST', '/projects', { name });
    return String(created.id);
  }

  /** Creates a task; returns its id. */
  async createTask(body: Record<string, unknown>): Promise<string> {
    const task = await this.call<{ id: string }>('POST', '/tasks', body);
    return String(task.id);
  }

  /** Updates a task. */
  async updateTask(id: string, body: Record<string, unknown>): Promise<void> {
    await this.call('POST', `/tasks/${id}`, body);
  }

  /** Reads a task (`null` when deleted). */
  async getTask(
    id: string,
  ): Promise<{ id: string; checked?: boolean; is_completed?: boolean } | null> {
    try {
      return await this.call('GET', `/tasks/${id}`);
    } catch (e) {
      if (e instanceof TodoistError && e.status === 404) return null;
      throw e;
    }
  }
}

/** Request body of a planned task. */
function taskBody(
  task: PlannedTask,
  opts: SendOptions,
  withDuration: boolean,
): Record<string, unknown> {
  return {
    content: task.content,
    description: task.description,
    due_date: task.date,
    ...(withDuration ? { duration: task.minutes, duration_unit: 'minute' } : {}),
    ...(opts.projectId ? { project_id: opts.projectId } : {}),
    ...(opts.labels.length ? { labels: opts.labels } : {}),
    priority: opts.priority,
  };
}

/**
 * Sends the tasks of one day: creates new tasks, updates those created
 * earlier (same date and key) and leaves completed or deleted ones alone.
 *
 * @param client Todoist client.
 * @param tasks Planned tasks of the day.
 * @param opts Project, labels, priority.
 * @param taskMap Ids of tasks created before (not mutated).
 */
export async function sendDailyTasks(
  client: TodoistClient,
  tasks: readonly PlannedTask[],
  opts: SendOptions,
  taskMap: TaskMap,
): Promise<SendResult> {
  const result: SendResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    taskMap: structuredClone(taskMap),
  };
  for (const task of tasks) {
    const day = (result.taskMap[task.date] ??= {});
    const existing = day[task.key];
    if (existing) {
      const current = await client.getTask(existing);
      if (!current || current.checked || current.is_completed) {
        result.skipped++; // done or deleted by the user: respect that
        continue;
      }
      await withDurationFallback((d) => client.updateTask(existing, taskBody(task, opts, d)));
      result.updated++;
      continue;
    }
    day[task.key] = await withDurationFallback((d) => client.createTask(taskBody(task, opts, d)));
    result.created++;
  }
  // Keep the map small: only the last 14 dates.
  const dates = Object.keys(result.taskMap).sort();
  for (const d of dates.slice(0, Math.max(0, dates.length - 14))) delete result.taskMap[d];
  return result;
}

/** Retries a request without duration when Todoist rejects it (400). */
async function withDurationFallback<T>(fn: (withDuration: boolean) => Promise<T>): Promise<T> {
  try {
    return await fn(true);
  } catch (e) {
    if (e instanceof TodoistError && e.status === 400) return fn(false);
    throw e;
  }
}

/**
 * Local date and hour in a time zone.
 *
 * @param now Current time.
 * @param timeZone IANA time zone.
 */
export function localTime(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Hours after midnight in which a missed or failed nightly run is retried. */
export const RETRY_UNTIL_HOUR = 6;

/**
 * True when the nightly run is due: the first hourly call after local
 * midnight (00:01), retried until 06:00 if it failed or the scheduler was late.
 */
export function isDue(
  now: Date,
  timeZone: string,
  lastRunDate: string | null,
): { due: boolean; date: string } {
  const { date, hour } = localTime(now, timeZone);
  return { due: hour < RETRY_UNTIL_HOUR && lastRunDate !== date, date };
}

/** One-line summary of a run. */
export function summarize(r: SendResult, total: number): string {
  if (total === 0) return 'Nichts zu lernen heute - keine Aufgaben.';
  return `${r.created} erstellt, ${r.updated} aktualisiert${r.skipped ? `, ${r.skipped} übersprungen (erledigt/gelöscht)` : ''}`;
}
