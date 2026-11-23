/**
 * One habit in detail (`#/habits/:id`): year grid, streak and goal chips,
 * numbers and completions per month, a month calendar to fill in any day
 * (hold a day for a note) and the list of notes.
 */
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Flame,
  NotebookPen,
  Pencil,
  Share2,
  Target,
  Trash2,
} from 'lucide-react';
import type { Habit } from '@core/model/types';
import { addDays, dayDate, dayRange, nextPeriod, weekday } from '@core/habits/days';
import type { DayKey } from '@core/habits/days';
import {
  completionRate,
  completionsPerMonth,
  dayValue,
  goalLabel,
  isDone,
  streaks,
  streakUnit,
  totals,
} from '@core/habits/habits';
import type { HabitData } from '@core/habits/habits';
import { useApp, useSelector } from '../app/context';
import { BarChart, StatTile } from '../components/Charts';
import { useDialogs } from '../components/Confirm';
import { HabitEditor, WEEKDAYS } from './HabitEditor';
import { MONTHS, YearGrid } from './HabitGrid';
import { ShareCardDialog } from './ShareCard';
import { CheckButton, formatValue, HabitBadge, useHabitData, useRecordDay } from './common';
import { t as tr, locale } from '@core/i18n';

/** The detail page. */
export function HabitDetailPage(): ReactNode {
  const { habitId = '' } = useParams();
  const habit = useSelector((s) => s.getRecord('habits', habitId));
  if (!habit)
    return (
      <div className="main-scroll">
        <div className="page">
          <p className="muted">{tr('This habit does not exist (any more).')}</p>
        </div>
      </div>
    );
  return <HabitDetail habit={habit} />;
}

