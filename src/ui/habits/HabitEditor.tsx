/**
 * Dialog to create or edit a habit: icon, name, description, colour, build or
 * quit, how days are recorded, goal and reminders.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Habit, HabitPeriod, HabitReminder, HabitTracking } from '@core/model/types';
import { dayKey } from '@core/habits/days';
import { newId } from '@core/util/ids';
import { defaultHabit, HABIT_COLORS } from '@data/services/habits';
import type { HabitInput } from '@data/services/habits';
import { useApp } from '../app/context';
import { Field } from '../components/Controls';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { HABIT_ICONS } from './habitIcons';
import { t as tr } from '@core/i18n';
import { locale } from '@core/i18n';

/** Weekday labels, Monday first. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  // 2026-11-16 is a Monday.
  new Date(2026, 10, 16 + i)
    .toLocaleDateString(locale(), { weekday: 'short' })
    .replace('.', '')
    .slice(0, 2),
);

/** Labels of the recording modes. */
const TRACKING: { id: HabitTracking; label: string; hint: string }[] = [
  { id: 'check', label: tr('Yes / No'), hint: tr('Mark every day you do it.') },
  {
    id: 'count',
    label: tr('Counter'),
    hint: tr('Every tap counts one up until the daily target is reached.'),
  },
  {
    id: 'measure',
    label: tr('Measurement'),
    hint: tr('Enter a value per day, e.g. 5 km or 20 pages.'),
  },
  {
    id: 'flashcards',
    label: tr('Flashcards'),
    hint: tr('Done automatically when you review that many cards on the day.'),
  },
];

/**
 * The habit dialog.
 *
 * Args:
 *   habit: Habit to edit, or undefined for a new one.
 *   onClose: Closes the dialog; receives the id of the saved habit.
 */
