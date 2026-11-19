/**
 * Shared pieces of the habit pages: today's key, habit data, the check
 * button and recording a day (tap, or a value prompt for measured habits).
 */
import type { CSSProperties, ReactNode } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { Habit } from '@core/model/types';
import { dayKey } from '@core/habits/days';
import type { DayKey } from '@core/habits/days';
import { dayProgress, dayValue, isDone, tapValue } from '@core/habits/habits';
import type { HabitData } from '@core/habits/habits';
import { selectHabitData } from '@data/services/habits';
import { useApp, useNow, useSelector } from '../app/context';
import { useDialogs } from '../components/Confirm';
import { habitIcon } from './habitIcons';

/** Today's day key (updates at midnight). */
export function useToday(): DayKey {
  return dayKey(useNow(60_000));
}

/** Habit data of one habit for today. */
export function useHabitData(habit: Habit): HabitData {
  const today = useToday();
  return useSelector((s) => selectHabitData(s, habit, today));
}

/** Formats a value (no trailing zeros, German decimal comma). */
export function formatValue(v: number): string {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Records a day: taps toggle or count up; measured habits ask for the value.
 * Flashcard habits are automatic and do nothing.
 */
export function useRecordDay(): (data: HabitData, day: DayKey) => Promise<void> {
  const app = useApp();
  const dialogs = useDialogs();
  return async (data, day) => {
    const { habit } = data;
    const next = tapValue(data, day);
    if (next !== null) {
      app.habits.setValue(habit.id, day, next);
      return;
    }
    if (habit.tracking !== 'measure') return;
    const input = await dialogs.prompt({
      title: `${habit.name}: ${day.split('-').reverse().join('.')}`,
      label: `Wert${habit.unit ? ` in ${habit.unit}` : ''} (Ziel ${formatValue(habit.target)})`,
      initial: dayValue(data, day) ? String(dayValue(data, day)) : '',
      confirmLabel: 'Speichern',
    });
    if (input === null) return;
    const value = Number(input.replace(',', '.'));
    if (Number.isFinite(value)) app.habits.setValue(habit.id, day, value);
  };
}

/** Square icon of a habit in its colour. */
export function HabitBadge({ habit, size = 36 }: { habit: Habit; size?: number }): ReactNode {
  const Icon = habitIcon(habit.icon);
  return (
    <span
      className="habit-badge"
      style={
        { width: size, height: size, color: habit.color, '--hc': habit.color } as CSSProperties
      }
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/**
 * The check button of a day: a check (or slip cross for quit habits), a
 * progress ring for counters, the value for measured habits.
 */
export function CheckButton({
  data,
  day,
  size = 40,
}: {
  data: HabitData;
  day: DayKey;
  size?: number;
}): ReactNode {
  const app = useApp();
  const record = useRecordDay();
  const { habit } = data;
  const done = isDone(data, day);
  const progress = dayProgress(data, day);
  const value = dayValue(data, day);
  const quit = habit.kind === 'quit';
  const slipped = quit && value > 0;
  const automatic = habit.tracking === 'flashcards';
  const label = quit
    ? slipped
      ? 'Rückfall entfernen'
      : 'Rückfall eintragen'
    : automatic
      ? `${formatValue(value)} von ${formatValue(habit.target)} Karten`
      : done
        ? 'Erledigt – tippen zum Zurücksetzen'
        : 'Als erledigt markieren';
  const ring = !done && !quit && habit.tracking !== 'check' && progress > 0;
  return (
    <span className="row habit-check-wrap" style={{ gap: 4 }}>
      {habit.tracking === 'count' && value > 0 && !quit && (
        <button
          className="icon-btn"
          aria-label="Eins weniger"
          onClick={() => app.habits.setValue(habit.id, day, value - 1)}
        >
          <Minus size={14} />
        </button>
      )}
      <button
        className={`habit-check${done && !quit ? ' done' : ''}${slipped ? ' slipped' : ''}`}
        style={
          {
            width: size,
            height: size,
            '--hc': habit.color,
            background: ring
              ? `conic-gradient(${habit.color} ${progress * 360}deg, transparent 0)`
              : undefined,
          } as CSSProperties
        }
        aria-label={`${habit.name}: ${label}`}
        title={label}
        disabled={automatic}
        onClick={() => void record(data, day)}
      >
        <span className="habit-check-inner">
          {slipped ? (
            <X size={18} />
          ) : habit.tracking === 'check' || quit || done ? (
            <Check size={18} />
          ) : habit.tracking === 'count' ? (
            value > 0 ? (
              <span className="habit-check-num">{formatValue(value)}</span>
            ) : (
              <Plus size={18} />
            )
          ) : (
            <span className="habit-check-num">{value > 0 ? formatValue(value) : '–'}</span>
          )}
        </span>
      </button>
    </span>
  );
}
