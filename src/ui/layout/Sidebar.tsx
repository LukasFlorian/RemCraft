/**
 * Left navigation: main destinations, pinned and unpinned documents/folders,
 * due-card badge, sync status and settings.
 */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  HelpCircle,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PlusCircle,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import type { Rem, RemId } from '@core/model/types';
import { selectGlobalQueue } from '@data/selectors';
import { useAccount, useApp, useNow, useSelector } from '../app/context';
import { useModals } from '../app/modals';
import { useLocalState } from '../hooks/useLocalState';
import { useRemTitle } from '../hooks/useRemTitle';

/** Documents and folders below a Rem (what the sidebar tree shows). */
function useDocChildren(id: RemId | null): Rem[] {
  return useSelector((s) =>
    s.memo(`docChildren:${id}`, [s.collectionVersion('rems')], () =>
      s.children(id).filter((r) => r.isDocument || r.isFolder),
    ),
  );
}

/** One tree item (recursive). */
function TreeItem({
  rem,
  depth,
  expanded,
  toggle,
}: {
  rem: Rem;
  depth: number;
  expanded: Record<string, boolean>;
  toggle: (id: RemId) => void;
}): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const title = useRemTitle(rem.id);
  const kids = useDocChildren(rem.id);
  const open = expanded[rem.id] ?? (rem.pinned && depth === 0);
  const active = location.pathname === `/rem/${rem.id}`;
  const Icon = rem.isFolder ? Folder : FileText;
  return (
    <>
      <div
        className={`tree-item${active ? ' active' : ''}`}
        style={{ paddingLeft: 6 + depth * 16 }}
        onClick={() => navigate(`/rem/${rem.id}`)}
        role="treeitem"
        aria-expanded={kids.length > 0 ? Boolean(open) : undefined}
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
        <Icon
          size={15}
          className={`tree-icon ${rem.isFolder ? (rem.pinned ? 'icon-pinned-folder' : 'icon-folder') : 'icon-doc'}`}
        />
        <span className="ellipsis">{title}</span>
      </div>
      {open &&
        kids.map((k) => (
          <TreeItem key={k.id} rem={k} depth={depth + 1} expanded={expanded} toggle={toggle} />
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
        .sort((a, b) => a.createdAt - b.createdAt),
    ),
  );
  const topLevel = useDocChildren(null).filter((r) => !r.pinned);

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

        <button className="sidebar-section" onClick={() => setPinnedOpen(!pinnedOpen)}>
          Pinned {pinnedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {pinnedOpen &&
          pinned.map((r) => (
            <TreeItem key={r.id} rem={r} depth={0} expanded={expanded} toggle={toggle} />
          ))}
        {pinnedOpen && pinned.length === 0 && (
          <div className="faint" style={{ fontSize: 13, padding: '2px 10px' }}>
            Pin documents via their ⋯ menu
          </div>
        )}

        <button className="sidebar-section" onClick={() => setUnpinnedOpen(!unpinnedOpen)}>
          Unpinned {unpinnedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {unpinnedOpen &&
          topLevel.map((r) => (
            <TreeItem key={r.id} rem={r} depth={0} expanded={expanded} toggle={toggle} />
          ))}
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
