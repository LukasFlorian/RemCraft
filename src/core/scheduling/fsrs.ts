/**
 * FSRS-6 (Free Spaced Repetition Scheduler).
 *
 * FSRS models memory with two variables per card - *stability* `S` (days until
 * recall probability falls to 90 %) and *difficulty* `D` (1..10) - and picks
 * the interval at which the predicted recall probability equals the desired
 * retention. The formulas below mirror the reference implementation
 * (open-spaced-repetition/ts-fsrs); the unit tests cross-check against it.
 */
import type { CardState, FsrsParams, Rating, Timestamp } from '../model/types';
import { DAY, MINUTE } from '../util/time';
import { bookkeeping, elapsedDays, fuzzInterval } from './common';
import type { Rng, Scheduler } from './common';

/** Smallest allowed stability. */
export const S_MIN = 0.001;
/** Largest allowed stability (100 years). */
export const S_MAX = 36500;

/** Clamps `x` into `[lo, hi]`. */
const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
/** Rounds to 8 decimals like the reference implementation (keeps results reproducible). */
const round8 = (x: number): number => Math.round(x * 1e8) / 1e8;

/** Memory state of a card. */
export interface MemoryState {
  stability: number;
  difficulty: number;
}

/**
 * The FSRS-6 memory model: pure functions of the 21 weights.
 */
export class FsrsModel {
  /** Model weights w0..w20. */
  readonly w: readonly number[];
  /** Forgetting-curve decay (−w20). */
  readonly decay: number;
  /** Forgetting-curve factor chosen so that R(S, S) = 0.9. */
  readonly factor: number;

  /**
   * @param weights 21 FSRS-6 weights (19-weight FSRS-5 sets are padded).
   */
  constructor(weights: readonly number[]) {
    const w = [...weights];
    // Upgrade FSRS-5 parameter sets: w19 = 0 (no short-term power), w20 = 0.5.
    if (w.length === 19) w.push(0, 0.5);
    this.w = w;
    this.decay = -(w[20] ?? 0.5);
    // Rounded to 8 decimals like the reference implementation.
    this.factor = round8(Math.pow(0.9, 1 / this.decay) - 1);
  }

  /** Weight accessor (keeps formulas readable). */
  private p(i: number): number {
    return this.w[i] ?? 0;
  }

  /** Probability of recall after `t` days with stability `s`. */
  forgettingCurve(t: number, s: number): number {
    return round8(Math.pow(1 + (this.factor * t) / s, this.decay));
  }

  /** Initial stability after the first rating. */
  initStability(g: Rating): number {
    return Math.max(this.p(g - 1), 0.1);
  }

  /** Initial difficulty after the first rating (unclamped). */
  initDifficulty(g: Rating): number {
    return round8(this.p(4) - Math.exp((g - 1) * this.p(5)) + 1);
  }

  /** Difficulty after a review: linear damping plus mean reversion. */
  nextDifficulty(d: number, g: Rating): number {
    const delta = -this.p(6) * (g - 3);
    const damped = d + (delta * (10 - d)) / 9;
    const reverted = round8(this.p(7) * this.initDifficulty(4) + (1 - this.p(7)) * damped);
    return clamp(reverted, 1, 10);
  }

  /** Stability after a successful recall. */
  nextRecallStability(d: number, s: number, r: number, g: Rating): number {
    const hardPenalty = g === 2 ? this.p(15) : 1;
    const easyBonus = g === 4 ? this.p(16) : 1;
    const inc =
      Math.exp(this.p(8)) *
      (11 - d) *
      Math.pow(s, -this.p(9)) *
      (Math.exp((1 - r) * this.p(10)) - 1) *
      hardPenalty *
      easyBonus;
    return clamp(round8(s * (1 + inc)), S_MIN, S_MAX);
  }

  /** Stability after forgetting (lapse). */
  nextForgetStability(d: number, s: number, r: number): number {
    const v =
      this.p(11) *
      Math.pow(d, -this.p(12)) *
      (Math.pow(s + 1, this.p(13)) - 1) *
      Math.exp((1 - r) * this.p(14));
    return clamp(round8(v), S_MIN, S_MAX);
  }

  /** Stability after a same-day (short-term) review. */
  nextShortTermStability(s: number, g: Rating): number {
    const sinc = Math.pow(s, -this.p(19)) * Math.exp(this.p(17) * (g - 3 + this.p(18)));
    // Successful same-day reviews (Hard or better) never decrease stability.
    const masked = g >= 2 ? Math.max(sinc, 1) : sinc;
    return clamp(round8(s * masked), S_MIN, S_MAX);
  }

  /**
   * Next memory state.
   *
   * @param mem Current memory state, or `null` for a new card.
   * @param t Elapsed whole days since the last review.
   * @param g Rating.
   */
  nextState(mem: MemoryState | null, t: number, g: Rating): MemoryState {
    if (mem === null || (mem.stability === 0 && mem.difficulty === 0)) {
      return { stability: this.initStability(g), difficulty: clamp(this.initDifficulty(g), 1, 10) };
    }
    const { stability: s, difficulty: d } = mem;
    const r = this.forgettingCurve(t, s);
    let newS: number;
    if (t === 0) {
      newS = this.nextShortTermStability(s, g);
    } else if (g === 1) {
      const minS = s / Math.exp(this.p(17) * this.p(18));
      newS = clamp(round8(minS), S_MIN, this.nextForgetStability(d, s, r));
    } else {
      newS = this.nextRecallStability(d, s, r, g);
    }
    return { stability: newS, difficulty: this.nextDifficulty(d, g) };
  }

