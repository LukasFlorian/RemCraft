/**
 * A board of movable, resizable widgets (port of Fokus `layout.js`).
 *
 * Positions use a 24 × 24 grid relative to the board, so a layout fits any
 * window size. The layout is a per-device preference (localStorage). On
 * narrow screens widgets are simply stacked.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLocalState } from '../hooks/useLocalState';

/** Grid cells in each direction. */
const GRID = 24;

/** Position of a widget in grid cells. */
export interface WidgetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}

/** A widget definition. */
export interface Widget {
  id: string;
  title: ReactNode;
  /** Extra controls in the header. */
  actions?: ReactNode;
  render: () => ReactNode;
}

/** Props of {@link WidgetBoard}. */
export interface WidgetBoardProps {
  storageKey: string;
  widgets: Widget[];
  defaults: Record<string, WidgetRect>;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

/** Direction of an edge being dragged. */
type Axis = 'x' | 'y';

/**
 * Computes a layout after moving the grid line `line` (vertical for `x`,
 * horizontal for `y`) by `delta` cells. Like split panes, every visible
 * widget ending on that line grows or shrinks and every widget starting on it
 * moves and shrinks or grows - but only widgets that overlap the dragged
 * widget's span on the other axis (so independent columns are not affected).
 * The delta is clamped so no widget gets smaller than the minimum.
 */
export function moveEdge(
  layout: Record<string, WidgetRect>,
  ids: readonly string[],
  dragged: string,
  axis: Axis,
  line: number,
  delta: number,
): Record<string, WidgetRect> {
  const pos = axis === 'x' ? 'x' : 'y';
  const len = axis === 'x' ? 'w' : 'h';
  const opos = axis === 'x' ? 'y' : 'x';
  const olen = axis === 'x' ? 'h' : 'w';
  const min = axis === 'x' ? 3 : 2;
  const visible = ids.filter((id) => layout[id] && !layout[id]!.hidden);
  const d0 = layout[dragged]!;
  // Span along the line, grown by every touching widget (a chain of panes).
  let lo = d0[opos];
  let hi = d0[opos] + d0[olen];
  const touches = (r: WidgetRect): boolean => r[opos] < hi && r[opos] + r[olen] > lo;
  let grown = true;
  while (grown) {
    grown = false;
    for (const id of visible) {
      const r = layout[id]!;
      if ((r[pos] + r[len] === line || r[pos] === line) && touches(r)) {
        const nlo = Math.min(lo, r[opos]);
        const nhi = Math.max(hi, r[opos] + r[olen]);
        if (nlo !== lo || nhi !== hi) {
          lo = nlo;
          hi = nhi;
          grown = true;
        }
      }
    }
  }
  const before = visible.filter(
    (id) => layout[id]![pos] + layout[id]![len] === line && touches(layout[id]!),
  );
  const after = visible.filter((id) => layout[id]![pos] === line && touches(layout[id]!));
  let d = delta;
  for (const id of before) d = Math.max(d, min - layout[id]![len]);
  for (const id of after) d = Math.min(d, layout[id]![len] - min);
  if (after.length === 0) d = Math.min(d, GRID - line);
  if (d === 0) return layout;
  const next = { ...layout };
  for (const id of before) next[id] = { ...layout[id]!, [len]: layout[id]![len] + d };
  for (const id of after)
    next[id] = { ...layout[id]!, [pos]: layout[id]![pos] + d, [len]: layout[id]![len] - d };
  return next;
}

/**
 * The widget board. Widgets are moved by dragging their header and resized
 * by dragging the border between widgets (a highlighted line and a resize
 * cursor appear on hover) - no separate edit mode. Dropping a widget onto
 * another swaps their places. The layout button only
 * shows hidden widgets and the reset.
 */
export function WidgetBoard({
  storageKey,
  widgets,
  defaults,
  editing,
  onEditingChange,
}: WidgetBoardProps): ReactNode {
  const [stored, setLayout] = useLocalState<Record<string, WidgetRect>>(storageKey, defaults);
  const [order, setOrder] = useState<string[]>(widgets.map((w) => w.id));
  const [active, setActive] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const ids = widgets.map((w) => w.id);
  // Complete layout (stored values with defaults for new widgets).
  const layout: Record<string, WidgetRect> = Object.fromEntries(
    ids.map((id) => [id, stored[id] ?? defaults[id] ?? { x: 0, y: 0, w: 8, h: 8 }]),
  );
  const setRect = (id: string, patch: Partial<WidgetRect>): void =>
    setLayout({ ...layout, [id]: { ...layout[id]!, ...patch } });
  const raise = (id: string): void => setOrder((o) => [...o.filter((x) => x !== id), id]);

  /** Tracks a pointer drag in grid cells until release. */
  const track = (
    e: React.PointerEvent,
    key: string,
    onMove: (dx: number, dy: number, gx: number, gy: number) => void,
    onUp?: () => void,
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    const board = boardRef.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    setActive(key);
    const move = (ev: PointerEvent): void =>
      onMove(
        Math.round(((ev.clientX - sx) / board.width) * GRID),
        Math.round(((ev.clientY - sy) / board.height) * GRID),
        ((ev.clientX - board.left) / board.width) * GRID,
        ((ev.clientY - board.top) / board.height) * GRID,
      );
    const up = (): void => {
      setActive(null);
      onUp?.();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /**
   * Moves a widget by its header. Dropped onto another widget, the two swap
   * places (the tiling stays intact); dropped on free space it stays there.
   */
  const startMove = (id: string, e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    raise(id);
    const start = layout[id]!;
    const snapshot = layout;
    let target: string | null = null;
    track(
      e,
      `move:${id}`,
      (dx, dy, gx, gy) => {
        target =
          ids.find((other) => {
            const r = snapshot[other]!;
            return (
              other !== id &&
              !r.hidden &&
              gx >= r.x &&
              gx < r.x + r.w &&
              gy >= r.y &&
              gy < r.y + r.h
            );
          }) ?? null;
        setSwapTarget(target);
        setLayout({
          ...snapshot,
          [id]: {
            ...start,
            x: Math.min(GRID - start.w, Math.max(0, start.x + dx)),
            y: Math.min(GRID - start.h, Math.max(0, start.y + dy)),
          },
        });
      },
      () => {
        setSwapTarget(null);
        if (target)
          setLayout({
            ...snapshot,
            [id]: { ...snapshot[target]!, hidden: false },
            [target]: { ...start },
          });
      },
    );
  };

  /** Resizes along the right (x) or bottom (y) border of a widget. */
  const startEdge = (id: string, axis: Axis, e: React.PointerEvent): void => {
    const r = layout[id]!;
    const line = axis === 'x' ? r.x + r.w : r.y + r.h;
    const snapshot = layout;
    track(e, `${axis}:${id}`, (dx, dy) =>
      setLayout(moveEdge(snapshot, ids, id, axis, line, axis === 'x' ? dx : dy)),
    );
  };

  const hidden = widgets.filter((w) => layout[w.id]!.hidden);
  return (
    <div className={`widget-board${active ? ' dragging' : ''}`} ref={boardRef}>
      {editing && (
        <div className="board-bar">
          <span>
            Kopfzeile ziehen = verschieben, Grenze zwischen Widgets ziehen = Größe ändern.
          </span>
          {hidden.map((w) => (
            <button
              key={w.id}
              className="btn btn-sm"
              onClick={() => setRect(w.id, { hidden: false })}
            >
              + {w.title}
            </button>
          ))}
          <button className="btn btn-sm" onClick={() => setLayout(defaults)}>
            Standard-Layout
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => onEditingChange(false)}>
            Fertig
          </button>
        </div>
      )}
      {widgets
        .filter((w) => !layout[w.id]!.hidden)
        .map((w) => {
          const r = layout[w.id]!;
          return (
            <section
              key={w.id}
              className={`widget${active === `move:${w.id}` ? ' moving' : ''}${swapTarget === w.id ? ' swap-target' : ''}`}
              data-w={w.id}
              style={{
                left: `${(r.x / GRID) * 100}%`,
                top: `${(r.y / GRID) * 100}%`,
                width: `${(r.w / GRID) * 100}%`,
                height: `${(r.h / GRID) * 100}%`,
                zIndex: order.indexOf(w.id) + 1,
              }}
              onPointerDown={() => raise(w.id)}
            >
              <header
                className="widget-head"
                onPointerDown={(e) => startMove(w.id, e)}
                title="Ziehen zum Verschieben"
              >
                <span className="widget-title">{w.title}</span>
                <span className="spacer" />
                {w.actions}
                <button
                  className="icon-btn widget-hide"
                  aria-label="Ausblenden"
                  title="Ausblenden (über das Layout-Symbol wieder einblenden)"
                  onClick={() => setRect(w.id, { hidden: true })}
                >
                  <X size={13} />
                </button>
              </header>
              <div className="widget-body">{w.render()}</div>
            </section>
          );
        })}
      {/* Resize handles in their own layer above all widgets (a neighbour must not cover them). */}
      {widgets
        .filter((w) => !layout[w.id]!.hidden)
        .flatMap((w) => {
          const r = layout[w.id]!;
          const pct = (v: number): string => `${(v / GRID) * 100}%`;
          return [
            r.x + r.w < GRID && (
              <span
                key={`x:${w.id}`}
                data-edge={`x:${w.id}`}
                className={`widget-edge edge-x${active === `x:${w.id}` ? ' active' : ''}`}
                style={{ left: pct(r.x + r.w), top: pct(r.y), height: pct(r.h) }}
                onPointerDown={(e) => startEdge(w.id, 'x', e)}
              />
            ),
            r.y + r.h < GRID && (
              <span
                key={`y:${w.id}`}
                data-edge={`y:${w.id}`}
                className={`widget-edge edge-y${active === `y:${w.id}` ? ' active' : ''}`}
                style={{ top: pct(r.y + r.h), left: pct(r.x), width: pct(r.w) }}
                onPointerDown={(e) => startEdge(w.id, 'y', e)}
              />
            ),
          ];
        })}
    </div>
  );
}
