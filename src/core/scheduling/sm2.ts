/**
 * RemNote's variant of the Anki SM-2 algorithm.
 *
 * Phases (see docs/scheduling.md for the full description):
 *
 * 1. **Learning** - new cards walk through fixed `learningSteps` (minutes).
 *    Forgot restarts at the first step, Partially recalled repeats the step,
 *    Recalled with effort advances, Easily recalled graduates immediately.
 * 2. **Review (exponential phase)** - the interval grows multiplicatively:
 *    - Partially recalled: `(I + late/4) × hardInterval`, ease −15 pp
 *    - Recalled with effort: `(I + late/2) × ease`
 *    - Easily recalled: `(I + late) × ease × easyBonus`, ease +15 pp
 *    where `late` are the days the review is overdue ("hardness divider").
 * 3. **Relearning** - Forgot in the review phase multiplies the interval by
 *    `lapseMultiplier`, lowers the ease by 20 pp and walks the
 *    `relearningSteps` before returning to the review phase.
 */
import type { CardState, Rating, Sm2Params, Timestamp } from '../model/types';
import { DAY, MINUTE } from '../util/time';
import { bookkeeping, elapsedDays, fuzzInterval } from './common';
import type { Rng, Scheduler } from './common';

/**
 * Delay for "Partially recalled" while in a step phase: the average of the
 * first two steps on the first step (Anki behaviour), otherwise the current
 * step repeated.
 */
function hardStepDelay(steps: readonly number[], step: number): number {
  if (step === 0 && steps.length > 1) return (steps[0]! + steps[1]!) / 2;
  if (step === 0) return steps[0]! * 1.5;
  return steps[Math.min(step, steps.length - 1)]!;
}

/**
 * Creates an SM-2 scheduler.
 *
 * @param params Algorithm parameters.
 */
export function createSm2Scheduler(params: Sm2Params): Scheduler {
  /** Clamps, applies the interval modifier and fuzz to a review interval. */
  const finalizeInterval = (days: number, rng: Rng | undefined, applyModifier = true): number => {
    let ivl = applyModifier ? days * params.intervalModifier : days;
    ivl = Math.max(1, Math.round(ivl));
    ivl = Math.min(ivl, params.maximumInterval);
    return params.fuzz && rng ? fuzzInterval(ivl, params.maximumInterval, rng) : ivl;
  };

  /** Moves a card into the review phase with the given interval. */
  const graduate = (
    state: CardState,
    days: number,
    now: Timestamp,
    rating: Rating,
    ease = state.ease,
  ): CardState =>
    bookkeeping(
      state,
      { phase: 'review', step: 0, interval: days, ease, due: now + days * DAY },
      rating,
      now,
    );

  /** Schedules the card at a step of the current step phase. */
  const atStep = (
    state: CardState,
    phase: 'learning' | 'relearning',
    step: number,
    delayMin: number,
    now: Timestamp,
    rating: Rating,
  ): CardState => bookkeeping(state, { phase, step, due: now + delayMin * MINUTE }, rating, now);

  /** Handles new and learning cards. */
  const reviewLearning = (
    state: CardState,
    rating: Rating,
    now: Timestamp,
    rng?: Rng,
  ): CardState => {
    const steps = params.learningSteps;
    const step = state.phase === 'new' ? 0 : state.step;
    const ease = state.phase === 'new' ? params.startingEase : state.ease;
    const s = { ...state, ease };
    if (rating === 4)
      return graduate(s, finalizeInterval(params.easyInterval, rng, false), now, rating);
    if (steps.length === 0) {
      // Without learning steps every successful answer graduates immediately.
      if (rating === 1) return atStep(s, 'learning', 0, 1, now, rating);
      return graduate(s, finalizeInterval(params.graduatingInterval, rng, false), now, rating);
    }
    switch (rating) {
      case 1:
        return atStep(s, 'learning', 0, steps[0]!, now, rating);
      case 2:
        return atStep(s, 'learning', step, hardStepDelay(steps, step), now, rating);
      case 3: {
        const next = step + 1;
        if (next >= steps.length)
          return graduate(s, finalizeInterval(params.graduatingInterval, rng, false), now, rating);
        return atStep(s, 'learning', next, steps[next]!, now, rating);
      }
    }
  };

  /** Handles cards relearning after a lapse. */
  const reviewRelearning = (state: CardState, rating: Rating, now: Timestamp): CardState => {
    const steps = params.relearningSteps;
    // The lapse interval was stored in `interval` when the card lapsed.
    const lapseInterval = Math.max(params.minimumLapseInterval, state.interval);
    if (steps.length === 0 || rating === 4) {
      const days = rating === 4 ? lapseInterval + 1 : lapseInterval;
      return graduate(state, days, now, rating);
    }
    switch (rating) {
      case 1:
        return atStep(state, 'relearning', 0, steps[0]!, now, rating);
      case 2:
        return atStep(
          state,
          'relearning',
          state.step,
          hardStepDelay(steps, state.step),
          now,
          rating,
        );
      case 3: {
        const next = state.step + 1;
        if (next >= steps.length) return graduate(state, lapseInterval, now, rating);
        return atStep(state, 'relearning', next, steps[next]!, now, rating);
      }
    }
  };

  /** Handles cards in the exponential review phase. */
  const reviewReview = (state: CardState, rating: Rating, now: Timestamp, rng?: Rng): CardState => {
    const current = Math.max(state.interval, 1);
    const late = state.due > 0 ? Math.max(0, (now - state.due) / DAY) : 0;

    if (rating === 1) {
      const ease = Math.max(params.minimumEase, state.ease - 0.2);
      const lapseInterval = Math.max(
        params.minimumLapseInterval,
        Math.round(current * params.lapseMultiplier),
      );
      const base = { ...state, ease, interval: lapseInterval, lapses: state.lapses + 1 };
      if (params.relearningSteps.length === 0)
        return graduate(base, lapseInterval, now, rating, ease);
      return atStep(base, 'relearning', 0, params.relearningSteps[0]!, now, rating);
    }

    // Compute all three successful intervals so they are strictly ordered.
    const hard = finalizeInterval(
      Math.max((current + late / 4) * params.hardInterval, current + 1),
      undefined,
    );
    const good = Math.max(finalizeInterval((current + late / 2) * state.ease, undefined), hard + 1);
    const easy = Math.max(
      finalizeInterval((current + late) * state.ease * params.easyBonus, undefined),
      good + 1,
    );

    const pick = { 2: hard, 3: good, 4: easy }[rating];
    const days = Math.min(
      params.fuzz && rng ? fuzzInterval(pick, params.maximumInterval, rng) : pick,
      params.maximumInterval,
    );
    const easeDelta = { 2: -0.15, 3: 0, 4: 0.15 }[rating];
    const ease = Math.max(params.minimumEase, state.ease + easeDelta);
    return graduate(state, days, now, rating, ease);
  };

  return {
    algorithm: 'sm2',
    review(state, rating, now, rng) {
      switch (state.phase) {
        case 'new':
        case 'learning':
          return reviewLearning(state, rating, now, rng);
        case 'relearning':
          return reviewRelearning(state, rating, now);
        case 'review':
          return reviewReview(state, rating, now, rng);
      }
    },
    retrievability(state, now) {
      if (state.phase === 'new' || state.lastReview === null) return 1;
      // SM-2 has no memory model; approximate an exponential forgetting curve
      // calibrated so that recall probability is 90 % when the card is due.
      const ivl = Math.max(state.interval, 1 / 1440);
      return Math.pow(0.9, elapsedDays(state, now) / ivl);
    },
  };
}
