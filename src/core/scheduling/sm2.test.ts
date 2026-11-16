import { createCardState, DEFAULT_SM2_PARAMS } from '../model/factories';
import type { CardState, Rating } from '../model/types';
import { DAY, MINUTE } from '../util/time';
import { fuzzInterval } from './common';
import { createSm2Scheduler } from './sm2';

const params = { ...DEFAULT_SM2_PARAMS, fuzz: false };
const sm2 = createSm2Scheduler(params);
const t0 = new Date(2026, 0, 1, 10).getTime();

/** Answers a sequence of ratings, each exactly when the card is due. */
function run(ratings: Rating[]): CardState {
  let s = createCardState('c', 'r', t0);
  let now = t0;
  for (const r of ratings) {
    s = sm2.review(s, r, now);
    now = s.due;
  }
  return s;
}

describe('SM-2 learning phase', () => {
  it('Forgot restarts at the first step', () => {
    const s = run([3, 1]);
    expect(s.phase).toBe('learning');
    expect(s.step).toBe(0);
  });
  it('Recalled with effort advances through the steps and graduates', () => {
    const s1 = run([3]);
    expect(s1).toMatchObject({ phase: 'learning', step: 1 });
    expect(s1.due - t0).toBe(10 * MINUTE);
    const s2 = run([3, 3]);
    expect(s2).toMatchObject({ phase: 'review', interval: 1, ease: 2.3 });
  });
  it('Easily recalled graduates immediately with the easy interval', () => {
    expect(run([4])).toMatchObject({ phase: 'review', interval: 4 });
  });
  it('Partially recalled repeats the step (average of the first two steps)', () => {
    const s = run([2]);
    expect(s.due - t0).toBe(5.5 * MINUTE);
  });
});

describe('SM-2 review phase', () => {
  it('multiplies by the ease on Recalled with effort', () => {
    // graduate with 1 day; then good = max(round(1 × 2.3), hard + 1) = max(2, 3) = 3
    const s = run([3, 3, 3]);
    expect(s.interval).toBe(3);
  });
  it('applies the hard factor and adjusts the ease', () => {
    const base = run([4]); // interval 4, ease 2.3
    const hard = sm2.review(base, 2, base.due);
    expect(hard.interval).toBe(Math.max(Math.round(4 * 1.2), 5));
    expect(hard.ease).toBeCloseTo(2.15);
    const easy = sm2.review(base, 4, base.due);
    expect(easy.interval).toBe(Math.round(4 * 2.3 * 1.3));
    expect(easy.ease).toBeCloseTo(2.45);
  });
  it('adds the late bonus divided by the hardness divider', () => {
    const base = run([4]);
    const late = sm2.review(base, 3, base.due + 4 * DAY);
    expect(late.interval).toBe(Math.round((4 + 4 / 2) * 2.3));
  });
  it('lapses into relearning with reduced interval and ease', () => {
    const base = sm2.review(run([4]), 4, run([4]).due); // interval 12
    const lapsed = sm2.review(base, 1, base.due);
    expect(lapsed).toMatchObject({ phase: 'relearning', lapses: 1, interval: 1 });
    expect(lapsed.ease).toBeCloseTo(base.ease - 0.2);
    const back = sm2.review(lapsed, 3, lapsed.due);
    expect(back).toMatchObject({ phase: 'review', interval: 1 });
  });
  it('keeps intervals strictly ordered and capped', () => {
    const capped = createSm2Scheduler({ ...params, maximumInterval: 10 });
    let s = run([4]);
    s = { ...s, interval: 9 };
    expect(capped.review(s, 4, s.due).interval).toBeLessThanOrEqual(10 + 2);
  });
  it('never lowers ease below the minimum', () => {
    let s = run([4]);
    for (let i = 0; i < 20; i++) s = sm2.review(s, 2, s.due);
    expect(s.ease).toBeCloseTo(params.minimumEase);
  });
});

describe('fuzz', () => {
  it('keeps short intervals and stays within bounds', () => {
    expect(fuzzInterval(2, 100, () => 0)).toBe(2);
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const v = fuzzInterval(30, 100, () => r);
      expect(v).toBeGreaterThanOrEqual(26);
      expect(v).toBeLessThanOrEqual(34);
    }
    expect(fuzzInterval(30, 100, () => 0.5)).toBe(30);
  });
});
