import { createCardState } from '../model/factories';
import type { ReviewLog } from '../model/types';
import { addStudyDays, DAY } from '../util/time';
import {
  averageAnswerTime,
  cardCounts,
  computeDailyGoal,
  computeStreak,
  dueForecast,
  lastDaysCounts,
  retentionRate,
  reviewsPerDay,
} from './stats';

const NOW = new Date(2026, 10, 16, 12).getTime();

/** Builds a log entry. */
function log(t: number, rating: 1 | 2 | 3 | 4 = 3, phase: 'new' | 'review' = 'review'): ReviewLog {
  const before = { ...createCardState('c', 'r'), phase };
  return {
    id: String(t),
    cardId: 'c',
    remId: 'r',
    rating,
    reviewedAt: t,
    durationMs: 10_000,
    mode: 'srs',
    algorithm: 'sm2',
    before,
    intervalAfter: 1,
    dueAfter: t + DAY,
    createdAt: t,
    updatedAt: t,
  };
}

describe('stats', () => {
  const logs = [
    ...Array.from({ length: 10 }, (_, i) => log(addStudyDays(NOW, -2) + 6 * 3600_000 + i)),
    ...Array.from({ length: 10 }, (_, i) =>
      log(addStudyDays(NOW, -1) + 6 * 3600_000 + i, i === 0 ? 1 : 3),
    ),
    ...Array.from({ length: 3 }, (_, i) => log(NOW - i)),
  ];
  const perDay = reviewsPerDay(logs, 4);

  it('counts per day', () => {
    expect(lastDaysCounts(perDay, NOW, 3, 4).map((d) => d.count)).toEqual([10, 10, 3]);
  });
  it('computes streaks', () => {
    expect(computeStreak(perDay, 10, NOW, 4)).toEqual({
      current: 2,
      longest: 2,
      today: 3,
      hitToday: false,
    });
    expect(computeStreak(perDay, 3, NOW, 4)).toMatchObject({ current: 3, hitToday: true });
  });
  it('computes retention, counts, forecast and timing', () => {
    expect(retentionRate(logs)).toBeCloseTo(22 / 23);
    const states = [
      createCardState('a', 'r'),
      { ...createCardState('b', 'r'), phase: 'review' as const, interval: 30, due: NOW + 2 * DAY },
      { ...createCardState('c', 'r'), phase: 'review' as const, interval: 3, due: NOW - DAY },
      { ...createCardState('d', 'r'), phase: 'learning' as const, due: NOW },
    ];
    expect(cardCounts(states)).toEqual({
      new: 1,
      learning: 1,
      young: 1,
      mature: 1,
      disabled: 0,
      total: 4,
    });
    expect(dueForecast(states, NOW, 4, 4)).toEqual([2, 0, 1, 0]);
    expect(averageAnswerTime(logs)).toBe(10_000);
    expect(averageAnswerTime([])).toBe(28_000);
  });
  it('computes the daily goal', () => {
    expect(computeDailyGoal('exam-and-active', 20, 5, 0)).toEqual({
      target: 25,
      done: 5,
      remaining: 20,
    });
    expect(computeDailyGoal('custom-number', 99, 5, 30)).toEqual({
      target: 30,
      done: 5,
      remaining: 25,
    });
  });
});
