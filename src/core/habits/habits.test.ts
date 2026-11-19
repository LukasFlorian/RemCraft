import { describe, expect, it } from 'vitest';
import type { Habit, HabitEntry } from '../model/types';
import { addDays, periodStart, weekday } from './days';
import {
  completionRate,
  completionsPerMonth,
  dueReminders,
  isDone,
  streaks,
  tapValue,
  totals,
} from './habits';
import type { HabitData } from './habits';

/** A habit with defaults. */
function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    name: 'Sport',
    description: '',
    icon: 'dumbbell',
    color: '#7c83fd',
    kind: 'build',
    tracking: 'check',
    target: 1,
    goal: { period: 'day', times: 1 },
    reminders: [],
    startDay: '2026-11-01',
    order: 'a',
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

/** Habit data with values per day. */
function data(h: Habit, values: Record<string, number>, today = '2026-11-19'): HabitData {
  const entries = new Map<string, HabitEntry>(
    Object.entries(values).map(([day, value]) => [
      day,
      { id: `h:${day}`, habitId: 'h', day, value, updatedAt: 0 },
    ]),
  );
  return { habit: h, entries, today };
}

describe('days', () => {
  it('computes weekdays and periods', () => {
    expect(weekday('2026-11-16')).toBe(0); // Monday
    expect(weekday('2026-11-22')).toBe(6); // Sunday
    expect(periodStart('2026-11-19', 'week')).toBe('2026-11-16');
    expect(periodStart('2026-11-19', 'month')).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('habits', () => {
  it('daily streaks: today not done yet does not break the streak', () => {
    const d = data(habit(), { '2026-11-15': 1, '2026-11-16': 1, '2026-11-17': 1, '2026-11-18': 1 });
    expect(streaks(d)).toMatchObject({ current: 4, best: 4, period: 'day' });
    // A gap two days ago ends it.
    const gap = data(habit(), {
      '2026-11-10': 1,
      '2026-11-11': 1,
      '2026-11-12': 1,
      '2026-11-18': 1,
    });
    expect(streaks(gap)).toMatchObject({ current: 1, best: 3 });
  });

  it('weekly goals: a missed day is fine if the week adds up', () => {
    const h = habit({ goal: { period: 'week', times: 3 } });
    // Week of Nov 2: 3 days, week of Nov 9: 3 days, week of Nov 16: 1 so far (running).
    const d = data(h, {
      '2026-11-02': 1,
      '2026-11-04': 1,
      '2026-11-06': 1,
      '2026-11-09': 1,
      '2026-11-10': 1,
      '2026-11-14': 1,
      '2026-11-17': 1,
    });
    expect(streaks(d)).toMatchObject({ current: 2, best: 2, period: 'week' });
    // Weeks: Oct 26 (started Nov 1, not met), Nov 2, Nov 9 met; current week not counted yet.
    expect(completionRate(d)).toBe(67);
  });

  it('counter and measured values need the target', () => {
    const counter = data(habit({ tracking: 'count', target: 8 }), {
      '2026-11-18': 5,
      '2026-11-19': 8,
    });
    expect(isDone(counter, '2026-11-18')).toBe(false);
    expect(isDone(counter, '2026-11-19')).toBe(true);
    expect(tapValue(counter, '2026-11-18')).toBe(6);
    expect(tapValue(counter, '2026-11-19')).toBe(0);
    const pages = data(habit({ tracking: 'measure', target: 20, unit: 'Seiten' }), {
      '2026-11-18': 35,
      '2026-11-19': 12,
    });
    expect(totals(pages)).toEqual({ completions: 1, total: 47 });
    expect(tapValue(pages, '2026-11-19')).toBeNull();
  });

  it('quit habits count clean days and break on a slip', () => {
    const d = data(habit({ kind: 'quit', startDay: '2026-11-10' }), { '2026-11-14': 1 });
    expect(isDone(d, '2026-11-13')).toBe(true);
    expect(isDone(d, '2026-11-14')).toBe(false);
    expect(isDone(d, '2026-11-09')).toBe(false); // before the start
    expect(streaks(d)).toMatchObject({ current: 5, best: 5 }); // Nov 15..19
    expect(totals(d).completions).toBe(9);
    expect(tapValue(d, '2026-11-19')).toBe(1); // tapping records a slip
  });

  it('flashcard habits use the reviews of the day', () => {
    const h = habit({ tracking: 'flashcards', target: 50 });
    const d: HabitData = {
      ...data(h, {}),
      reviews: new Map([
        ['2026-11-18', 60],
        ['2026-11-19', 10],
      ]),
    };
    expect(isDone(d, '2026-11-18')).toBe(true);
    expect(isDone(d, '2026-11-19')).toBe(false);
    expect(completionsPerMonth(d, 2026)[10]).toBe(1);
  });

  it('reminders fire once per day, only while not done', () => {
    const h = habit({ reminders: [{ id: 'r', weekdays: [3], time: '07:00' }] }); // Thursday
    const d = data(h, {});
    const now = new Date(2026, 10, 19, 7, 30); // Thu, 19 Nov 2026, 07:30
    expect(dueReminders(d, now, new Set())).toEqual(['r:2026-11-19']);
    expect(dueReminders(d, now, new Set(['r:2026-11-19']))).toEqual([]);
    expect(dueReminders(d, new Date(2026, 10, 19, 6, 59), new Set())).toEqual([]);
    expect(dueReminders(data(h, { '2026-11-19': 1 }), now, new Set())).toEqual([]);
  });
});
