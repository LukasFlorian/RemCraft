/**
 * Application service and selectors for habits.
 *
 * Habits and their day entries are ordinary synced collections. Day values
 * live in one record per habit and day (`<habit id>:<YYYY-MM-DD>`), so two
 * devices editing different days never conflict.
 */
import { compareOrder, orderBetween } from '@core/model/ordering';
import type { Habit, HabitEntry } from '@core/model/types';
import { dayKey } from '@core/habits/days';
import type { DayKey } from '@core/habits/days';
import { dayValue, entryId, isDone } from '@core/habits/habits';
import type { HabitData } from '@core/habits/habits';
import { newId } from '@core/util/ids';
import type { Store } from '../store/store';

/** Colours offered for habits (30). */
export const HABIT_COLORS = [
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#facc15',
  '#a3e635',
  '#4ade80',
  '#34d399',
  '#2dd4bf',
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#7c83fd',
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#94a3b8',
  '#a8a29e',
] as const;

/**
 * Habits in manual order.
 *
 * Args:
 *   store: The store.
 *   archived: Return archived habits instead of active ones.
 */
export function selectHabits(store: Store, archived = false): Habit[] {
  return store.memo(`habits:${archived}`, [store.collectionVersion('habits')], () =>
    [...store.all('habits')].filter((h) => Boolean(h.archived) === archived).sort(compareOrder),
  );
}

/** Entries by habit and day. */
function selectEntryIndex(store: Store): Map<string, Map<DayKey, HabitEntry>> {
  return store.memo('habitEntryIndex', [store.collectionVersion('habitEntries')], () => {
    const index = new Map<string, Map<DayKey, HabitEntry>>();
    for (const e of store.all('habitEntries')) {
      let m = index.get(e.habitId);
      if (!m) index.set(e.habitId, (m = new Map()));
      m.set(e.day, e);
    }
    return index;
  });
}

/** Flashcard reviews per local day (for `flashcards` habits). */
export function selectReviewsPerDay(store: Store): Map<DayKey, number> {
  return store.memo('reviewsPerDay', [store.collectionVersion('logs')], () => {
    const counts = new Map<DayKey, number>();
    for (const log of store.all('logs')) {
      const k = dayKey(log.reviewedAt);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  });
}

/**
 * Everything the habit logic needs about one habit.
 *
 * Args:
 *   store: The store.
 *   habit: The habit.
 *   today: Today's day key.
 */
export function selectHabitData(store: Store, habit: Habit, today: DayKey): HabitData {
  return store.memo(
    `habitData:${habit.id}:${today}`,
    [
      store.collectionVersion('habits'),
      store.collectionVersion('habitEntries'),
      habit.tracking === 'flashcards' ? store.collectionVersion('logs') : 0,
    ],
    () => ({
      habit,
      entries: selectEntryIndex(store).get(habit.id) ?? new Map(),
      reviews: habit.tracking === 'flashcards' ? selectReviewsPerDay(store) : undefined,
      today,
    }),
  );
}

/** Fields of a new habit. */
export type HabitInput = Omit<Habit, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

/** Default fields of a new habit. */
export function defaultHabit(today: DayKey): HabitInput {
  return {
    name: '',
    description: '',
    icon: 'dumbbell',
    color: '#7c83fd',
    kind: 'build',
    tracking: 'check',
    target: 1,
    goal: { period: 'day', times: 1 },
    reminders: [],
    startDay: today,
  };
}

/** CRUD and day values of habits. */
export class HabitService {
  constructor(private readonly store: Store) {}

  /** Creates a habit at the end of the list. */
  create(input: HabitInput): Habit {
    const list = selectHabits(this.store);
    const now = this.store.clock.now();
    return this.store.transact((tx) =>
      tx.put('habits', {
        ...input,
        id: newId(),
        order: orderBetween(list[list.length - 1]?.order ?? null, null),
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  /** Updates a habit. */
  update(id: string, patch: Partial<Habit>): void {
    this.store.transact((tx) => void tx.update('habits', id, patch));
  }

  /** Archives (or restores) a habit; its history is kept. */
  archive(id: string, archived = true): void {
    this.update(id, { archived: archived || undefined });
  }

  /** Deletes a habit with all its entries. */
  delete(id: string): void {
    this.store.transact((tx) => {
      for (const e of this.store.all('habitEntries'))
        if (e.habitId === id) tx.delete('habitEntries', e.id);
      tx.delete('habits', id);
    });
  }

  /**
   * Moves a habit before another one (or to the end).
   *
   * Args:
   *   id: Habit to move.
   *   beforeId: Habit it goes in front of, `null` for the end.
   */
  move(id: string, beforeId: string | null): void {
    const list = selectHabits(this.store).filter((h) => h.id !== id);
    const index = beforeId ? list.findIndex((h) => h.id === beforeId) : list.length;
    const prev = list[index - 1]?.order ?? null;
    const next = list[index]?.order ?? null;
    this.update(id, { order: orderBetween(prev, next) });
  }

  /** The entry of a habit on a day. */
  entry(habitId: string, day: DayKey): HabitEntry | undefined {
    return this.store.getRecord('habitEntries', entryId(habitId, day));
  }

  /**
   * Sets the value of a day (keeps its note; removes empty entries).
   *
   * Args:
   *   habitId: The habit.
   *   day: The day.
   *   value: Done (1/0), count, measured value, or slip (quit habits).
   */
  setValue(habitId: string, day: DayKey, value: number): void {
    this.write(habitId, day, { value: Math.max(0, value) });
  }

  /**
   * Sets the note of a day (empty removes it).
   *
   * Args:
   *   habitId: The habit.
   *   day: The day.
   *   note: Text of the note.
   */
  setNote(habitId: string, day: DayKey, note: string): void {
    this.write(habitId, day, { note: note.trim() || undefined });
  }

  /** Writes part of a day entry; deletes it when nothing is left. */
  private write(habitId: string, day: DayKey, patch: Partial<HabitEntry>): void {
    const id = entryId(habitId, day);
    this.store.transact(
      (tx) => {
        const current = tx.get('habitEntries', id) as HabitEntry | undefined;
        const next: HabitEntry = {
          id,
          habitId,
          day,
          value: 0,
          updatedAt: 0,
          ...current,
          ...patch,
        };
        if (next.note === undefined) delete next.note;
        if (next.value <= 0 && !next.note) {
          if (current) tx.delete('habitEntries', id);
        } else tx.put('habitEntries', next);
      },
      // Repeated taps on a counter undo in one step.
      { coalesceKey: `habit:${id}` },
    );
  }

  /**
   * CSV of all entries (day, habit, value, done, note), for spreadsheets.
   *
   * Args:
   *   today: Today's day key.
   */
  exportCsv(today: DayKey = dayKey(new Date())): string {
    const quote = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const rows = ['Tag;Gewohnheit;Wert;Erledigt;Notiz'];
    const habits = [...selectHabits(this.store), ...selectHabits(this.store, true)];
    for (const h of habits) {
      const d = selectHabitData(this.store, h, today);
      const days = new Set([...d.entries.keys(), ...(d.reviews?.keys() ?? [])]);
      for (const day of [...days].sort()) {
        rows.push(
          [
            day,
            quote(h.name),
            String(dayValue(d, day)),
            isDone(d, day) ? '1' : '0',
            quote(d.entries.get(day)?.note ?? ''),
          ].join(';'),
        );
      }
    }
    return rows.join('\n');
  }
}
