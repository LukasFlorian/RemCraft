/**
 * Scheduler abstraction (strategy pattern).
 *
 * A scheduler is a *pure* function from (card state, rating, time) to the next
 * card state. Everything else - queues, exams, persistence - is layered on top
 * and works with any algorithm. Adding an algorithm means implementing this
 * interface and registering it in {@link createScheduler}.
 */
import type { CardState, Rating, SchedulerConfig, Timestamp } from '../model/types';
import type { Rng, Scheduler } from './common';
import { createFsrsScheduler } from './fsrs';
import { createSm2Scheduler } from './sm2';

/** All ratings in ascending order. */
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

/** RemNote's labels of the four ratings. */
export const RATING_LABELS: Readonly<Record<Rating, string>> = {
  1: 'Forgot',
  2: 'Partially recalled',
  3: 'Recalled with effort',
  4: 'Easily recalled',
};

/**
 * Instantiates the scheduler described by a configuration.
 *
 * @param config Scheduler configuration (algorithm + parameters).
 */
export function createScheduler(config: SchedulerConfig): Scheduler {
  switch (config.algorithm) {
    case 'fsrs':
      return createFsrsScheduler(config.fsrs);
    case 'sm2':
    default:
      return createSm2Scheduler(config.sm2);
  }
}

/**
 * Previews the next state for every rating (used to label the answer buttons
 * with intervals). Fuzz is disabled so previews are stable.
 */
export function previewRatings(scheduler: Scheduler, state: CardState, now: Timestamp): Record<Rating, CardState> {
  const noFuzz: Rng = () => 0.5;
  return {
    1: scheduler.review(state, 1, now, noFuzz),
    2: scheduler.review(state, 2, now, noFuzz),
    3: scheduler.review(state, 3, now, noFuzz),
    4: scheduler.review(state, 4, now, noFuzz),
  };
}

export type { Rng, Scheduler } from './common';
