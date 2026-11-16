/**
 * RemNote's legacy "Exponential" scheduler: fixed, exponentially growing
 * intervals without per-card ease. Kept as a simple third algorithm (and as an
 * example of a scheduler plugin).
 */
import type { CardState, Rating } from '../model/types';
import { DAY, MINUTE } from '../util/time';
import { bookkeeping, elapsedDays } from './common';
import type { Scheduler } from './common';

/** Interval growth factor per rating (Forgot resets). */
const FACTORS: Record<Exclude<Rating, 1>, number> = { 2: 1.5, 3: 2.5, 4: 4 };

/** Creates the exponential scheduler. */
export function createExponentialScheduler(): Scheduler {
  return {
    algorithm: 'exponential',
    review(state: CardState, rating: Rating, now: number): CardState {
      if (rating === 1) {
        const lapsed = state.phase === 'review' ? state.lapses + 1 : state.lapses;
        return bookkeeping(state, { phase: 'relearning', step: 0, interval: 0, lapses: lapsed, due: now + 10 * MINUTE }, rating, now);
      }
      const base = Math.max(state.interval, rating === 4 ? 2 : 1);
      const days = state.phase === 'review' ? Math.round(base * FACTORS[rating]) : rating === 4 ? 4 : 1;
      return bookkeeping(state, { phase: 'review', step: 0, interval: days, due: now + days * DAY }, rating, now);
    },
    retrievability(state, now) {
      if (state.phase === 'new' || state.lastReview === null) return 1;
      return Math.pow(0.9, elapsedDays(state, now) / Math.max(state.interval, 1 / 1440));
    },
  };
}
