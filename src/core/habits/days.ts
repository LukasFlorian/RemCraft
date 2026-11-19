/**
 * Calendar days as "YYYY-MM-DD" keys (local time) and the periods habit goals
 * are measured in. Keys sort chronologically as strings.
 */
import type { HabitPeriod } from '../model/types';

/** A local calendar day, "YYYY-MM-DD". */
export type DayKey = string;

/** Two-digit zero padding. */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Day key of a date (local time).
 *
 * Args:
 *   date: Any point in time.
 */
export function dayKey(date: Date | number): DayKey {
  const d = typeof date === 'number' ? new Date(date) : date;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local midnight of a day key.
 *
 * Args:
 *   key: "YYYY-MM-DD".
 */
export function dayDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Key of the day `n` days after `key` (negative: before).
 *
 * Args:
 *   key: Start day.
 *   n: Number of days.
 */
export function addDays(key: DayKey, n: number): DayKey {
  const d = dayDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/**
 * Weekday, 0 = Monday … 6 = Sunday.
 *
 * Args:
 *   key: The day.
 */
export function weekday(key: DayKey): number {
  return (dayDate(key).getDay() + 6) % 7;
}

/**
 * Number of days from `a` to `b` (positive when `b` is later).
 *
 * Args:
 *   a: First day.
 *   b: Second day.
 */
export function daysBetween(a: DayKey, b: DayKey): number {
  // Round: daylight saving days are 23 or 25 hours long.
  return Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86_400_000);
}

/**
 * First day of the period (day, Monday-based week, month) containing `key`.
 *
 * Args:
 *   key: A day.
 *   period: Period kind.
 */
export function periodStart(key: DayKey, period: HabitPeriod): DayKey {
  if (period === 'day') return key;
  if (period === 'week') return addDays(key, -weekday(key));
  return `${key.slice(0, 7)}-01`;
}

/**
 * First day of the period after the one starting at `start`.
 *
 * Args:
 *   start: First day of a period.
 *   period: Period kind.
 */
export function nextPeriod(start: DayKey, period: HabitPeriod): DayKey {
  if (period === 'day') return addDays(start, 1);
  if (period === 'week') return addDays(start, 7);
  const d = dayDate(start);
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/**
 * Days from `from` to `to`, both inclusive (empty when `to` < `from`).
 *
 * Args:
 *   from: First day.
 *   to: Last day.
 */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}
