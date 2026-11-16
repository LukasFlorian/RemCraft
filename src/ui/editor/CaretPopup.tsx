/**
 * The popup attached to the caret: the slash command menu (`/`) and the
 * autocomplete for references (`[[`), tags (`#`) and portals (`((`).
 *
 * Keyboard events are routed here by the editor through
 * `controller.popupKeys` while the popup is open.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileText, Folder, Plus } from 'lucide-react';
import type { RemId } from '@core/model/types';
import { useApp, useSelector } from '../app/context';
import { searchStore } from '../hooks/search';
import { useRemTitle } from '../hooks/useRemTitle';
import { COMMAND_GROUPS, COMMANDS, filterCommands } from './commands';
import type { SlashCommand } from './commands';
import type { PopupState } from './controller';
import { useController, useControllerState } from './controller';
import { schema } from './schema';
import { useCommandContextFactory } from './useCommandContext';

/** Renders the open caret popup, if any. */
export function CaretPopup(): ReactNode {
  const popup = useControllerState((s) => s.popup);
  if (!popup) return null;
  return popup.kind === 'slash' ? <SlashMenu popup={popup} /> : <Autocomplete popup={popup} />;
}

/** Positions a popup below (or above) the caret. */
function usePopupPosition(
  popup: PopupState,
): [React.RefObject<HTMLDivElement | null>, { left: number; top: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: popup.left, top: popup.bottom + 6 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    let top = popup.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, popup.top - h - 6);
    const left = Math.min(Math.max(8, popup.left), window.innerWidth - w - 8);
    setPos({ left, top });
  }, [popup.left, popup.top, popup.bottom]);
  return [ref, pos];
}

/** Removes the trigger text and returns the view (if still mounted). */
function consumeTrigger(
  popup: PopupState,
  controller: ReturnType<typeof useController>,
): ReturnType<typeof useController>['activeView'] {
  const active = controller.activeView;
  if (!active || active.remId !== popup.remId) return null;
  const { view } = active;
  const to = Math.min(popup.to, view.state.doc.content.size - 1);
  view.dispatch(view.state.tr.delete(popup.from, to));
  controller.setPopup(null);
  return active;
}

// ---------------------------------------------------------------------------
// Slash menu
// ---------------------------------------------------------------------------

