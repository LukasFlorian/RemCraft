/**
 * Page of a document, folder or zoomed-in Rem: breadcrumbs, due counter with
 * practice options, editable title, the outliner (or folder contents) and
 * the references panel.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Presentation,
  Redo2,
  Share2,
  Star,
  Undo2,
} from 'lucide-react';
import type { RemId } from '@core/model/types';
import { selectDueCounts, selectInheritance } from '@data/selectors';
import { DAY, isoDate, parseIsoDate } from '@core/util/time';
import { useApp, useChildren, useNow, useRem, useSelector } from '../app/context';
import { Menu } from '../components/Menu';
import type { MenuEntry } from '../components/Menu';
import { useController } from '../editor/controller';
import { Outliner } from '../editor/Outliner';
import { RemContent } from '../editor/RemBlock';
import { TitleEditor } from '../editor/TitleEditor';
import { FileView } from '../editor/blocks';
import { DeckPanel } from '../lecture/DeckPanel';
import { ShareDialog, useSpaces } from '../sharing/ShareDialog';
import { ROLE_LABELS } from '@core/sharing/spaces';
import { pickFiles } from '../hooks/useFilePicker';
import { useToast } from '../components/Toast';
import { useRemTitle } from '../hooks/useRemTitle';
import { PriorityBadge, useRemMenu } from './remMenu';

/** The document page. */
export function DocumentPage(): ReactNode {
  const { id = '' } = useParams();
  const rem = useRem(id);
  const navigate = useNavigate();
  if (!rem) {
    return (
      <div className="main-scroll">
        <div className="page">
          <div className="empty">
            This Rem does not exist (anymore).
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => navigate('/')}>
                Go to Documents
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <DocumentView key={id} remId={id} />;
}

/** Breadcrumb trail. */
function Breadcrumbs({ remId }: { remId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const path = useSelector((s) =>
    s.memo(`path:${remId}`, [s.collectionVersion('rems')], () => app.rems.path(remId)),
  );
  const title = useRemTitle(remId);
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      <button onClick={() => navigate('/')}>Documents</button>
      {path.map((a) => (
        <Crumb key={a.id} remId={a.id} />
      ))}
      <ChevronRight size={14} />
      <span className="current ellipsis">{title}</span>
    </nav>
  );
}

function Crumb({ remId }: { remId: RemId }): ReactNode {
  const navigate = useNavigate();
  const title = useRemTitle(remId);
  return (
    <>
      <ChevronRight size={14} />
      <button onClick={() => navigate(`/rem/${remId}`)}>{title}</button>
    </>
  );
}

/** Document content. */
function DocumentView({ remId }: { remId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const controller = useController();
  const remMenu = useRemMenu();
  const now = useNow();
  const rem = useRem(remId)!;
  const due = useSelector((s) => selectDueCounts(s, now).get(remId) ?? 0);
  const priority = useSelector((s) => selectInheritance(s, now).get(remId)?.priority ?? 'none');
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entries: MenuEntry[] } | null>(null);
  const [sharing, setSharing] = useState(false);
  const spaces = useSpaces();
  const space = rem.spaceId ? spaces.find((s) => s.id === rem.spaceId) : undefined;
  const isNew = rem.text.length === 0 && Date.now() - rem.createdAt < 5000;

  /** Moves the caret from the title into the outline. */
  const enterBody = (): void => {
    const first = app.store.children(remId)[0];
    const instance = [...document.querySelectorAll<HTMLElement>('.doc-body > .outliner')][0]
      ?.dataset.instance;
    if (!instance) return;
    if (first) controller.focus(instance, first.id, 'start');
    else {
      const created = app.rems.create({ parentId: remId });
      controller.focus(instance, created.id, 'start');
    }
  };

  const practiceEntries = (): MenuEntry[] => [
    {
      label: 'Practice with spaced repetition',
      onSelect: () => navigate(`/practice?scope=${remId}&mode=srs`),
    },
    {
      label: 'Practice all flashcards',
      onSelect: () => navigate(`/practice?scope=${remId}&mode=all`),
    },
    {
      label: 'Practice all in order',
      onSelect: () => navigate(`/practice?scope=${remId}&mode=all-in-order`),
    },
    {
      label: 'Cram (no scheduling)',
      onSelect: () => navigate(`/practice?scope=${remId}&mode=cram`),
    },
  ];

  return (
    <>
      <div className="topbar">
        <Breadcrumbs remId={remId} />
        <PriorityBadge priority={priority} />
        {due > 0 && (
          <div className="split-btn">
            <button
              className="btn btn-sm"
              onClick={() => navigate(`/practice?scope=${remId}&mode=srs`)}
              title="Practice due cards"
            >
              <Layers size={14} /> {due} Due
            </button>
            <button
              className="btn btn-sm"
              aria-label="Practice options"
              onClick={(e) => setMenu({ anchor: e.currentTarget, entries: practiceEntries() })}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        <button
          className="icon-btn"
          title="Undo (⌘Z)"
          aria-label="Undo"
          onClick={() => app.store.undo()}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-btn"
          title="Redo (⌘⇧Z)"
          aria-label="Redo"
          onClick={() => app.store.redo()}
        >
          <Redo2 size={17} />
        </button>
        <button
          className={`icon-btn${rem.spaceId ? ' active' : ''}`}
          title={space ? `Geteilt: ${space.name} (${ROLE_LABELS[space.role]})` : 'Teilen'}
          aria-label="Teilen"
          onClick={() => setSharing(true)}
        >
          <Share2 size={17} />
        </button>
        <button
          className={`icon-btn${rem.pinned ? ' active' : ''}`}
          title={rem.pinned ? 'Unpin' : 'Pin to sidebar'}
          aria-label="Pin"
          onClick={() => app.rems.update(remId, { pinned: rem.pinned ? undefined : true })}
        >
          <Star size={17} fill={rem.pinned ? 'currentColor' : 'none'} />
        </button>
        <button
          className="icon-btn"
          aria-label="More"
          onClick={(e) => setMenu({ anchor: e.currentTarget, entries: remMenu(remId) })}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <div
        className="main-scroll"
        onMouseDown={(e) => e.target === e.currentTarget && controller.clearSelection()}
      >
        <div className="page doc-page">
          {space?.role === 'reader' && (
            <div className="readonly-banner">Nur lesen: geteilt von einer anderen Person. Deine Änderungen werden nicht synchronisiert - klone den Bereich, um ihn zu bearbeiten.</div>
          )}
          {rem.dailyDate && <DailyNav date={rem.dailyDate} />}
          <div className={`doc-title-row${rem.isFolder ? ' is-folder' : ''}`}>
            {rem.isFolder && <Folder size={26} className="icon-folder" />}
            <TitleEditor
              remId={remId}
              onExit={enterBody}
              autoFocus={isNew}
              placeholder={rem.isFolder ? 'Folder name' : 'Untitled'}
            />
          </div>
          {rem.back !== null && rem.direction !== 'none' && (
            <div className="doc-card-back">
              <RemContent rem={rem} />
            </div>
          )}
          {rem.file && !rem.deck && <FileView rem={rem} />}
          {rem.deck && <DeckPanel deckId={remId} />}
          <div className="doc-body">
            {rem.isFolder ? <FolderContents folderId={remId} /> : <Outliner rootId={remId} />}
          </div>
          <ReferencesPanel remId={remId} />
        </div>
      </div>
      {sharing && <ShareDialog remId={remId} onClose={() => setSharing(false)} />}
      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menu.entries}
          onClose={() => setMenu(null)}
          align="end"
        />
      )}
    </>
  );
}

