/**
 * Time helpers. A *study day* starts at a configurable hour (default 04:00) so
 * that late-night sessions still count towards the previous day, exactly like
 * RemNote and Anki.
 */
import type { Timestamp } from '../model/types';

/** Milliseconds per minute. */
export const MINUTE = 60_000;
/** Milliseconds per hour. */
export const HOUR = 60 * MINUTE;
/** Milliseconds per day. */
export const DAY = 24 * HOUR;

/**
 * Returns the start of the study day containing `t` (local time).
 *
 * @param t Point in time.
 * @param dayStartHour Hour at which a study day begins.
 */
export function startOfStudyDay(t: Timestamp, dayStartHour = 4): Timestamp {
  const d = new Date(t);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartHour, 0, 0, 0);
  if (start.getTime() > t) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/**
 * Returns the start of the study day `n` days after the one containing `t`.
 * Uses calendar arithmetic so DST changes do not shift the boundary.
 */
export function addStudyDays(t: Timestamp, n: number, dayStartHour = 4): Timestamp {
  const start = new Date(startOfStudyDay(t, dayStartHour));
  start.setDate(start.getDate() + n);
  return start.getTime();
}

/**
 * Number of whole study days between the days containing `a` and `b`
 * (positive when `b` is later).
 */
export function studyDaysBetween(a: Timestamp, b: Timestamp, dayStartHour = 4): number {
  const da = new Date(startOfStudyDay(a, dayStartHour));
  const db = new Date(startOfStudyDay(b, dayStartHour));
  // Compare calendar dates in UTC to avoid DST off-by-one-hour issues.
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / DAY);
}

/** Formats a local date as `YYYY-MM-DD`. */
export function isoDate(t: Timestamp): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parses a `YYYY-MM-DD` string as local midnight. */
export function parseIsoDate(s: string): Timestamp {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

/** English ordinal suffix ("1st", "2nd", ...). */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Long, RemNote-style date title, e.g. "November 16th, 2026". */
export function formatLongDate(t: Timestamp): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

/** Short date used for list grouping, e.g. "November 16th". */
export function formatShortDate(t: Timestamp): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`;
}

/**
 * Human-readable duration for interval previews ("1m", "10m", "3h", "4d",
 * "2.1mo", "1.5y").
 *
 * @param ms Duration in milliseconds.
 */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}
