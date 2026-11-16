/**
 * Statistics derived from review logs and card states: daily counts, streaks,
 * retention, card maturity, due forecast and the daily goal.
 */
import type { CardState, DailyGoalMode, ReviewLog, Timestamp } from '../model/types';
import {
  addStudyDays,
  isoDate,
  parseIsoDate,
  startOfStudyDay,
  studyDaysBetween,
} from '../util/time';

/** Reviews per study day, keyed by ISO date of the study day's start. */
export function reviewsPerDay(
  logs: readonly ReviewLog[],
  dayStartHour: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) {
    const key = isoDate(startOfStudyDay(log.reviewedAt, dayStartHour));
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** Counts for the last `days` study days ending today (oldest first). */
export function lastDaysCounts(
  perDay: ReadonlyMap<string, number>,
  now: Timestamp,
  days: number,
  dayStartHour: number,
): { day: Timestamp; count: number }[] {
  const out: { day: Timestamp; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addStudyDays(now, -i, dayStartHour);
    out.push({ day, count: perDay.get(isoDate(day)) ?? 0 });
  }
  return out;
}

/** Streak information. */
export interface StreakInfo {
  /** Consecutive days (ending today or yesterday) on which the goal was hit. */
  current: number;
  longest: number;
  /** Reviews today. */
  today: number;
  hitToday: boolean;
}

/**
 * Computes the practice streak.
 *
 * @param perDay Reviews per study day.
 * @param goal Reviews needed per day.
 * @param now Current time.
 * @param dayStartHour Study-day boundary.
 */
export function computeStreak(
  perDay: ReadonlyMap<string, number>,
  goal: number,
  now: Timestamp,
  dayStartHour: number,
): StreakInfo {
  const hit = (t: Timestamp): boolean => (perDay.get(isoDate(t)) ?? 0) >= Math.max(1, goal);
  const today = perDay.get(isoDate(startOfStudyDay(now, dayStartHour))) ?? 0;
  const hitToday = today >= Math.max(1, goal);
  // Count backwards from today (or yesterday if today is not hit yet).
  let current = 0;
  let cursor = hitToday ? 0 : -1;
  while (hit(addStudyDays(now, cursor, dayStartHour))) {
    current++;
    cursor--;
  }
  // Longest streak over all recorded days.
  const days = [...perDay.entries()]
    .filter(([, n]) => n >= Math.max(1, goal))
    .map(([d]) => d)
    .sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    // Keys are local calendar dates; compare them at local noon to be DST-safe.
    if (
      prev !== null &&
      studyDaysBetween(parseIsoDate(prev) + 12 * 3600_000, parseIsoDate(d) + 12 * 3600_000, 0) === 1
    )
      run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current), today, hitToday };
}

/**
 * True retention: share of reviews of mature-ish (review-phase) cards that
 * were not forgotten.
 *
 * @param logs Review logs.
 * @param since Only logs at or after this time.
 */
export function retentionRate(logs: readonly ReviewLog[], since = 0): number | null {
  let total = 0;
  let passed = 0;
  for (const log of logs) {
    if (log.reviewedAt < since || log.before.phase !== 'review' || log.mode === 'cram') continue;
    total++;
    if (log.rating > 1) passed++;
  }
  return total === 0 ? null : passed / total;
}

/** Card maturity buckets (Anki/RemNote convention: mature = interval ≥ 21 days). */
export interface CardCounts {
  new: number;
  learning: number;
  young: number;
  mature: number;
  disabled: number;
  total: number;
}

/** Counts cards per maturity bucket. */
export function cardCounts(states: readonly CardState[]): CardCounts {
  const c: CardCounts = {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    disabled: 0,
    total: states.length,
  };
  for (const s of states) {
    if (s.disabled) c.disabled++;
    else if (s.phase === 'new') c.new++;
    else if (s.phase === 'learning' || s.phase === 'relearning') c.learning++;
    else if (s.interval >= 21) c.mature++;
    else c.young++;
  }
  return c;
}

/**
 * Number of reviews due on each of the next `days` study days (today first;
 * overdue cards count for today).
 */
export function dueForecast(
  states: readonly CardState[],
  now: Timestamp,
  days: number,
  dayStartHour: number,
): number[] {
  const out = new Array<number>(days).fill(0);
  for (const s of states) {
    if (s.disabled || s.phase === 'new') continue;
    const idx = Math.max(0, studyDaysBetween(now, s.due, dayStartHour));
    if (idx < days) out[idx]!++;
  }
  return out;
}

/** Average answer time in milliseconds over the most recent `n` logs (default 28 s). */
export function averageAnswerTime(logs: readonly ReviewLog[], n = 200): number {
  const recent = logs.slice(-n).filter((l) => l.durationMs > 0 && l.durationMs < 5 * 60_000);
  if (recent.length === 0) return 28_000;
  return recent.reduce((sum, l) => sum + l.durationMs, 0) / recent.length;
}

/** Ratings distribution of logs. */
export function ratingDistribution(logs: readonly ReviewLog[]): Record<1 | 2 | 3 | 4, number> {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const l of logs) out[l.rating]++;
  return out;
}

/** Daily goal progress. */
export interface DailyGoal {
  /** Cards to get right today. */
  target: number;
  /** Cards answered correctly today (Forgot does not count). */
  done: number;
  /** Cards still to do. */
  remaining: number;
}

/**
 * Computes the daily goal.
 *
 * @param mode Goal mode from the settings.
 * @param queuedForGoal Cards currently queued that count towards the goal.
 * @param correctToday Correct answers today.
 * @param customNumber Target for `custom-number` mode.
 */
export function computeDailyGoal(
  mode: DailyGoalMode,
  queuedForGoal: number,
  correctToday: number,
  customNumber: number,
): DailyGoal {
  if (mode === 'custom-number') {
    return {
      target: customNumber,
      done: correctToday,
      remaining: Math.max(0, customNumber - correctToday),
    };
  }
  return { target: correctToday + queuedForGoal, done: correctToday, remaining: queuedForGoal };
}
