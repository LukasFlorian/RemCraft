/**
 * Habit overview (`#/habits`): every habit with today's check button, in one
 * of three layouts - cards with a tile grid, a checklist of the last five
 * days, or compact rows with the current week. Drag the handle to reorder
 * (mouse and touch; the card follows the pointer and a line shows where it
 * lands), or focus it and use the arrow keys.
 */
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
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
  const list = showArchived ? archived : habits;
  const { drag, startDrag, itemRef, moveByKey } = useReorder(list, (id, beforeId) =>
    app.habits.move(id, beforeId),
  );
  /** Id of the habit the drop line is drawn in front of (`''` = after the last one). */
  const lineBefore = drag?.changed ? (drag.beforeId ?? '') : null;
  const handle = { start: startDrag, key: moveByKey };

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
        <div className={`habit-list habit-list-${layout}${drag ? ' is-sorting' : ''}`}>
          {list.map((h) => (
            <div key={h.id} className="habit-drag-slot">
              {lineBefore === h.id && <DropLine />}
              <div
                ref={itemRef(h.id)}
                className={`habit-drag${drag?.id === h.id ? ' dragging' : ''}`}
                style={drag?.id === h.id ? { transform: `translateY(${drag.dy}px)` } : undefined}
              >
                {layout === 'grid' && <HabitCard habit={h} handle={handle} />}
                {layout === 'checklist' && <ChecklistRow habit={h} handle={handle} />}
                {layout === 'compact' && <CompactRow habit={h} handle={handle} />}
              </div>
            </div>
          ))}
          {lineBefore === '' && <DropLine />}
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

/** Handlers passed to the drag handles. */
interface HandleApi {
  start: (id: string, e: ReactPointerEvent) => void;
  key: (id: string, e: ReactKeyboardEvent) => void;
}

/** State of a running drag. */
interface DragState {
  id: string;
  /** Vertical offset of the dragged item from where it started. */
  dy: number;
  /** Habit the item would be dropped in front of (`null` = end of the list). */
  beforeId: string | null;
  /** The drop position differs from the current one. */
  changed: boolean;
}

/**
 * Pointer-based reordering (mouse, pen and touch) with a drop position, plus
 * arrow keys on a focused handle.
 *
 * Args:
 *   list: Items in their current order.
 *   move: Moves `id` in front of `beforeId` (`null` = to the end).
 */
function useReorder(
  list: readonly Habit[],
  move: (id: string, beforeId: string | null) => void,
): {
  drag: DragState | null;
  startDrag: (id: string, e: ReactPointerEvent) => void;
  itemRef: (id: string) => (el: HTMLDivElement | null) => void;
  moveByKey: (id: string, e: ReactKeyboardEvent) => void;
} {
  const [drag, setDragState] = useState<DragState | null>(null);
  // Latest state for the pointer-up handler (no side effects in state updaters).
  const latest = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null): void => {
    latest.current = d;
    setDragState(d);
  };
  const elements = useRef(new Map<string, HTMLDivElement>());
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const itemRef =
    (id: string) =>
    (el: HTMLDivElement | null): void => {
      if (el) elements.current.set(id, el);
      else elements.current.delete(id);
    };

  const startDrag = (id: string, e: ReactPointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ids = list.map((h) => h.id);
    const others = ids.filter((x) => x !== id);
    const scroller = elements.current.get(id)?.closest('.main-scroll') ?? null;
    // Centres of the other items in content coordinates (they do not move).
    const top0 = scroller?.scrollTop ?? 0;
    const centres = others.map((x) => {
      const r = elements.current.get(x)?.getBoundingClientRect();
      return r ? r.top + top0 + r.height / 2 : 0;
    });
    const startY = e.clientY + top0;
    const own = elements.current.get(id)?.getBoundingClientRect();
    const ownCentre = own ? own.top + top0 + own.height / 2 : startY;
    const currentIndex = ids.indexOf(id);
    let pointerY = e.clientY;

    const update = (): void => {
      const scrollTop = scroller?.scrollTop ?? 0;
      const y = pointerY + scrollTop;
      const centre = ownCentre + (y - startY);
      const slot = centres.filter((c) => c < centre).length;
      setDrag({
        id,
        dy: y - startY,
        beforeId: others[slot] ?? null,
        changed: slot !== currentIndex,
      });
    };
    // Scroll while the pointer is near the top or bottom edge.
    let frame = 0;
    const autoScroll = (): void => {
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const edge = 70;
        const speed =
          pointerY < r.top + edge
            ? -Math.ceil((r.top + edge - pointerY) / 6)
            : pointerY > r.bottom - edge
              ? Math.ceil((pointerY - (r.bottom - edge)) / 6)
              : 0;
        if (speed !== 0) {
          scroller.scrollTop += speed;
          update();
        }
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const onMove = (ev: PointerEvent): void => {
      pointerY = ev.clientY;
      update();
    };
    const finish = (commit: boolean): void => {
      cleanup.current?.();
      const d = latest.current;
      setDrag(null);
      if (commit && d?.changed) move(d.id, d.beforeId);
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => finish(false);
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    frame = requestAnimationFrame(autoScroll);
    cleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(frame);
      cleanup.current = null;
    };
    update();
  };

  const moveByKey = (id: string, e: ReactKeyboardEvent): void => {
    const i = list.findIndex((h) => h.id === id);
    if (e.key === 'ArrowUp' && i > 0) move(id, list[i - 1]!.id);
    else if (e.key === 'ArrowDown' && i < list.length - 1) move(id, list[i + 2]?.id ?? null);
    else return;
    e.preventDefault();
  };

  return { drag, startDrag, itemRef, moveByKey };
}

/** Line that shows where the dragged habit will land. */
function DropLine(): ReactNode {
  return <div className="habit-drop-line" data-testid="habit-drop-line" aria-hidden />;
}

/** Drag handle for reordering (mouse, touch, arrow keys). */
function DragHandle({ id, handle }: { id: string; handle: HandleApi }): ReactNode {
  return (
    <button
      type="button"
      className="habit-handle"
      title="Ziehen zum Sortieren (oder Pfeiltasten)"
      aria-label="Verschieben"
      onPointerDown={(e) => handle.start(id, e)}
      onKeyDown={(e) => handle.key(id, e)}
    >
      <GripVertical size={14} />
    </button>
  );
}

/** Card with icon, name, today's button and the recent tile grid. */
function HabitCard({ habit, handle }: { habit: Habit; handle: HandleApi }): ReactNode {
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
        <DragHandle id={habit.id} handle={handle} />
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
function ChecklistRow({ habit, handle }: { habit: Habit; handle: HandleApi }): ReactNode {
  const navigate = useNavigate();
  const data = useHabitData(habit);
  const record = useRecordDay();
  const days = useChecklistDays();
  return (
    <div className="habit-checklist-row" data-testid="habit-row">
      <span className="row" style={{ gap: 6, minWidth: 0 }}>
        <DragHandle id={habit.id} handle={handle} />
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
function CompactRow({ habit, handle }: { habit: Habit; handle: HandleApi }): ReactNode {
  const navigate = useNavigate();
  const data = useHabitData(habit);
  const today = useToday();
  const monday = addDays(today, -weekday(today));
  const s = streaks(data);
  return (
    <div className="habit-compact-row" data-testid="habit-row">
      <DragHandle id={habit.id} handle={handle} />
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
