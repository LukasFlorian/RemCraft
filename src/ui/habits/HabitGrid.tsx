/**
 * Tile grids of a habit: one tile per day, one column per week (Monday on
 * top), filled in the habit's colour. `RecentGrid` fits as many weeks as the
 * width allows with today in the right-most column; `YearGrid` shows a
 * calendar year with month labels.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { addDays, weekday } from '@core/habits/days';
import type { DayKey } from '@core/habits/days';
import { dayProgress, isDone } from '@core/habits/habits';
import type { HabitData } from '@core/habits/habits';

/** Month abbreviations. */
export const MONTHS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** Visual state of one tile. */
function tileStyle(d: HabitData, day: DayKey, color: string): CSSProperties {
  if (day > d.today || day < d.habit.startDay) return { background: 'var(--habit-empty)' };
  if (isDone(d, day)) return { background: color };
  const p = dayProgress(d, day);
  // Partly reached targets (counters) show a lighter tile.
  return p > 0
    ? { background: `color-mix(in srgb, ${color} ${Math.round(25 + 45 * p)}%, transparent)` }
    : { background: `color-mix(in srgb, ${color} 14%, transparent)` };
}

/** Days of `weeks` columns ending with the week of `end`. */
function columns(end: DayKey, weeks: number): DayKey[][] {
  const lastMonday = addDays(end, -weekday(end));
  const cols: DayKey[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = addDays(lastMonday, -7 * w);
    cols.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return cols;
}

/** Number of week columns that fit into an element (follows resizes). */
function useFitWeeks(tile: number, gap: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(20);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void =>
      setWeeks(Math.max(4, Math.floor((el.clientWidth + gap) / (tile + gap))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tile, gap]);
  return [ref, weeks];
}

/** The last weeks up to today, as many as fit. */
export function RecentGrid({
  data,
  color,
  tile = 11,
  gap = 3,
}: {
  data: HabitData;
  color: string;
  tile?: number;
  gap?: number;
}): ReactNode {
  const [ref, weeks] = useFitWeeks(tile, gap);
  const cols = columns(data.today, weeks);
  return (
    <div ref={ref} className="habit-grid" style={{ gap }} aria-hidden>
      {cols.map((col) => (
        <div key={col[0]} className="habit-grid-col" style={{ gap }}>
          {col.map((day) => (
            <span
              key={day}
              className="habit-tile"
              style={{ width: tile, height: tile, ...tileStyle(data, day, color) }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A calendar year (January to December), scrollable on narrow screens. */
export function YearGrid({
  data,
  color,
  year,
  onDay,
}: {
  data: HabitData;
  color: string;
  year: number;
  /** Tapping a tile (e.g. to toggle the day). */
  onDay?: (day: DayKey) => void;
}): ReactNode {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  // 54 columns always cover a year; keep those touching it.
  const cols = columns(last, 54).filter((c) => c[6]! >= first);
  const scroller = useRef<HTMLDivElement>(null);
  // Start scrolled to today (right edge) in the current year.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && data.today.startsWith(String(year))) {
      const col = cols.findIndex((c) => c.includes(data.today));
      el.scrollLeft = Math.max(0, col * 14 - el.clientWidth + 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  return (
    <div className="habit-year" ref={scroller}>
      <div className="habit-year-months">
        {cols.map((c, i) => {
          const firstOfMonth = c.find((d) => d.endsWith('-01') && d >= first && d <= last);
          return (
            <span key={i} className="habit-year-month">
              {firstOfMonth ? MONTHS[Number(firstOfMonth.slice(5, 7)) - 1] : ''}
            </span>
          );
        })}
      </div>
      <div className="habit-grid" style={{ gap: 3 }}>
        {cols.map((col) => (
          <div key={col[0]} className="habit-grid-col" style={{ gap: 3 }}>
            {col.map((day) =>
              day < first || day > last ? (
                <span key={day} className="habit-tile" style={{ width: 11, height: 11 }} />
              ) : (
                <button
                  key={day}
                  className="habit-tile"
                  title={day}
                  aria-label={`${day}${isDone(data, day) ? ' erledigt' : ''}`}
                  disabled={!onDay || day > data.today}
                  onClick={() => onDay?.(day)}
                  style={{ width: 11, height: 11, ...tileStyle(data, day, color) }}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
