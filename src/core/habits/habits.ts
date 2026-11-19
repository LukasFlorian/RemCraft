/**
 * Habit logic: which days count as done, goals per day/week/month, streaks,
 * completion rate and monthly statistics. Pure functions over a habit, its
 * entries and (for `flashcards` habits) the number of reviews per day.
 */
import type { Habit, HabitEntry, HabitPeriod } from '../model/types';
import { addDays, dayRange, nextPeriod, periodStart } from './days';
import type { DayKey } from './days';

/** Everything needed to evaluate a habit. */
export interface HabitData {
  habit: Habit;
  /** Entries by day. */
  entries: ReadonlyMap<DayKey, HabitEntry>;
  /** Flashcard reviews per day (only used by `flashcards` habits). */
  reviews?: ReadonlyMap<DayKey, number>;
  /** Today (days after it are never done). */
  today: DayKey;
}

/** Id of the entry of a habit on a day. */
export function entryId(habitId: string, day: DayKey): string {
  return `${habitId}:${day}`;
}

/**
 * Recorded value of a day: the entry value, or the number of reviews for
 * `flashcards` habits.
 *
 * Args:
 *   d: Habit data.
 *   day: The day.
 */
export function dayValue(d: HabitData, day: DayKey): number {
  if (d.habit.tracking === 'flashcards') return d.reviews?.get(day) ?? 0;
  return d.entries.get(day)?.value ?? 0;
}

/**
 * First day the habit is evaluated from: its start day, or an earlier entry.
 *
 * Args:
 *   d: Habit data.
 */
export function firstDay(d: HabitData): DayKey {
  let first = d.habit.startDay;
  for (const day of d.entries.keys()) if (day < first && d.entries.get(day)!.value > 0) first = day;
  return first;
}

/** Value a day needs (at least something above zero). */
function targetOf(habit: Habit): number {
  return habit.tracking === 'check' || !(habit.target > 0) ? 1 : habit.target;
}

/**
 * Whether a day counts as done.
 *
 * Build habits: the value reaches the target. Quit habits: every day from the
 * start up to today without a recorded slip.
 *
 * Args:
 *   d: Habit data.
 *   day: The day.
 */
export function isDone(d: HabitData, day: DayKey): boolean {
  if (day > d.today) return false;
  if (d.habit.kind === 'quit') return day >= d.habit.startDay && dayValue(d, day) <= 0;
  return dayValue(d, day) >= targetOf(d.habit);
}

/**
 * Progress of today towards the target, 0…1 (for progress rings).
 *
 * Args:
 *   d: Habit data.
 *   day: The day.
 */
export function dayProgress(d: HabitData, day: DayKey): number {
  if (d.habit.kind === 'quit') return isDone(d, day) ? 1 : 0;
  return Math.min(1, dayValue(d, day) / targetOf(d.habit));
}

/**
 * Done days within a period.
 *
 * Args:
 *   d: Habit data.
 *   start: First day of the period.
 *   period: Period kind.
 */
export function doneInPeriod(d: HabitData, start: DayKey, period: HabitPeriod): number {
  const end = addDays(nextPeriod(start, period), -1);
  return dayRange(start, end < d.today ? end : d.today).filter((k) => isDone(d, k)).length;
}

/** Goal of a habit, with `times` limited to what fits in the period. */
function goalOf(d: HabitData): { period: HabitPeriod; times: number } {
  const { period, times } = d.habit.goal;
  const max = period === 'day' ? 1 : period === 'week' ? 7 : 31;
  return { period, times: Math.min(max, Math.max(1, Math.round(times))) };
}

/** One goal period and whether its goal was reached. */
export interface PeriodResult {
  start: DayKey;
  done: number;
  met: boolean;
  /** The period containing today (still running). */
  current: boolean;
}

/**
 * Goal periods from the first day up to the current one.
 *
 * Args:
 *   d: Habit data.
 */
export function periods(d: HabitData): PeriodResult[] {
  const { period, times } = goalOf(d);
  const last = periodStart(d.today, period);
  const out: PeriodResult[] = [];
  for (let s = periodStart(firstDay(d), period); s <= last; s = nextPeriod(s, period)) {
    const done = doneInPeriod(d, s, period);
    out.push({ start: s, done, met: done >= times, current: s === last });
  }
  return out;
}

/** Streaks in goal periods (days, weeks or months). */
export interface Streaks {
  current: number;
  best: number;
  period: HabitPeriod;
}

