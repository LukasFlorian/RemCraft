/**
 * Left navigation: main destinations, pinned and unpinned documents/folders,
 * due-card badge, sync status and settings.
 */
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  HelpCircle,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  Presentation,
  PlusCircle,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import type { Rem, RemId } from '@core/model/types';
import { ordersBetween } from '@core/model/ordering';
import { selectGlobalQueue } from '@data/selectors';
import { useAccount, useApp, useNow, useSelector } from '../app/context';
import { useModals } from '../app/modals';
import { useLocalState } from '../hooks/useLocalState';
import { useRemTitle } from '../hooks/useRemTitle';
import { useActiveLecture } from '../lecture/useLecture';
import { RemIcon } from '../components/RemIcon';

/** Documents and folders below a Rem (what the sidebar tree shows). */
function useDocChildren(id: RemId | null): Rem[] {
  return useSelector((s) =>
    s.memo(`docChildren:${id}`, [s.collectionVersion('rems')], () =>
      s.children(id).filter((r) => r.isDocument || r.isFolder),
    ),
  );
}

/** Where a dragged item would land relative to a tree item. */
type DropZone = 'before' | 'after' | 'inside';

/** Drag & drop state shared by the sidebar trees. */
interface SidebarDnd {
  dragging: RemId | null;
  over: { id: RemId; zone: DropZone; section: 'pinned' | 'tree' } | null;
  setDragging: (id: RemId | null) => void;
  setOver: (o: SidebarDnd['over']) => void;
  drop: (target: Rem, zone: DropZone, section: 'pinned' | 'tree') => void;
}

const DndContext = createContext<SidebarDnd | null>(null);

/** Drop zone from the pointer position inside a row (top/bottom quarter = between rows). */
function zoneAt(e: React.DragEvent<HTMLElement>): DropZone {
  const r = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
}

/** One tree item (recursive, draggable). */
function TreeItem({
  rem,
  depth,
  expanded,
  toggle,
  section,
}: {
  rem: Rem;
  depth: number;
  expanded: Record<string, boolean>;
  toggle: (id: RemId) => void;
  section: 'pinned' | 'tree';
}): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const dnd = useContext(DndContext)!;
  const title = useRemTitle(rem.id);
  const kids = useDocChildren(rem.id);
  const open = expanded[rem.id] ?? (rem.pinned && depth === 0);
  const active = location.pathname === `/rem/${rem.id}`;
  const over = dnd.over?.id === rem.id && dnd.over.section === section ? dnd.over.zone : null;
  return (
    <>
      <div
        className={`tree-item${active ? ' active' : ''}${over ? ` drop-${over}` : ''}${dnd.dragging === rem.id ? ' dragging' : ''}`}
        style={{ paddingLeft: 6 + depth * 16 }}
        onClick={() => navigate(`/rem/${rem.id}`)}
        role="treeitem"
        aria-expanded={kids.length > 0 ? Boolean(open) : undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', rem.id);
          dnd.setDragging(rem.id);
        }}
        onDragEnd={() => (dnd.setDragging(null), dnd.setOver(null))}
        onDragOver={(e) => {
          if (!dnd.dragging || dnd.dragging === rem.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const zone = zoneAt(e);
          if (dnd.over?.id !== rem.id || dnd.over.zone !== zone || dnd.over.section !== section)
            dnd.setOver({ id: rem.id, zone, section });
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dnd.dragging && dnd.dragging !== rem.id) dnd.drop(rem, zoneAt(e), section);
          dnd.setDragging(null);
          dnd.setOver(null);
        }}
      >
        {kids.length > 0 ? (
          <button
            className={`tree-toggle${open ? ' open' : ''}`}
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(rem.id);
            }}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <RemIcon rem={rem} />
        <span className="ellipsis">{title}</span>
      </div>
      {open &&
        kids.map((k) => (
          <TreeItem
            key={k.id}
            rem={k}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            section={section}
          />
        ))}
    </>
  );
}

/** Props of {@link Sidebar}. */
export interface SidebarProps {
  onCollapse: () => void;
  onNavigate?: () => void;
}

