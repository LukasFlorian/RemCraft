/**
 * Habit overview (`#/habits`): every habit with today's check button, in one
 * of three layouts - cards with a tile grid, a checklist of the last five
 * days, or compact rows with the current week. Drag the handle to reorder.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Archive, BarChart3, GripVertical, LayoutGrid, List, ListChecks, Plus } from 'lucide-react';
import type { Habit } from '@core/model/types';
import { addDays, weekday } from '@core/habits/days';
import { isDone, streaks, streakUnit } from '@core/habits/habits';
import { selectHabits } from '@data/services/habits';
import { useApp, useSelector } from '../app/context';
import { useLocalState } from '../hooks/useLocalState';
import { HabitEditor, WEEKDAYS } from './HabitEditor';
import { RecentGrid } from './HabitGrid';
import { CheckButton, HabitBadge, useHabitData, useRecordDay, useToday } from './common';

/** Overview layouts. */
type Layout = 'grid' | 'checklist' | 'compact';

/** The overview page. */
export function HabitsPage(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const habits = useSelector((s) => selectHabits(s));
  const archived = useSelector((s) => selectHabits(s, true));
  const [layout, setLayout] = useLocalState<Layout>('habits.layout', 'grid');
  const [editing, setEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const list = showArchived ? archived : habits;

  return (
    <div className="main-scroll">
      <div className="page habits-page">
        <div className="page-header habits-header">
          <h1>Gewohnheiten</h1>
          <span className="spacer" />
          <button
            className="icon-btn"
            title="Statistik"
            aria-label="Statistik"
            onClick={() => navigate('/habits/stats')}
          >
            <BarChart3 size={18} />
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            <Plus size={15} /> Neu
          </button>
        </div>

        {list.length === 0 && !showArchived && (
          <div className="card col habits-empty" style={{ gap: 10 }}>
            <strong>Ein Tippen pro Tag.</strong>
            <span className="muted">
              Lege eine Gewohnheit an – Sport, Seiten lesen, Wasser trinken, ein Tag ohne Zucker.
              Jeder erledigte Tag füllt eine Kachel, und das Raster wird zu einer Kette, die du
              nicht reißen lassen willst.
            </span>
            <button
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setEditing(true)}
            >
              <Plus size={15} /> Erste Gewohnheit anlegen
            </button>
          </div>
        )}

        {layout === 'checklist' && list.length > 0 && <ChecklistHeader />}
        <div className={`habit-list habit-list-${layout}`}>
          {list.map((h) => (
            <div
              key={h.id}
              className={`habit-drag${dragId === h.id ? ' dragging' : ''}`}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== h.id) app.habits.move(dragId, h.id);
                setDragId(null);
              }}
            >
              {layout === 'grid' && <HabitCard habit={h} onDrag={setDragId} />}
              {layout === 'checklist' && <ChecklistRow habit={h} onDrag={setDragId} />}
              {layout === 'compact' && <CompactRow habit={h} onDrag={setDragId} />}
            </div>
          ))}
        </div>

        {(archived.length > 0 || showArchived) && (
          <button
            className="link-btn habits-archived"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive size={14} />{' '}
            {showArchived ? 'Zurück zu den aktiven' : `Archiv (${archived.length})`}
          </button>
        )}

        <div className="habit-layout-bar" role="tablist" aria-label="Ansicht">
          {(
            [
              ['grid', LayoutGrid, 'Raster'],
              ['checklist', ListChecks, 'Checkliste'],
              ['compact', List, 'Kompakt'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={layout === id}
              aria-label={label}
              title={label}
              className={layout === id ? 'active' : ''}
              onClick={() => setLayout(id)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>
      {editing && (
        <HabitEditor
          onClose={(id) => {
            setEditing(false);
            if (id) navigate(`/habits/${id}`);
          }}
        />
      )}
    </div>
  );
}

/** Drag handle (desktop) for reordering. */
function DragHandle({
  id,
  onDrag,
}: {
  id: string;
  onDrag: (id: string | null) => void;
}): ReactNode {
  return (
    <span
      className="habit-handle"
      draggable
      title="Ziehen zum Sortieren"
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDrag(id);
      }}
      onDragEnd={() => onDrag(null)}
    >
      <GripVertical size={14} />
    </span>
  );
}

/** Card with icon, name, today's button and the recent tile grid. */
function HabitCard({
  habit,
  onDrag,
}: {
  habit: Habit;
  onDrag: (id: string | null) => void;
}): ReactNode {
  const navigate = useNavigate();
  const data = useHabitData(habit);
  const today = useToday();
  const s = streaks(data);
  return (
    <div
      className="card habit-card"
      style={{ '--hc': habit.color } as React.CSSProperties}
      data-testid="habit-card"
    >
      <div className="habit-card-head">
        <DragHandle id={habit.id} onDrag={onDrag} />
        <button className="habit-card-title" onClick={() => navigate(`/habits/${habit.id}`)}>
          <HabitBadge habit={habit} />
          <span className="col" style={{ gap: 2, minWidth: 0 }}>
            <strong className="ellipsis">{habit.name}</strong>
            <span className="faint ellipsis habit-desc">
              {habit.description || `${s.current} ${streakUnit(s.period, s.current)} Serie`}
            </span>
          </span>
        </button>
        <CheckButton data={data} day={today} />
      </div>
      <button
        className="habit-card-grid"
        aria-label={`${habit.name} öffnen`}
        onClick={() => navigate(`/habits/${habit.id}`)}
      >
        <RecentGrid data={data} color={habit.color} />
      </button>
    </div>
  );
}

/** Day columns of the checklist (last five days, today on the right). */
function useChecklistDays(): string[] {
  const today = useToday();
  return [4, 3, 2, 1, 0].map((n) => addDays(today, -n));
}

/** Column header of the checklist layout. */
function ChecklistHeader(): ReactNode {
  const days = useChecklistDays();
  return (
    <div className="habit-checklist-head">
      <span />
      {days.map((d) => (
        <span key={d} className="habit-checklist-day">
          <span>{WEEKDAYS[weekday(d)]}</span>
          <strong>{Number(d.slice(8))}</strong>
        </span>
      ))}
    </div>
  );
}

/** Habit with tappable tiles for the last five days. */
function ChecklistRow({
  habit,
  onDrag,
}: {
  habit: Habit;
  onDrag: (id: string | null) => void;
}): ReactNode {
  const navigate = useNavigate();
  const data = useHabitData(habit);
  const record = useRecordDay();
  const days = useChecklistDays();
  return (
    <div className="habit-checklist-row" data-testid="habit-row">
      <span className="row" style={{ gap: 6, minWidth: 0 }}>
        <DragHandle id={habit.id} onDrag={onDrag} />
        <button className="habit-row-title" onClick={() => navigate(`/habits/${habit.id}`)}>
          <HabitBadge habit={habit} size={28} />
          <span className="ellipsis">{habit.name}</span>
        </button>
      </span>
      {days.map((d) => (
        <button
          key={d}
          className="habit-day-tile"
          aria-label={`${habit.name} ${d}`}
          disabled={d < habit.startDay || habit.tracking === 'flashcards'}
          onClick={() => void record(data, d)}
          style={{
            background: isDone(data, d)
              ? habit.color
              : `color-mix(in srgb, ${habit.color} 16%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

/** One line per habit with the current week as small tiles. */
function CompactRow({
  habit,
  onDrag,
}: {
  habit: Habit;
  onDrag: (id: string | null) => void;
}): ReactNode {
  const navigate = useNavigate();
  const data = useHabitData(habit);
  const today = useToday();
  const monday = addDays(today, -weekday(today));
  const s = streaks(data);
  return (
    <div className="habit-compact-row" data-testid="habit-row">
      <DragHandle id={habit.id} onDrag={onDrag} />
      <button className="habit-row-title" onClick={() => navigate(`/habits/${habit.id}`)}>
        <HabitBadge habit={habit} size={26} />
        <span className="ellipsis">{habit.name}</span>
      </button>
      <span className="habit-week" aria-hidden>
        {WEEKDAYS.map((_, i) => {
          const d = addDays(monday, i);
          return (
            <span
              key={d}
              className="habit-week-tile"
              style={{
                background:
                  d > today
                    ? 'var(--habit-empty)'
                    : isDone(data, d)
                      ? habit.color
                      : `color-mix(in srgb, ${habit.color} 16%, transparent)`,
              }}
            />
          );
        })}
      </span>
      <span className="faint habit-streak-mini" title="Aktuelle Serie">
        {s.current}
      </span>
      <CheckButton data={data} day={today} size={32} />
    </div>
  );
}
