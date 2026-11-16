import {
  buildDailyTasks,
  courseOf,
  DEFAULT_ESTIMATE,
  estimateFromLogs,
  estimateMinutes,
} from '@core/planning/daily';
import { rt } from '@core/richtext/ops';
import { DAY } from '@core/util/time';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';
import { forecastDailyPlans } from './integrations';

/** An app with two courses: ML (12 new cards, exam in 5 days) and BWL (3 new cards). */
async function setup(): Promise<{ app: RemCraftApp; ml: string; bwl: string }> {
  const app = await RemCraftApp.create({
    persistence: new MemoryAdapter(),
    backend: null,
    seed: false,
  });
  const ml = app.rems.createFolder(null, 'ML');
  const deck = app.rems.createDocument(ml.id, 'VL 1');
  for (let i = 0; i < 12; i++)
    app.rems.create(
      { parentId: deck.id },
      { text: rt(`Frage ${i}`), back: rt('A'), direction: 'forward' },
    );
  const bwl = app.rems.createDocument(null, 'BWL');
  for (let i = 0; i < 3; i++)
    app.rems.create(
      { parentId: bwl.id },
      { text: rt(`B${i}`), back: rt('A'), direction: 'forward' },
    );
  return { app, ml: ml.id, bwl: bwl.id };
}

describe('daily study tasks', () => {
  it('groups cards by course (nearest folder, else document)', async () => {
    const { app, ml, bwl } = await setup();
    const card = app.store
      .all('rems')
      .find((r) => r.parentId && app.store.get(r.parentId)?.parentId === ml)!;
    expect(courseOf(app.store, card.id)?.id).toBe(ml);
    const b = app.store.children(bwl)[0]!;
    expect(courseOf(app.store, b.id)).toEqual({ id: bwl, title: 'BWL' });
    app.dispose();
  });

  it('plans one task per course with exam quotas and a duration', async () => {
    const { app, ml } = await setup();
    app.exams.create({ name: 'ML-Klausur', date: Date.now() + 5 * DAY, scope: [ml] });
    const [today, tomorrow] = forecastDailyPlans(app.store, Date.now(), 2);
    const mlTask = today!.tasks.find((t) => t.key === ml)!;
    expect(mlTask.newCards).toBeGreaterThan(0);
    expect(mlTask.examCards).toBe(mlTask.newCards + mlTask.reviews);
    expect(mlTask.exams).toEqual(['ML-Klausur']);
    expect(mlTask.minutes % 5).toBe(0);
    expect(mlTask.content).toBe(`ML lernen (~${mlTask.minutes} min)`);
    expect(today!.tasks.map((t) => t.course).sort()).toEqual(['BWL', 'ML']);
    expect(tomorrow!.date > today!.date).toBe(true);
    app.dispose();
  });

  it('estimates durations and learns answer times from logs', () => {
    expect(estimateMinutes(0, 0, DEFAULT_ESTIMATE)).toBe(5);
    // 20 reviews * 1.2 * 15 s = 6 min -> 10; 10 new * 3 * 15 s = 7.5 min.
    expect(estimateMinutes(20, 10, DEFAULT_ESTIMATE)).toBe(15);
    const logs = Array.from({ length: 20 }, (_, i) => ({
      cardId: `c${i}`,
      reviewedAt: i * 1000,
      durationMs: 6000,
      before: { phase: 'review' },
    }));
    const est = estimateFromLogs(logs as never);
    expect(est.secondsPerAnswer).toBeCloseTo(6);
    expect(est.answersPerReview).toBe(1);
  });

  it('skips cards outside any course', () => {
    const tasks = buildDailyTasks([{ cardId: 'x', bucket: 'none-new' }], {
      date: '2026-01-01',
      remOf: () => undefined,
      groupOf: () => undefined,
      examName: () => undefined,
      estimate: DEFAULT_ESTIMATE,
    });
    expect(tasks).toEqual([]);
  });
});