/** The sidebar. */
export function Sidebar({ onCollapse, onNavigate }: SidebarProps): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const modals = useModals();
  const account = useAccount();
  const now = useNow();
  const [expanded, setExpanded] = useLocalState<Record<string, boolean>>('sidebar.expanded', {});
  const [pinnedOpen, setPinnedOpen] = useLocalState('sidebar.pinnedOpen', true);
  const [unpinnedOpen, setUnpinnedOpen] = useLocalState('sidebar.unpinnedOpen', true);
  const due = useSelector((s) => selectGlobalQueue(s, now).length);
  const activeLecture = useActiveLecture();
  const editLater = useSelector((s) =>
    s.memo(
      'editLaterCount',
      [s.collectionVersion('rems')],
      () => s.all('rems').filter((r) => r.editLater).length,
    ),
  );
  const pinned = useSelector((s) =>
    s.memo('pinned', [s.collectionVersion('rems')], () =>
      s
        .all('rems')
        .filter((r) => r.pinned)
        // Manually ordered pins first (drag & drop), the rest by creation.
        .sort((a, b) =>
          a.pinOrder && b.pinOrder
            ? a.pinOrder < b.pinOrder
              ? -1
              : a.pinOrder > b.pinOrder
                ? 1
                : 0
            : a.pinOrder
              ? -1
              : b.pinOrder
                ? 1
                : a.createdAt - b.createdAt,
        ),
    ),
  );
  const topLevel = useDocChildren(null).filter((r) => !r.pinned);

  // --- drag & drop ----------------------------------------------------------
  const [dragging, setDragging] = useState<RemId | null>(null);
  const [over, setOver] = useState<SidebarDnd['over']>(null);
  const [overSection, setOverSection] = useState<'pinned' | 'tree' | null>(null);
  /** Writes a new pin order (and pins `id`). */
  const reorderPins = (id: RemId, targetId: RemId | null, after: boolean): void => {
    const list = pinned.map((r) => r.id).filter((x) => x !== id);
    const at = targetId ? list.indexOf(targetId) + (after ? 1 : 0) : list.length;
    list.splice(at < 0 ? list.length : at, 0, id);
    const keys = ordersBetween(null, null, list.length);
    app.rems.updateMany(list, (r) => ({ pinned: true, pinOrder: keys[list.indexOf(r.id)] }));
  };
  const dnd = useMemo<SidebarDnd>(
    () => ({
      dragging,
      over,
      setDragging,
      setOver,
      drop: (target, zone, section) => {
        if (!dragging) return;
        if (zone === 'inside') {
          app.rems.move([dragging], { parentId: target.id });
          setExpanded((e) => ({ ...e, [target.id]: true }));
        } else if (section === 'pinned' && target.pinned) {
          reorderPins(dragging, target.id, zone === 'after');
        } else {
          const siblings = app.store.children(target.parentId).filter((r) => r.id !== dragging);
          const i = siblings.findIndex((r) => r.id === target.id);
          const afterId = zone === 'after' ? target.id : (siblings[i - 1]?.id ?? null);
          app.rems.move([dragging], { parentId: target.parentId, afterId });
        }
      },
    }),
    [dragging, over, pinned, app], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Drop on a section header: pin, or unpin and move to the top level. */
  const headerDrop = (section: 'pinned' | 'tree') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOverSection(section);
    },
    onDragLeave: () => setOverSection(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverSection(null);
      if (!dragging) return;
      if (section === 'pinned') reorderPins(dragging, null, true);
      else {
        app.rems.update(dragging, { pinned: undefined, pinOrder: undefined });
        if (app.store.get(dragging)?.parentId !== null)
          app.rems.move([dragging], { parentId: null });
      }
      setDragging(null);
    },
  });

  const toggle = (id: RemId): void => setExpanded((e) => ({ ...e, [id]: !(e[id] ?? false) }));
  const go = (path: string): void => {
    navigate(path);
    onNavigate?.();
  };
  const isActive = (prefix: string): boolean =>
    prefix === '/' ? location.pathname === '/' : location.pathname.startsWith(prefix);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">R</span>
        <span className="sidebar-title ellipsis" title={account.user?.email ?? 'Local only'}>
          {account.user?.email ?? 'RemCraft'}
        </span>
        {account.configured && (
          <span
            className={`sync-dot ${account.sync.state}`}
            title={
              account.user
                ? `Sync: ${account.sync.state}${account.sync.error ? ` - ${account.sync.error}` : ''}`
                : 'Not signed in'
            }
          />
        )}
        <button
          className="icon-btn"
          onClick={onCollapse}
          aria-label="Hide sidebar"
          title="Hide sidebar (⌘\)"
        >
          <PanelLeftClose size={17} />
        </button>
      </div>
      <nav className="sidebar-scroll">
        <button className="nav-item" onClick={() => modals.open({ kind: 'search' })}>
          <Search size={17} /> Search <span className="nav-count kbd">⌘K</span>
        </button>
        <button className={`nav-item${isActive('/') ? ' active' : ''}`} onClick={() => go('/')}>
          <LayoutGrid size={17} /> Documents &amp; Folders
        </button>
        <button
          className={`nav-item${location.pathname.startsWith('/rem/daily-') ? ' active' : ''}`}
          onClick={() => go(`/rem/${app.rems.ensureDaily()}`)}
        >
          <CalendarDays size={17} /> Today&apos;s Note
        </button>
        <button
          className={`nav-item${isActive('/flashcards') || isActive('/practice') ? ' active' : ''}`}
          onClick={() => go('/flashcards')}
        >
          <Layers size={17} /> Flashcards{' '}
          {due > 0 && <span className="nav-count badge">{due}</span>}
        </button>
        <button
          className={`nav-item${isActive('/lecture') ? ' active' : ''}`}
          onClick={() =>
            go(activeLecture?.deckId ? `/lecture/${activeLecture.deckId}` : '/lectures')
          }
        >
          <Presentation size={17} /> Vorlesungen{' '}
          {activeLecture && <span className="nav-count badge badge-success">live</span>}
        </button>
        <button
          className={`nav-item${isActive('/edit-later') ? ' active' : ''}`}
          onClick={() => go('/edit-later')}
        >
          <Clock3 size={17} /> Edit Later{' '}
          {editLater > 0 && <span className="nav-count">{editLater}</span>}
        </button>
        <button
          className="nav-item"
          onClick={() => {
            const doc = app.rems.createDocument(null, '');
            go(`/rem/${doc.id}`);
          }}
        >
          <PlusCircle size={17} /> <strong>Create</strong>
        </button>
        <button className="nav-item accent" onClick={() => modals.open({ kind: 'import' })}>
          <Upload size={17} /> Upload / Import
        </button>

        <DndContext.Provider value={dnd}>
          <button
            className={`sidebar-section${overSection === 'pinned' ? ' drop-target' : ''}`}
            onClick={() => setPinnedOpen(!pinnedOpen)}
            {...headerDrop('pinned')}
            title="Hierher ziehen zum Anheften"
          >
            Pinned {pinnedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {pinnedOpen &&
            pinned.map((r) => (
              <TreeItem
                key={r.id}
                rem={r}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                section="pinned"
              />
            ))}
          {pinnedOpen && pinned.length === 0 && (
            <div className="faint" style={{ fontSize: 13, padding: '2px 10px' }}>
              Hierher ziehen oder über das ⋯-Menü anheften
            </div>
          )}

          <button
            className={`sidebar-section${overSection === 'tree' ? ' drop-target' : ''}`}
            onClick={() => setUnpinnedOpen(!unpinnedOpen)}
            {...headerDrop('tree')}
            title="Hierher ziehen: nach oben verschieben und lösen"
          >
            Unpinned {unpinnedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {unpinnedOpen &&
            topLevel.map((r) => (
              <TreeItem
                key={r.id}
                rem={r}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                section="tree"
              />
            ))}
        </DndContext.Provider>
      </nav>
      <div className="sidebar-footer">
        <a
          className="nav-item"
          href="https://github.com/LukasFlorian/RemCraft/tree/main/docs"
          target="_blank"
          rel="noreferrer"
        >
          <HelpCircle size={17} /> Help &amp; Docs
        </a>
        <button
          className={`nav-item${isActive('/settings') ? ' active' : ''}`}
          onClick={() => go('/settings')}
        >
          <Settings size={17} /> Settings
        </button>
      </div>
    </aside>
  );
}
