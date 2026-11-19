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

/** Weekday labels, Monday first. */
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Labels of the recording modes. */
const TRACKING: { id: HabitTracking; label: string; hint: string }[] = [
  { id: 'check', label: 'Ja / Nein', hint: 'Markiere jeden Tag, an dem du es erledigst.' },
  {
    id: 'count',
    label: 'Zähler',
    hint: 'Jedes Tippen zählt eins hoch, bis das Tagesziel erreicht ist.',
  },
  {
    id: 'measure',
    label: 'Messwert',
    hint: 'Trage pro Tag einen Wert ein, z. B. 5 km oder 20 Seiten.',
  },
  {
    id: 'flashcards',
    label: 'Karteikarten',
    hint: 'Automatisch erledigt, wenn du an dem Tag so viele Karten wiederholst.',
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
      toast('Gib der Gewohnheit einen Namen.', 'error');
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
      title={habit ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit'}
      onClose={() => onClose()}
      footer={
        <>
          <button className="btn" onClick={() => onClose()}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="col habit-editor" style={{ gap: 14 }}>
        <div className="habit-icon-grid" role="listbox" aria-label="Icon">
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
        <Field label="Name">
          <input
            className="input"
            value={h.name}
            placeholder="z. B. Sport"
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Beschreibung">
          <input
            className="input"
            value={h.description}
            placeholder="z. B. Laufen, Krafttraining oder Ähnliches"
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field group label="Farbe">
          <div className="habit-colors" role="listbox" aria-label="Farbe">
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
        <Field group label="Art der Gewohnheit">
          <div className="segmented">
            <button className={!quit ? 'active' : ''} onClick={() => set({ kind: 'build' })}>
              Aufbauen
            </button>
            <button className={quit ? 'active' : ''} onClick={() => set({ kind: 'quit' })}>
              Abgewöhnen
            </button>
          </div>
          <p className="faint habit-hint">
            {quit
              ? 'Jeder Tag ohne Rückfall zählt. Tippe nur, wenn du rückfällig wurdest.'
              : 'Markiere jeden Tag, an dem du sie erfüllst.'}
          </p>
        </Field>
        {!quit && (
          <Field group label="Erfassung">
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
                  Tagesziel
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
                    placeholder="Einheit (km)"
                    value={h.unit ?? ''}
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                )}
                {tracking === 'count' && <span className="muted">mal</span>}
                {tracking === 'flashcards' && <span className="muted">Karten</span>}
              </div>
            )}
          </Field>
        )}
        <Field group label="Ziel">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="segmented">
              {(
                [
                  ['day', 'Täglich'],
                  ['week', 'Pro Woche'],
                  ['month', 'Pro Monat'],
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
                  aria-label="Tage pro Zeitraum"
                  value={h.goal.times}
                  onChange={(e) => set({ goal: { ...h.goal, times: Number(e.target.value) } })}
                />
                Tage
              </label>
            )}
          </div>
          <p className="faint habit-hint">
            Serien zählen in{' '}
            {h.goal.period === 'day' ? 'Tagen' : h.goal.period === 'week' ? 'Wochen' : 'Monaten'}
            {h.goal.period !== 'day' &&
              ' – ein ausgelassener Tag ist okay, solange der Zeitraum aufgeht'}
            .
          </p>
        </Field>
        <Field label="Beginn">
          <input
            className="input"
            type="date"
            style={{ maxWidth: 180 }}
            value={h.startDay}
            onChange={(e) => e.target.value && set({ startDay: e.target.value })}
          />
        </Field>
        <Field group label="Erinnerungen">
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
                  aria-label="Uhrzeit"
                  value={r.time}
                  onChange={(e) => setReminder(r.id, { time: e.target.value })}
                />
                <button
                  className="icon-btn"
                  aria-label="Erinnerung entfernen"
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
              <Plus size={14} /> Erinnerung hinzufügen
            </button>
            <p className="faint habit-hint">
              Erinnerungen kommen, solange RemCraft auf dem Gerät geöffnet ist (auch im Hintergrund
              als installierte App), und nur wenn du an dem Tag noch nicht fertig bist.
            </p>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
