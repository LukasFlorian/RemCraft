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

/** The widget board. */
export function WidgetBoard({
  storageKey,
  widgets,
  defaults,
  editing,
  onEditingChange,
}: WidgetBoardProps): ReactNode {
  const [layout, setLayout] = useLocalState<Record<string, WidgetRect>>(storageKey, defaults);
  const [order, setOrder] = useState<string[]>(widgets.map((w) => w.id));
  const boardRef = useRef<HTMLDivElement>(null);
  const rectOf = (id: string): WidgetRect =>
    layout[id] ?? defaults[id] ?? { x: 0, y: 0, w: 8, h: 8 };
  const setRect = (id: string, patch: Partial<WidgetRect>): void =>
    setLayout((l) => ({ ...l, [id]: { ...rectOf(id), ...l[id], ...patch } }));
  const raise = (id: string): void => setOrder((o) => [...o.filter((x) => x !== id), id]);

  /** Drag (move or resize) in grid units. */
  const drag = (id: string, e: React.PointerEvent, mode: 'move' | 'resize'): void => {
    if (!editing) return;
    e.preventDefault();
    raise(id);
    const board = boardRef.current!.getBoundingClientRect();
    const start = rectOf(id);
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent): void => {
      const dx = Math.round(((ev.clientX - sx) / board.width) * GRID);
      const dy = Math.round(((ev.clientY - sy) / board.height) * GRID);
      if (mode === 'move')
        setRect(id, {
          x: Math.min(GRID - start.w, Math.max(0, start.x + dx)),
          y: Math.min(GRID - start.h, Math.max(0, start.y + dy)),
        });
      else
        setRect(id, {
          w: Math.min(GRID - start.x, Math.max(3, start.w + dx)),
          h: Math.min(GRID - start.y, Math.max(2, start.h + dy)),
        });
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hidden = widgets.filter((w) => rectOf(w.id).hidden);
  return (
    <div className={`widget-board${editing ? ' editing' : ''}`} ref={boardRef}>
      {editing && (
        <div className="board-bar">
          <span>
            Layout bearbeiten: Kopfzeile ziehen = verschieben, Ecke = Größe, × = ausblenden.
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
        .filter((w) => !rectOf(w.id).hidden)
        .map((w) => {
          const r = rectOf(w.id);
          return (
            <section
              key={w.id}
              className="widget"
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
              <header className="widget-head" onPointerDown={(e) => drag(w.id, e, 'move')}>
                <span className="widget-title">{w.title}</span>
                <span className="spacer" />
                {w.actions}
                {editing && (
                  <button
                    className="icon-btn"
                    aria-label="Ausblenden"
                    onClick={() => setRect(w.id, { hidden: true })}
                  >
                    <X size={14} />
                  </button>
                )}
              </header>
              <div className="widget-body">{w.render()}</div>
              {editing && (
                <span className="widget-resize" onPointerDown={(e) => drag(w.id, e, 'resize')} />
              )}
            </section>
          );
        })}
    </div>
  );
}