/** Previous/next day navigation for daily documents. */
function DailyNav({ date }: { date: string }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const go = (delta: number): void =>
    void navigate(
      `/rem/${app.rems.ensureDaily(isoDate(parseIsoDate(date) + delta * DAY + 12 * 3600_000))}`,
    );
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <button className="btn btn-sm" onClick={() => go(-1)}>
        <ChevronLeft size={14} /> Previous day
      </button>
      <button className="btn btn-sm" onClick={() => navigate(`/rem/${app.rems.ensureDaily()}`)}>
        Today
      </button>
      <button className="btn btn-sm" onClick={() => go(1)}>
        Next day <ChevronRight size={14} />
      </button>
    </div>
  );
}

/** Contents of a folder: its documents and sub-folders. */
function FolderContents({ folderId }: { folderId: RemId }): ReactNode {
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const children = useChildren(folderId);
  return (
    <div className="folder-contents">
      <div className="row" style={{ marginBottom: 12 }}>
        <button
          className="btn btn-sm"
          onClick={() => {
            const d = app.rems.createDocument(folderId, '');
            navigate(`/rem/${d.id}`);
          }}
        >
          <FilePlus size={14} /> New document
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            const f = app.rems.createFolder(folderId, 'New Folder');
            navigate(`/rem/${f.id}`);
          }}
        >
          <FolderPlus size={14} /> New folder
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            void pickFiles('.pdf,application/pdf').then(async ([file]) => {
              if (!file) return;
              toast('Foliensatz wird analysiert…');
              try {
                const id = await app.lectures.importPdf(file, folderId);
                navigate(`/rem/${id}`);
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error');
              }
            })
          }
        >
          <Presentation size={14} /> Foliensatz (PDF)
        </button>
      </div>
      {children.length === 0 && <div className="empty">This folder is empty.</div>}
      <div className="folder-grid">
        {children.map((c) => (
          <FolderItem key={c.id} remId={c.id} />
        ))}
      </div>
    </div>
  );
}