/** Content of the detail page. */
function HabitDetail({ habit }: { habit: Habit }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const data = useHabitData(habit);
  const record = useRecordDay();
  const [year, setYear] = useState(Number(data.today.slice(0, 4)));
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const s = streaks(data);
  const t = totals(data);
  const rate = completionRate(data);
  const perMonth = completionsPerMonth(data, year);

  const editNote = async (day: DayKey): Promise<void> => {
    const note = await dialogs.prompt({
      title: tr('Note – {0}', { '0': formatDay(day) }),
      label: tr('What went well? What got in the way?'),
      initial: app.habits.entry(habit.id, day)?.note ?? '',
      confirmLabel: tr('Save'),
    });
    if (note !== null) app.habits.setNote(habit.id, day, note);
  };

  return (
    <div className="main-scroll">
      <div className="page habit-detail" style={{ '--hc': habit.color } as CSSProperties}>
        <div className="habit-detail-head">
          <button className="icon-btn" aria-label={tr('Back')} onClick={() => navigate('/habits')}>
            <ChevronLeft size={18} />
          </button>
          <span className="spacer" />
          <button
            className="icon-btn"
            title={tr('Share')}
            aria-label={tr('Share')}
            onClick={() => setSharing(true)}
          >
            <Share2 size={17} />
          </button>
          <button
            className="icon-btn"
            title={tr('Edit')}
            aria-label={tr('Edit')}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} />
          </button>
          <button
            className="icon-btn"
            title={habit.archived ? tr('Restore') : tr('Archive')}
            aria-label={habit.archived ? tr('Restore') : tr('Archive')}
            onClick={() => {
              app.habits.archive(habit.id, !habit.archived);
              if (!habit.archived) navigate('/habits');
            }}
          >
            {habit.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
          </button>
          <button
            className="icon-btn"
            title={tr('Delete')}
            aria-label={tr('Delete')}
            onClick={async () => {
              const ok = await dialogs.confirm({
                title: tr('Delete habit?'),
                message: tr(
                  '“{name}” and all its recorded days and notes will be deleted. Archiving keeps the history.',
                  { name: habit.name },
                ),
                confirmLabel: tr('Delete'),
                danger: true,
              });
              if (ok) {
                app.habits.delete(habit.id);
                navigate('/habits');
              }
            }}
          >
            <Trash2 size={17} />
          </button>
        </div>

        <div className="habit-detail-title">
          <HabitBadge habit={habit} size={44} />
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <h1 className="ellipsis">{habit.name}</h1>
            {habit.description && <span className="muted">{habit.description}</span>}
          </div>
          <span className="spacer" />
          <CheckButton data={data} day={data.today} size={44} />
        </div>

        <div className="card habit-year-card">
          <div className="row habit-year-nav">
            <button
              className="icon-btn"
              aria-label={tr('Previous year')}
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>{year}</strong>
            <button
              className="icon-btn"
              aria-label={tr('Next year')}
              onClick={() => setYear(year + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <YearGrid
            data={data}
            color={habit.color}
            year={year}
            onDay={(d) => void record(data, d)}
          />
          <div className="row habit-chips">
            <span className="habit-chip" title={tr('Current streak')}>
              <Flame size={13} /> {s.current}
            </span>
            <span className="habit-chip">
              <Target size={13} /> {goalLabel(habit)}
            </span>
            {habit.kind === 'quit' && <span className="habit-chip">{tr('Quit')}</span>}
          </div>
        </div>

        <div className="habit-stats">
          <StatTile
            label={
              habit.tracking === 'measure' ||
              habit.tracking === 'count' ||
              habit.tracking === 'flashcards'
                ? tr('Total')
                : tr('Completions')
            }
            value={
              habit.tracking === 'check' || habit.kind === 'quit'
                ? t.completions
                : `${formatValue(t.total)}${habit.unit ? ` ${habit.unit}` : ''}`
            }
            hint={
              habit.tracking === 'check' || habit.kind === 'quit'
                ? undefined
                : tr('{completions} days reached', { completions: t.completions })
            }
          />
          <StatTile label={tr('Completion rate')} value={`${rate} %`} />
          <StatTile
            label={tr('Current streak')}
            value={s.current}
            hint={streakUnit(s.period, s.current)}
          />
          <StatTile label={tr('Best streak')} value={s.best} hint={streakUnit(s.period, s.best)} />
        </div>

        <div className="card">
          <h2 className="card-title">
            {tr('Completions per month (')}
            {year})
          </h2>
          <BarChart
            labels={MONTHS}
            series={[{ name: tr('Completed'), color: habit.color, values: perMonth }]}
            height={150}
            ariaLabel={`Erledigungen pro Monat ${year}`}
          />
        </div>

        <MonthCalendar
          data={data}
          onTap={(d) => void record(data, d)}
          onNote={(d) => void editNote(d)}
        />

        <NotesList data={data} onEdit={(d) => void editNote(d)} />
      </div>
      {editing && <HabitEditor habit={habit} onClose={() => setEditing(false)} />}
      {sharing && <ShareCardDialog habit={habit} data={data} onClose={() => setSharing(false)} />}
    </div>
  );
}

/** "Do., 19.11.2026". */
export function formatDay(day: DayKey): string {
  return dayDate(day).toLocaleDateString(locale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Month calendar: tap toggles a day, holding it (or right-click) edits its note. */
function MonthCalendar({
  data,
  onTap,
  onNote,
}: {
  data: HabitData;
  onTap: (day: DayKey) => void;
  onNote: (day: DayKey) => void;
}): ReactNode {
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const first = `${month}-01`;
  const d0 = dayDate(first);
  const lastDay = addDays(nextPeriod(first, 'month'), -1);
  const start = addDays(first, -weekday(first));
  const end = addDays(lastDay, 6 - weekday(lastDay));
  const days = dayRange(start, end);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const shift = (n: number): void => {
    const d = new Date(d0.getFullYear(), d0.getMonth() + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const { habit } = data;
  return (
    <div className="card habit-month">
      <div className="row">
        <h2 className="card-title" style={{ margin: 0 }}>
          {d0.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
        </h2>
        <span className="spacer" />
        <button className="icon-btn" aria-label={tr('Previous month')} onClick={() => shift(-1)}>
          <ChevronLeft size={16} />
        </button>
        <button className="btn btn-sm" onClick={() => setMonth(data.today.slice(0, 7))}>
          {tr('Today')}
        </button>
        <button className="icon-btn" aria-label={tr('Next month')} onClick={() => shift(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="habit-month-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="habit-month-wd">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const inMonth = d.startsWith(month);
          const done = isDone(data, d);
          const note = Boolean(data.entries.get(d)?.note);
          const value = dayValue(data, d);
          return (
            <button
              key={d}
              className={`habit-month-day${inMonth ? '' : ' other'}${done ? ' done' : ''}${d === data.today ? ' today' : ''}`}
              disabled={d > data.today}
              aria-label={`${formatDay(d)}${done ? tr(', done') : ''}${note ? tr(', with note') : ''}`}
              style={done ? { background: habit.color } : undefined}
              onPointerDown={() => {
                held.current = false;
                hold.current = setTimeout(() => {
                  held.current = true;
                  onNote(d);
                }, 550);
              }}
              onPointerUp={() => hold.current && clearTimeout(hold.current)}
              onPointerLeave={() => hold.current && clearTimeout(hold.current)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!held.current) onNote(d);
              }}
              onClick={() => {
                if (held.current) return;
                if (d >= habit.startDay || habit.kind === 'build') onTap(d);
              }}
            >
              <span>{Number(d.slice(8))}</span>
              {habit.tracking !== 'check' && habit.kind === 'build' && value > 0 && !done && (
                <span className="habit-month-val">{formatValue(value)}</span>
              )}
              {note && <span className="habit-month-note" />}
            </button>
          );
        })}
      </div>
      <p className="faint habit-hint">{tr('Hold a day to add a note.')}</p>
    </div>
  );
}

/** Notes of the habit, newest first. */
function NotesList({
  data,
  onEdit,
}: {
  data: HabitData;
  onEdit: (day: DayKey) => void;
}): ReactNode {
  const notes = [...data.entries.values()]
    .filter((e) => e.note)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  return (
    <div className="card habit-notes">
      <div className="row">
        <h2 className="card-title" style={{ margin: 0 }}>
          {tr('Notes')}
        </h2>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => onEdit(data.today)}>
          <NotebookPen size={14} /> {tr('Today')}
        </button>
      </div>
      {notes.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>
          {tr('No notes yet. What went well? What got in the way?')}
        </p>
      ) : (
        <ul className="habit-note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <button className="habit-note" onClick={() => onEdit(n.day)}>
                <span className="faint">
                  {n.day === data.today ? tr('Today') : formatDay(n.day)}
                </span>
                <span>{n.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
