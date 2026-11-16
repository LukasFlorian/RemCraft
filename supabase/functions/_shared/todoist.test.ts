import { isDue, localTime, sendDailyTasks, TodoistClient } from './todoist';
import type { FetchFn, PlannedTask } from './todoist';

/** Minimal fake of the Todoist API v1. */
function fakeTodoist(opts: { rejectDuration?: boolean } = {}): {
  fetch: FetchFn;
  tasks: Map<string, Record<string, unknown>>;
  projects: { id: string; name: string }[];
} {
  const tasks = new Map<string, Record<string, unknown>>();
  const projects = [{ id: 'p1', name: 'Inbox' }];
  let n = 0;
  const reply = (status: number, body: unknown) => ({
    ok: status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const fetch: FetchFn = async (url, init) => {
    const path = url.replace('https://api.todoist.com/api/v1', '');
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (path.startsWith('/projects') && init?.method === 'GET')
      return reply(200, { results: projects, next_cursor: null });
    if (path === '/projects') {
      projects.push({ id: `p${projects.length + 1}`, name: String(body.name) });
      return reply(200, projects[projects.length - 1]);
    }
    if (path === '/tasks') {
      if (opts.rejectDuration && body.duration)
        return reply(400, { error: 'duration needs a time' });
      const id = `t${++n}`;
      tasks.set(id, { id, ...body });
      return reply(200, tasks.get(id));
    }
    const m = /^\/tasks\/(\w+)$/.exec(path);
    if (m) {
      const task = tasks.get(m[1]!);
      if (!task) return reply(404, {});
      if (init?.method === 'GET') return reply(200, task);
      Object.assign(task, body);
      return reply(200, task);
    }
    return reply(404, {});
  };
  return { fetch, tasks, projects };
}

const task = (key: string, minutes: number): PlannedTask => ({
  key,
  date: '2026-11-17',
  content: `${key} lernen (~${minutes} min)`,
  description: 'x',
  minutes,
});

describe('Todoist daily tasks', () => {
  it('creates one task per course with duration, then updates instead of duplicating', async () => {
    const api = fakeTodoist();
    const client = new TodoistClient('token', api.fetch);
    const projectId = await client.ensureProject('RemCraft');
    expect(api.projects.map((p) => p.name)).toContain('RemCraft');
    const opts = { projectId, labels: ['lernen'], priority: 2 };
    const first = await sendDailyTasks(client, [task('ML', 25), task('BWL', 10)], opts, {});
    expect(first.created).toBe(2);
    const created = [...api.tasks.values()];
    expect(created[0]).toMatchObject({
      due_date: '2026-11-17',
      duration: 25,
      duration_unit: 'minute',
      project_id: projectId,
      labels: ['lernen'],
    });

    const second = await sendDailyTasks(client, [task('ML', 30)], opts, first.taskMap);
    expect(second).toMatchObject({ created: 0, updated: 1 });
    expect(api.tasks.size).toBe(2);
    expect(api.tasks.get(first.taskMap['2026-11-17']!.ML!)!.duration).toBe(30);
    // The project is found again by name (no duplicate).
    expect(await client.ensureProject('remcraft')).toBe(projectId);
  });

  it('skips tasks the user completed or deleted', async () => {
    const api = fakeTodoist();
    const client = new TodoistClient('token', api.fetch);
    const first = await sendDailyTasks(
      client,
      [task('ML', 25)],
      { projectId: null, labels: [], priority: 1 },
      {},
    );
    const id = first.taskMap['2026-11-17']!.ML!;
    api.tasks.get(id)!.checked = true;
    const again = await sendDailyTasks(
      client,
      [task('ML', 25)],
      { projectId: null, labels: [], priority: 1 },
      first.taskMap,
    );
    expect(again).toMatchObject({ created: 0, updated: 0, skipped: 1 });
  });

  it('falls back to no duration when Todoist rejects it', async () => {
    const api = fakeTodoist({ rejectDuration: true });
    const res = await sendDailyTasks(
      new TodoistClient('t', api.fetch),
      [task('ML', 25)],
      { projectId: null, labels: [], priority: 1 },
      {},
    );
    expect(res.created).toBe(1);
    expect([...api.tasks.values()][0]!.duration).toBeUndefined();
  });

  it('runs once on the first call after local midnight', () => {
    // 23:01 UTC = 00:01 in Berlin (winter time).
    const at = new Date('2026-11-16T23:01:00Z');
    expect(localTime(at, 'Europe/Berlin')).toEqual({ date: '2026-11-17', hour: 0 });
    expect(isDue(at, 'Europe/Berlin', '2026-11-16')).toEqual({ due: true, date: '2026-11-17' });
    expect(isDue(at, 'Europe/Berlin', '2026-11-17').due).toBe(false);
    expect(isDue(at, 'America/New_York', null).due).toBe(false); // 18:01 there
  });
});