function FolderItem({ remId }: { remId: RemId }): ReactNode {
  const navigate = useNavigate();
  const rem = useRem(remId);
  const title = useRemTitle(remId);
  const count = useChildren(remId).length;
  if (!rem) return null;
  const Icon = rem.isFolder ? Folder : FileText;
  return (
    <button className="folder-item" onClick={() => navigate(`/rem/${remId}`)}>
      <Icon size={20} className={rem.isFolder ? 'icon-folder' : 'icon-doc'} />
      <span className="ellipsis">{title}</span>
      <span className="faint" style={{ fontSize: 12 }}>
        {count} {rem.isFolder ? 'items' : 'Rems'}
      </span>
    </button>
  );
}

/** Rems referencing or tagging this Rem. */
function ReferencesPanel({ remId }: { remId: RemId }): ReactNode {
  const ids = useSelector((s) =>
    s.memo(`backlinks:${remId}`, [s.collectionVersion('rems')], () =>
      s.backlinks(remId).filter((id) => id !== remId),
    ),
  );
  const [open, setOpen] = useState(true);
  if (ids.length === 0) return null;
  return (
    <section className="references">
      <button className="references-header" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {ids.length} Reference
        {ids.length > 1 ? 's' : ''}
      </button>
      {open && ids.map((id) => <ReferenceItem key={id} remId={id} />)}
    </section>
  );
}

function ReferenceItem({ remId }: { remId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const rem = useRem(remId);
  const docTitle = useSelector(() => {
    const path = app.rems.path(remId);
    const doc = [...path].reverse().find((r) => r.isDocument);
    return doc ? app.rems.title(doc.id) : '';
  });
  if (!rem) return null;
  const target = [...app.rems.path(remId)].reverse().find((r) => r.isDocument)?.id ?? remId;
  return (
    <div className="reference-item" onClick={() => navigate(`/rem/${target}`)}>
      {docTitle && (
        <div className="faint" style={{ fontSize: 12 }}>
          {docTitle}
        </div>
      )}
      <RemContent rem={rem} />
    </div>
  );
}