function SlashMenu({ popup }: { popup: PopupState }): ReactNode {
  const app = useApp();
  const controller = useController();
  const makeCtx = useCommandContextFactory();
  const rem = useSelector((s) => s.get(popup.remId));
  const [ref, pos] = usePopupPosition(popup);
  const [groupIndex, setGroupIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [column, setColumn] = useState<'groups' | 'items'>(popup.query ? 'items' : 'groups');

  const ctx = rem ? makeCtx(popup.remId, popup.instance) : null;
  // Filtering is cheap (≈ 80 commands), so it runs on every render.
  const filtered = ctx && rem ? filterCommands(ctx, rem, popup.query) : [];
  const groups = COMMAND_GROUPS.filter((g) => filtered.some((c) => c.group === g));
  const items: SlashCommand[] = popup.query
    ? filtered
    : filtered.filter((c) => c.group === groups[groupIndex]);

  useEffect(() => {
    setItemIndex(0);
    setColumn(popup.query ? 'items' : 'groups');
  }, [popup.query]);

  /** Runs a command after removing the `/query` text. */
  const run = (cmd: SlashCommand): void => {
    consumeTrigger(popup, controller);
    const current = app.store.get(popup.remId);
    if (!current) return;
    void cmd.run(makeCtx(popup.remId, popup.instance), current);
  };

  controller.popupKeys = (key) => {
    switch (key) {
      case 'ArrowDown':
        if (column === 'groups' && !popup.query)
          setGroupIndex((i) => Math.min(i + 1, groups.length - 1));
        else setItemIndex((i) => Math.min(i + 1, items.length - 1));
        return true;
      case 'ArrowUp':
        if (column === 'groups' && !popup.query) setGroupIndex((i) => Math.max(i - 1, 0));
        else setItemIndex((i) => Math.max(i - 1, 0));
        return true;
      case 'ArrowRight':
        if (!popup.query && column === 'groups') {
          setColumn('items');
          setItemIndex(0);
          return true;
        }
        return false;
      case 'ArrowLeft':
        if (!popup.query && column === 'items') {
          setColumn('groups');
          return true;
        }
        return false;
      case 'Enter':
      case 'Tab': {
        if (!popup.query && column === 'groups') {
          setColumn('items');
          setItemIndex(0);
          return true;
        }
        const cmd = items[itemIndex];
        if (cmd) run(cmd);
        return true;
      }
      case 'Escape':
        controller.setPopup(null);
        return true;
    }
    return false;
  };
  useEffect(() => () => void (controller.popupKeys = null), [controller]);

  if (!rem) return null;
  return createPortal(
    <div ref={ref} className="slash-menu" style={pos} onMouseDown={(e) => e.preventDefault()}>
      {!popup.query && (
        <div className="slash-groups">
          {groups.map((g, i) => (
            <button
              key={g}
              className={`menu-item${i === groupIndex ? ' active' : ''}`}
              onMouseEnter={() => {
                setGroupIndex(i);
                setColumn('groups');
              }}
              onClick={() => {
                setGroupIndex(i);
                setColumn('items');
              }}
            >
              {(() => {
                const Icon = COMMANDS.find((c) => c.group === g)?.icon;
                return Icon ? <Icon size={16} /> : null;
              })()}
              <span className="ellipsis">{g}</span>
              <ChevronRight size={14} className="menu-hint" />
            </button>
          ))}
        </div>
      )}
      <div className="slash-items">
        {!popup.query && <div className="menu-label">{groups[groupIndex]}</div>}
        {items.length === 0 && <div className="menu-item faint">No matching command</div>}
        {items.map((cmd, i) => (
          <button
            key={cmd.id}
            className={`menu-item${column === 'items' && i === itemIndex ? ' active' : ''}`}
            onMouseEnter={() => {
              setItemIndex(i);
              setColumn('items');
            }}
            onClick={() => run(cmd)}
          >
            <cmd.icon size={16} />
            <span className="ellipsis">{cmd.label}</span>
            {cmd.hint && <span className="menu-hint kbd">{cmd.hint}</span>}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

/** One autocomplete option. */
type Option = { kind: 'rem'; remId: RemId } | { kind: 'create'; name: string };

function Autocomplete({ popup }: { popup: PopupState }): ReactNode {
  const app = useApp();
  const controller = useController();
  const [ref, pos] = usePopupPosition(popup);
  const [index, setIndex] = useState(0);
  const hits = useSelector((s) => (popup.query ? searchStore(s, popup.query, 8) : null));
  const recent = useSelector((s) =>
    s.memo('recentDocs', [s.collectionVersion('rems')], () =>
      [...s.all('rems')]
        .filter((r) => r.isDocument)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    ),
  );
  const options: Option[] = [
    ...(hits ? hits.map((h) => h.remId) : recent.map((r) => r.id))
      .filter((id) => id !== popup.remId)
      .map((remId): Option => ({ kind: 'rem', remId })),
  ];
  if (popup.query.trim() && popup.kind !== 'portal')
    options.push({ kind: 'create', name: popup.query.trim() });

  useEffect(() => setIndex(0), [popup.query]);

  /** Applies the chosen option. */
  const choose = (opt: Option): void => {
    const active = consumeTrigger(popup, controller);
    const targetId = opt.kind === 'rem' ? opt.remId : app.rems.ensureByName(opt.name);
    if (popup.kind === 'ref') {
      if (active) {
        const node = schema.nodes.ref!.create({ remId: targetId });
        active.view.dispatch(
          active.view.state.tr.replaceSelectionWith(node, false).insertText(' '),
        );
        active.view.focus();
      }
    } else if (popup.kind === 'tag') {
      app.rems.addTag(popup.remId, targetId);
      active?.view.focus();
    } else if (popup.kind === 'portal') {
      const rem = app.store.get(popup.remId);
      if (!rem) return;
      const blank = rem.text.length === 0 && rem.back === null;
      if (blank) app.rems.update(rem.id, { portalOf: targetId });
      else app.rems.create({ parentId: rem.parentId, afterId: rem.id }, { portalOf: targetId });
      controller.blur();
    }
  };

  controller.popupKeys = (key) => {
    switch (key) {
      case 'ArrowDown':
        setIndex((i) => Math.min(i + 1, options.length - 1));
        return true;
      case 'ArrowUp':
        setIndex((i) => Math.max(i - 1, 0));
        return true;
      case 'Enter':
      case 'Tab': {
        const opt = options[index];
        if (opt) {
          choose(opt);
          return true;
        }
        return false;
      }
      case 'Escape':
        controller.setPopup(null);
        return true;
    }
    return false;
  };
  useEffect(() => () => void (controller.popupKeys = null), [controller]);

  const label = popup.kind === 'ref' ? 'Reference' : popup.kind === 'tag' ? 'Tag' : 'Portal';
  return createPortal(
    <div
      ref={ref}
      className="autocomplete menu"
      style={pos}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="menu-label">
        {label}
        {popup.query ? `: ${popup.query}` : ' - recent documents'}
      </div>
      {options.length === 0 && <div className="menu-item faint">Type to search…</div>}
      {options.map((opt, i) => (
        <button
          key={opt.kind === 'rem' ? opt.remId : 'create'}
          className={`menu-item${i === index ? ' active' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onClick={() => choose(opt)}
        >
          {opt.kind === 'rem' ? (
            <RemOption remId={opt.remId} />
          ) : (
            <>
              <Plus size={16} />
              <span className="ellipsis">Create “{opt.name}”</span>
            </>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Title + location of a search hit. */
function RemOption({ remId }: { remId: RemId }): ReactNode {
  const rem = useSelector((s) => s.get(remId));
  const title = useRemTitle(remId);
  const parentTitle = useRemTitle(rem?.parentId ?? null, '');
  const Icon = rem?.isFolder ? Folder : FileText;
  return (
    <>
      <Icon size={16} className="faint" />
      <span className="col" style={{ gap: 0, minWidth: 0 }}>
        <span className="ellipsis">{title}</span>
        {parentTitle && (
          <span className="ellipsis faint" style={{ fontSize: 12 }}>
            {parentTitle}
          </span>
        )}
      </span>
    </>
  );
}
