/**
 * Flashcard practice settings (daily goal, streak, new cards, day start…).
 */
import type { ReactNode } from 'react';
import type { DailyGoalMode } from '@core/model/types';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Field, Switch } from '../../components/Controls';

/** Flashcard settings. */
export function FlashcardSection(): ReactNode {
  const app = useApp();
  const s = useSelector(selectSettings);
  const num = (v: string, min: number, max: number): number =>
    Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  return (
    <div className="card col" style={{ gap: 18 }}>
      <h2 className="card-title">Flashcards</h2>
      <Field
        label="Daily goal"
        hint="Which cards count towards the daily goal shown on the Flashcards home page."
      >
        <select
          className="select"
          value={s.dailyGoalMode}
          onChange={(e) => app.settings.update({ dailyGoalMode: e.target.value as DailyGoalMode })}
        >
          <option value="exam-and-active">Exams + Currently Studying (recommended)</option>
          <option value="all-due">All due cards</option>
          <option value="custom-number">A fixed number of cards</option>
        </select>
      </Field>
      {s.dailyGoalMode === 'custom-number' && (
        <Field label="Cards per day">
          <input
            className="input"
            type="number"
            value={s.dailyGoalNumber}
            onChange={(e) => app.settings.update({ dailyGoalNumber: num(e.target.value, 1, 5000) })}
          />
        </Field>
      )}
      <div className="grid-2">
        <Field label="Streak goal" hint="Cards per day needed to keep your streak (default 10).">
          <input
            className="input"
            type="number"
            value={s.streakGoal}
            onChange={(e) => app.settings.update({ streakGoal: num(e.target.value, 1, 1000) })}
          />
        </Field>
        <Field
          label="New cards per day"
          hint="Outside exams. Exams spread their new cards automatically."
        >
          <input
            className="input"
            type="number"
            value={s.newCardsPerDay}
            onChange={(e) => app.settings.update({ newCardsPerDay: num(e.target.value, 0, 9999) })}
          />
        </Field>
        <Field label="New day starts at" hint="Late-night reviews count for the previous day.">
          <select
            className="select"
            value={s.dayStartHour}
            onChange={(e) => app.settings.update({ dayStartHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </Field>
        <Field label="Typed answers" hint="Grading of “Type in Answer” cards.">
          <select
            className="select"
            value={s.typeInAnswerGrading}
            onChange={(e) =>
              app.settings.update({ typeInAnswerGrading: e.target.value as 'exact' | 'lenient' })
            }
          >
            <option value="lenient">Lenient (ignore case, accents, small typos)</option>
            <option value="exact">Exact</option>
          </select>
        </Field>
      </div>
      <Switch
        checked={s.shuffleQueue}
        onChange={(v) => app.settings.update({ shuffleQueue: v })}
        label="Shuffle the daily queue (otherwise most-at-risk cards first)"
      />
      <Switch
        checked={Boolean(s.mcShowAnswerKind)}
        onChange={(v) => app.settings.update({ mcShowAnswerKind: v })}
        label="Multiple choice: show whether one or several answers are correct (radio buttons vs. checkboxes; the number of correct answers is never shown)"
      />
    </div>
  );
}