/**
 * Current and best streak of met goal periods. A running period that is not
 * met yet does not break the current streak.
 *
 * Args:
 *   d: Habit data.
 */
export function streaks(d: HabitData): Streaks {
  const list = periods(d);
  let best = 0;
  let run = 0;
  for (const p of list) {
    if (p.met) run++;
    else if (!p.current) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best, period: goalOf(d).period };
}

/**
 * Share of met goal periods in percent (the running period only counts once
 * it is met).
 *
 * Args:
 *   d: Habit data.
 */
export function completionRate(d: HabitData): number {
  const list = periods(d).filter((p) => p.met || !p.current);
  if (list.length === 0) return 0;
  return Math.round((100 * list.filter((p) => p.met).length) / list.length);
}

/** Totals of a habit. */
export interface HabitTotals {
  /** Done days. */
  completions: number;
  /** Sum of recorded values (count, measure, flashcards). */
  total: number;
}

/**
 * Done days and summed values from the first day up to today.
 *
 * Args:
 *   d: Habit data.
 */
export function totals(d: HabitData): HabitTotals {
  let completions = 0;
  let total = 0;
  for (const day of dayRange(firstDay(d), d.today)) {
    if (isDone(d, day)) completions++;
    total += dayValue(d, day);
  }
  return { completions, total };
}

/**
 * Done days per month of a year (index 0 = January).
 *
 * Args:
 *   d: Habit data.
 *   year: Calendar year.
 */
export function completionsPerMonth(d: HabitData, year: number): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const day of dayRange(`${year}-01-01`, `${year}-12-31`)) {
    if (day > d.today) break;
    if (isDone(d, day)) counts[Number(day.slice(5, 7)) - 1]!++;
  }
  return counts;
}

/**
 * Next value when the habit is tapped for a day: `check` toggles, `count`
 * adds one until the target and then starts over at 0, quit habits toggle a
 * slip. `measure` and `flashcards` are not tapped (they need input or are
 * automatic) and return `null`.
 *
 * Args:
 *   d: Habit data.
 *   day: The day.
 */
export function tapValue(d: HabitData, day: DayKey): number | null {
  const value = d.entries.get(day)?.value ?? 0;
  const { tracking, kind, target } = d.habit;
  if (kind === 'quit' || tracking === 'check') return value > 0 ? 0 : 1;
  if (tracking === 'count') return value >= target ? 0 : value + 1;
  return null;
}

/**
 * Human-readable goal, e.g. "Täglich", "3× pro Woche".
 *
 * Args:
 *   habit: The habit.
 */
export function goalLabel(habit: Habit): string {
  const { period, times } = habit.goal;
  if (period === 'day') return 'Täglich';
  return `${times}× pro ${period === 'week' ? 'Woche' : 'Monat'}`;
}

/**
 * Unit of streaks, singular/plural ("Tag"/"Tage", …).
 *
 * Args:
 *   period: Goal period.
 *   n: Count.
 */
export function streakUnit(period: HabitPeriod, n: number): string {
  const one = n === 1;
  if (period === 'day') return one ? 'Tag' : 'Tage';
  if (period === 'week') return one ? 'Woche' : 'Wochen';
  return one ? 'Monat' : 'Monate';
}

/**
 * Reminders due at `now` that were not shown yet: the reminder's weekday
 * matches, its time has passed within the last `windowMinutes`, and the
 * habit is not done today.
 *
 * Args:
 *   d: Habit data.
 *   now: Current time.
 *   shown: Keys of reminders already shown (`<reminder id>:<day>`).
 *   windowMinutes: How late a reminder may still fire (e.g. after the app was closed).
 *
 * Returns:
 *   Keys of the reminders to show now.
 */
export function dueReminders(
  d: HabitData,
  now: Date,
  shown: ReadonlySet<string>,
  windowMinutes = 120,
): string[] {
  if (d.habit.archived || isDone(d, d.today)) return [];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const wd = (now.getDay() + 6) % 7;
  return d.habit.reminders
    .filter((r) => r.weekdays.includes(wd))
    .filter((r) => {
      const [h, m] = r.time.split(':').map(Number) as [number, number];
      const at = h * 60 + m;
      return minutes >= at && minutes - at <= windowMinutes;
    })
    .map((r) => `${r.id}:${d.today}`)
    .filter((key) => !shown.has(key));
}
