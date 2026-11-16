/**
 * Types and helpers shared by all scheduling algorithms.
 */
import type { CardState, Rating, SchedulerAlgorithm, Timestamp } from '../model/types';
import { DAY } from '../util/time';

/** Random number generator in [0, 1); injectable for deterministic tests. */
export type Rng = () => number;

/** A spaced-repetition algorithm. */
export interface Scheduler {
  readonly algorithm: SchedulerAlgorithm;
  /**
   * Computes the state after answering a card.
   *
   * @param state Current state (not mutated).
   * @param rating The user's self-assessment.
   * @param now Time of the review.
   * @param rng Random source for interval fuzzing.
   */
  review(state: CardState, rating: Rating, now: Timestamp, rng?: Rng): CardState;
  /**
   * Estimated probability of recalling the card at `now` (1 for new cards).
   */
  retrievability(state: CardState, now: Timestamp): number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Fuzz ranges used by Anki and FSRS: wider relative fuzz for short intervals. */
const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
] as const;

/**
 * Applies interval fuzz so that cards learned together do not stay clumped.
 *
 * @param intervalDays Interval in whole days.
 * @param maximum Maximum interval.
 * @param rng Random source; `0.5` yields the unfuzzed interval.
 */
export function fuzzInterval(intervalDays: number, maximum: number, rng: Rng): number {
  if (intervalDays < 2.5) return intervalDays;
  let delta = 1;
  for (const r of FUZZ_RANGES)
    delta += r.factor * Math.max(Math.min(intervalDays, r.end) - r.start, 0);
  const min = Math.max(2, Math.round(intervalDays - delta));
  const max = Math.min(Math.round(intervalDays + delta), maximum);
  // rng() == 0.5 maps to the centre, i.e. (approximately) the original interval.
  const fuzzed = Math.round(intervalDays + (rng() - 0.5) * 2 * delta);
  return Math.min(Math.max(fuzzed, min), max);
}

/** Days elapsed since the last review (fractional, never negative). */
export function elapsedDays(state: CardState, now: Timestamp): number {
  return state.lastReview === null ? 0 : Math.max(0, (now - state.lastReview) / DAY);
}

/** Common bookkeeping applied by every algorithm after a review. */
export function bookkeeping(
  prev: CardState,
  next: Partial<CardState>,
  rating: Rating,
  now: Timestamp,
): CardState {
  return {
    ...prev,
    ...next,
    reps: prev.reps + 1,
    streak: rating === 1 ? 0 : prev.streak + 1,
    lastReview: now,
    updatedAt: now,
  };
}