  /**
   * Interval (days, unrounded) at which recall probability drops to `retention`.
   */
  intervalFor(s: number, retention: number): number {
    return (s / this.factor) * (Math.pow(retention, 1 / this.decay) - 1);
  }
}

/**
 * Creates an FSRS-6 scheduler.
 *
 * @param params Weights, desired retention, steps and limits.
 */
export function createFsrsScheduler(params: FsrsParams): Scheduler {
  const model = new FsrsModel(params.weights);

  /** Whole-day review interval for a stability. */
  const interval = (s: number): number =>
    clamp(Math.round(model.intervalFor(s, params.desiredRetention)), 1, params.maximumInterval);

  /** Elapsed whole days used by the memory model. */
  const days = (state: CardState, now: Timestamp): number => Math.floor(elapsedDays(state, now));

  /** Memory of a card, `null` when never reviewed. */
  const memoryOf = (state: CardState): MemoryState | null =>
    state.phase === 'new' || state.stability <= 0
      ? null
      : { stability: state.stability, difficulty: Math.max(1, state.difficulty || 5) };

  /** Puts a card into the review phase. */
  const toReview = (
    state: CardState,
    mem: MemoryState,
    ivl: number,
    now: Timestamp,
    rating: Rating,
    rng?: Rng,
  ): CardState => {
    const fuzzed = params.fuzz && rng ? fuzzInterval(ivl, params.maximumInterval, rng) : ivl;
    return bookkeeping(
      state,
      { ...mem, phase: 'review', step: 0, interval: fuzzed, due: now + fuzzed * DAY },
      rating,
      now,
    );
  };

  /** Keeps a card in a (re)learning step. */
  const toStep = (
    state: CardState,
    mem: MemoryState,
    phase: 'learning' | 'relearning',
    step: number,
    delayMin: number,
    now: Timestamp,
    rating: Rating,
  ): CardState =>
    bookkeeping(
      state,
      { ...mem, phase, step, interval: 0, due: now + delayMin * MINUTE },
      rating,
      now,
    );

  /** Step-phase logic shared by learning and relearning. */
  const stepPhase = (
    state: CardState,
    mem: MemoryState,
    rating: Rating,
    now: Timestamp,
    phase: 'learning' | 'relearning',
    rng?: Rng,
  ): CardState => {
    const steps = phase === 'learning' ? params.learningSteps : params.relearningSteps;
    const step = state.phase === phase ? state.step : 0;
    if (rating === 4 || steps.length === 0) {
      if (rating === 1 && steps.length === 0)
        return toStep(state, mem, phase, 0, params.newCardForgotInterval ?? 1, now, rating);
      return toReview(state, mem, interval(mem.stability), now, rating, rng);
    }
    switch (rating) {
      case 1:
        return toStep(state, mem, phase, 0, steps[0]!, now, rating);
      case 2: {
        const delay =
          step === 0 && steps.length > 1
            ? (steps[0]! + steps[1]!) / 2
            : step === 0
              ? steps[0]! * 1.5
              : steps[step]!;
        return toStep(state, mem, phase, step, delay, now, rating);
      }
      case 3: {
        const next = step + 1;
        if (next >= steps.length)
          return toReview(state, mem, interval(mem.stability), now, rating, rng);
        return toStep(state, mem, phase, next, steps[next]!, now, rating);
      }
    }
  };

  return {
    algorithm: 'fsrs',
    review(state, rating, now, rng) {
      const t = days(state, now);
      const prevMem = memoryOf(state);
      const mem = model.nextState(prevMem, t, rating);
      switch (state.phase) {
        case 'new':
        case 'learning':
          return stepPhase(state, mem, rating, now, 'learning', rng);
        case 'relearning':
          return stepPhase(state, mem, rating, now, 'relearning', rng);
        case 'review': {
          if (rating === 1) {
            const lapsed = { ...state, lapses: state.lapses + 1 };
            return stepPhase(lapsed, mem, 1, now, 'relearning', rng);
          }
          // Strictly ordered intervals for Hard < Good < Easy.
          const ivl = (g: Rating): number => interval(model.nextState(prevMem, t, g).stability);
          let hard = ivl(2);
          let good = ivl(3);
          hard = Math.min(hard, good);
          good = Math.max(good, hard + 1);
          const easy = Math.max(ivl(4), good + 1);
          const pick = { 2: hard, 3: good, 4: easy }[rating];
          return toReview(state, mem, Math.min(pick, params.maximumInterval), now, rating, rng);
        }
      }
    },
    retrievability(state, now) {
      if (state.phase === 'new' || state.stability <= 0) return 1;
      return model.forgettingCurve(elapsedDays(state, now), state.stability);
    },
  };
}
