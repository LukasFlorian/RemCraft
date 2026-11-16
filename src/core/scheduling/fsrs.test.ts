import { FSRSAlgorithm, generatorParameters } from 'ts-fsrs';
import { createCardState, DEFAULT_FSRS_PARAMS, DEFAULT_FSRS_WEIGHTS } from '../model/factories';
import type { Rating } from '../model/types';
import { DAY, MINUTE } from '../util/time';
import { createFsrsScheduler, FsrsModel } from './fsrs';

describe('FsrsModel (cross-checked against ts-fsrs)', () => {
  const ours = new FsrsModel(DEFAULT_FSRS_WEIGHTS);
  const ref = new FSRSAlgorithm(generatorParameters({ enable_short_term: true }));

  it('matches initial states', () => {
    for (const g of [1, 2, 3, 4] as Rating[]) {
      const a = ours.nextState(null, 0, g);
      const b = ref.next_state(null, 0, g);
      expect(a.stability).toBeCloseTo(b.stability, 6);
      expect(a.difficulty).toBeCloseTo(b.difficulty, 6);
    }
  });

  it('matches subsequent states for a grid of inputs', () => {
    for (const s of [0.5, 3, 20, 200]) {
      for (const d of [1.5, 5, 9]) {
        for (const t of [0, 1, 4, 30, 400]) {
          for (const g of [1, 2, 3, 4] as Rating[]) {
            const a = ours.nextState({ stability: s, difficulty: d }, t, g);
            const b = ref.next_state({ stability: s, difficulty: d }, t, g);
            // Relative tolerance: tiny float differences grow with stability.
            expect(Math.abs(a.stability - b.stability) / b.stability).toBeLessThan(1e-7);
            expect(a.difficulty).toBeCloseTo(b.difficulty, 6);
          }
        }
      }
    }
  });

  it('matches the forgetting curve and R(S,S)=0.9', () => {
    expect(ours.forgettingCurve(5, 3)).toBeCloseTo(ref.forgetting_curve(5, 3), 6);
    expect(ours.forgettingCurve(12, 12)).toBeCloseTo(0.9, 9);
    expect(ours.intervalFor(12, 0.9)).toBeCloseTo(12, 6);
  });
});

describe('FSRS scheduler', () => {
  const sched = createFsrsScheduler({ ...DEFAULT_FSRS_PARAMS, fuzz: false });
  const t0 = new Date(2026, 0, 1, 10).getTime();

  it('walks learning steps then graduates', () => {
    let s = createCardState('c', 'r', t0);
    s = sched.review(s, 3, t0);
    expect(s.phase).toBe('learning');
    expect(s.due).toBe(t0 + 10 * MINUTE);
    s = sched.review(s, 3, t0 + 10 * MINUTE);
    expect(s.phase).toBe('review');
    expect(s.interval).toBeGreaterThanOrEqual(1);
  });

  it('orders review intervals hard < good < easy and lapses to relearning', () => {
    let s = createCardState('c', 'r', t0);
    s = sched.review(s, 4, t0);
    const now = s.due;
    const [h, g, e] = ([2, 3, 4] as Rating[]).map((r) => sched.review(s, r, now).interval);
    expect(h!).toBeLessThan(g!);
    expect(g!).toBeLessThan(e!);
    const lapsed = sched.review(s, 1, now);
    expect(lapsed.phase).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(s.stability);
  });

  it('reports retrievability ~ desired retention when due', () => {
    let s = createCardState('c', 'r', t0);
    s = sched.review(s, 4, t0);
    expect(sched.retrievability(s, t0 + s.interval * DAY)).toBeGreaterThan(0.85);
    expect(sched.retrievability(createCardState('n', 'r'), t0)).toBe(1);
  });
});
