/**
 * Scheduler abstraction (strategy pattern).
 *
 * A scheduler is a *pure* function from (card state, rating, time) to the next
 * card state. Everything else - queues, exams, persistence - is layered on top
 * and works with any algorithm. Adding an algorithm means implementing this
 * interface and registering it in `SCHEDULERS` (see `registry.ts`).
 */
import type { CardState, Rating, SchedulerConfig, Timestamp } from '../model/types';
import type { Rng, Scheduler } from './common';
import { SCHEDULERS } from './registry';
import { t } from '@core/i18n';

/** All ratings in ascending order. */
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

/** RemNote's labels of the four ratings. */
export const RATING_LABELS: Readonly<Record<Rating, string>> = {
  1: t('Forgot'),
  2: t('Partially recalled'),
  3: t('Recalled with effort'),
  4: t('Easily recalled'),
};

/**
 * Instantiates the scheduler described by a configuration.
 *
 * @param config Scheduler configuration (algorithm + parameters).
 */
export function createScheduler(config: SchedulerConfig): Scheduler {
  // Unknown algorithms (e.g. a plugin not loaded on this device) fall back to SM-2.
  return (SCHEDULERS.get(config.algorithm) ?? SCHEDULERS.require('sm2')).create(config);
}

/**
 * Previews the next state for every rating (used to label the answer buttons
 * with intervals). Fuzz is disabled so previews are stable.
 */
export function previewRatings(
  scheduler: Scheduler,
  state: CardState,
  now: Timestamp,
): Record<Rating, CardState> {
  const noFuzz: Rng = () => 0.5;
  return {
    1: scheduler.review(state, 1, now, noFuzz),
    2: scheduler.review(state, 2, now, noFuzz),
    3: scheduler.review(state, 3, now, noFuzz),
    4: scheduler.review(state, 4, now, noFuzz),
  };
}

export type { Rng, Scheduler } from './common';
