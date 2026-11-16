/**
 * Floating menus (dropdowns and context menus) positioned next to an anchor
 * element or a point, flipped to stay inside the viewport.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** An entry of a {@link Menu}. */
export type MenuEntry =
  | {
      label: ReactNode;
      icon?: ReactNode;
      hint?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { separator: true }
  | { heading: ReactNode };

/** Where to show a menu. */
export type MenuAnchor = HTMLElement | { x: number; y: number };

/** Props of {@link Menu}. */
export interface MenuProps {
  anchor: MenuAnchor;
  entries: MenuEntry[];
  onClose: () => void;
  /** Horizontal alignment relative to an element anchor. */
  align?: 'start' | 'end';
}

/** Computes a viewport-clamped position. */
function place(anchor: MenuAnchor, el: HTMLElement, align: 'start' | 'end'): { left: number; top: number } {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left: number;
  let top: number;
  if (anchor instanceof HTMLElement) {
    const r = anchor.getBoundingClientRect();
    left = align === 'end' ? r.right - w : r.left;
    top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  } else {
    left = anchor.x;
    top = anchor.y;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.y - h);
  }
  left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
  return { left, top };
}

/** A floating menu. */
export function Menu({ anchor, entries, onClose, align = 'start' }: MenuProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    if (ref.current) setPos(place(anchor, ref.current, align));
  }, [anchor, align]);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos}>
      {entries.map((entry, i) => {
        if ('separator' in entry) return <div key={i} className="menu-sep" />;
        if ('heading' in entry) return <div key={i} className="menu-label">{entry.heading}</div>;
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${entry.danger ? ' danger' : ''}`}
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            {entry.icon}
            <span className="ellipsis">{entry.label}</span>
            {entry.hint && <span className="menu-hint">{entry.hint}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/**
 * Hook managing the open state of a menu.
 *
 * @returns `[anchor, open, close]`.
 */
export function useMenu(): [MenuAnchor | null, (anchor: MenuAnchor) => void, () => void] {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  return [anchor, setAnchor, () => setAnchor(null)];
}