export function HabitEditor({
  habit,
  onClose,
}: {
  habit?: Habit;
  onClose: (savedId?: string) => void;
}): ReactNode {
  const app = useApp();
  const toast = useToast();
  const [h, setH] = useState<HabitInput>(() =>
    habit ? { ...habit } : defaultHabit(dayKey(new Date())),
  );
  const set = (patch: Partial<HabitInput>): void => setH((prev) => ({ ...prev, ...patch }));
  const quit = h.kind === 'quit';
  const tracking = quit ? 'check' : h.tracking;

  const save = (): void => {
    if (!h.name.trim()) {
      toast(tr('Give the habit a name.'), 'error');
      return;
    }
    const clean: HabitInput = {
      ...h,
      name: h.name.trim(),
      description: h.description.trim(),
      tracking,
      target: tracking === 'check' ? 1 : Math.max(0.01, Number(h.target) || 1),
      unit: tracking === 'measure' ? h.unit?.trim() || undefined : undefined,
    };
    if (habit) {
      app.habits.update(habit.id, clean);
      onClose(habit.id);
    } else onClose(app.habits.create(clean).id);
  };

  const setReminder = (id: string, patch: Partial<HabitReminder>): void =>
    set({ reminders: h.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <Modal
      title={habit ? tr('Edit habit') : tr('New habit')}
      onClose={() => onClose()}
      footer={
        <>
          <button className="btn" onClick={() => onClose()}>
            {tr('Cancel')}
          </button>
          <button className="btn btn-primary" onClick={save}>
            {tr('Save')}
          </button>
        </>
      }
    >
      <div className="col habit-editor" style={{ gap: 14 }}>
        <div className="habit-icon-grid" role="listbox" aria-label={tr('Icon')}>
          {Object.entries(HABIT_ICONS).map(([name, Icon]) => (
            <button
              key={name}
              role="option"
              aria-selected={h.icon === name}
              title={name}
              className={`icon-choice${h.icon === name ? ' active' : ''}`}
              style={h.icon === name ? { color: h.color } : undefined}
              onClick={() => set({ icon: name })}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <Field label={tr('Name')}>
          <input
            className="input"
            value={h.name}
            placeholder={tr('e.g. Sport')}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label={tr('Description')}>
          <input
            className="input"
            value={h.description}
            placeholder={tr('e.g. running, strength training or similar')}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field group label={tr('Colour')}>
          <div className="habit-colors" role="listbox" aria-label={tr('Colour')}>
            {HABIT_COLORS.map((c) => (
              <button
                key={c}
                role="option"
                aria-selected={h.color === c}
                aria-label={c}
                className={`habit-color${h.color === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </Field>
        <Field group label={tr('Habit type')}>
          <div className="segmented">
            <button className={!quit ? 'active' : ''} onClick={() => set({ kind: 'build' })}>
              {tr('Build')}
            </button>
            <button className={quit ? 'active' : ''} onClick={() => set({ kind: 'quit' })}>
              {tr('Quit')}
            </button>
          </div>
          <p className="faint habit-hint">
            {quit
              ? tr('Every day without a relapse counts. Only tap when you relapsed.')
              : tr('Mark every day you complete it.')}
          </p>
        </Field>
        {!quit && (
          <Field group label={tr('Tracking')}>
            <div className="segmented habit-tracking">
              {TRACKING.map((t) => (
                <button
                  key={t.id}
                  className={tracking === t.id ? 'active' : ''}
                  onClick={() =>
                    set({
                      tracking: t.id,
                      target:
                        t.id === 'check'
                          ? 1
                          : t.id === 'flashcards'
                            ? 50
                            : h.target > 1
                              ? h.target
                              : t.id === 'count'
                                ? 8
                                : 1,
                    })
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="faint habit-hint">{TRACKING.find((t) => t.id === tracking)!.hint}</p>
            {tracking !== 'check' && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <label className="row" style={{ gap: 6 }}>
                  {tr('Daily target')}
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="any"
                    style={{ width: 90 }}
                    value={h.target}
                    onChange={(e) => set({ target: Number(e.target.value) })}
                  />
                </label>
                {tracking === 'measure' && (
                  <input
                    className="input"
                    style={{ width: 120 }}
                    placeholder={tr('Unit (km)')}
                    value={h.unit ?? ''}
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                )}
                {tracking === 'count' && <span className="muted">{tr('times')}</span>}
                {tracking === 'flashcards' && <span className="muted">{tr('Cards')}</span>}
              </div>
            )}
          </Field>
        )}
        <Field group label={tr('Goal')}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="segmented">
              {(
                [
                  ['day', tr('Daily')],
                  ['week', tr('Per week')],
                  ['month', tr('Per month')],
                ] as [HabitPeriod, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  className={h.goal.period === p ? 'active' : ''}
                  onClick={() =>
                    set({ goal: { period: p, times: p === 'day' ? 1 : p === 'week' ? 3 : 20 } })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {h.goal.period !== 'day' && (
              <label className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={h.goal.period === 'week' ? 7 : 31}
                  style={{ width: 70 }}
                  aria-label={tr('Days per period')}
                  value={h.goal.times}
                  onChange={(e) => set({ goal: { ...h.goal, times: Number(e.target.value) } })}
                />
                {tr('Days')}
              </label>
            )}
          </div>
          <p className="faint habit-hint">
            {h.goal.period === 'day'
              ? tr('Streaks count in days.')
              : h.goal.period === 'week'
                ? tr('Streaks count in weeks – a missed day is fine as long as the week adds up.')
                : tr(
                    'Streaks count in months – a missed day is fine as long as the month adds up.',
                  )}
          </p>
        </Field>
        <Field label={tr('Start')}>
          <input
            className="input"
            type="date"
            style={{ maxWidth: 180 }}
            value={h.startDay}
            onChange={(e) => e.target.value && set({ startDay: e.target.value })}
          />
        </Field>
        <Field group label={tr('Reminders')}>
          <div className="col" style={{ gap: 10 }}>
            {h.reminders.map((r, i) => (
              <div key={r.id} className="habit-reminder">
                <span className="faint">#{i + 1}</span>
                <div className="habit-weekdays">
                  {WEEKDAYS.map((label, wd) => (
                    <button
                      key={label}
                      className={r.weekdays.includes(wd) ? 'active' : ''}
                      style={r.weekdays.includes(wd) ? { background: h.color } : undefined}
                      onClick={() =>
                        setReminder(r.id, {
                          weekdays: r.weekdays.includes(wd)
                            ? r.weekdays.filter((x) => x !== wd)
                            : [...r.weekdays, wd].sort(),
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  className="input"
                  type="time"
                  aria-label={tr('Time')}
                  value={r.time}
                  onChange={(e) => setReminder(r.id, { time: e.target.value })}
                />
                <button
                  className="icon-btn"
                  aria-label={tr('Remove reminder')}
                  onClick={() => set({ reminders: h.reminders.filter((x) => x.id !== r.id) })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                set({
                  reminders: [
                    ...h.reminders,
                    { id: newId(), weekdays: [0, 1, 2, 3, 4, 5, 6], time: '08:00' },
                  ],
                });
                // Ask for permission right away (needs a user gesture on iOS).
                if (typeof Notification !== 'undefined' && Notification.permission === 'default')
                  void Notification.requestPermission();
              }}
            >
              <Plus size={14} /> {tr('Add reminder')}
            </button>
            <p className="faint habit-hint">
              {tr(
                'Reminders arrive while RemCraft is open on the device (also in the background as an installed app), and only when you are not done for the day yet.',
              )}
            </p>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
