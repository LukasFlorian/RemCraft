/**
 * "Documents & Folders": all documents, folders, PDFs, tags and daily notes,
 * filterable, searchable and grouped by date.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarDays,
  FileText,
  FileType,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Tag,
  Upload,
} from 'lucide-react';
import type { Rem } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { fold } from '@core/search/search';
import { formatShortDate, startOfStudyDay } from '@core/util/time';
import { useApp, useSelector } from '../app/context';
import { useModals } from '../app/modals';
import { Menu } from '../components/Menu';
import type { MenuEntry } from '../components/Menu';
import { useLocalState } from '../hooks/useLocalState';
import { useRemTitle } from '../hooks/useRemTitle';
import { useRemMenu } from './remMenu';

type Filter = 'all' | 'documents' | 'folders' | 'pdfs' | 'tags' | 'daily';
type Sort = 'newest' | 'oldest' | 'updated' | 'az';

const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  updated: 'Recently edited',
  az: 'A → Z',
};

/** The documents overview page. */
export function DocumentsPage(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const modals = useModals();
  const remMenu = useRemMenu();
  const [filter, setFilter] = useLocalState<Filter>('docs.filter', 'documents');
  const [sort, setSort] = useLocalState<Sort>('docs.sort', 'newest');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entries: MenuEntry[] } | null>(null);

  const data = useSelector((s) =>
    s.memo('docsPage', [s.collectionVersion('rems')], () => {
      const all = s.all('rems');
      const tagIds = new Set(all.flatMap((r) => r.tags));
      const docs = all.filter((r) => r.isDocument && !r.isFolder && !r.dailyDate);
      const folders = all.filter((r) => r.isFolder);
      const pdfs = all.filter(
        (r) =>
          r.file &&
          (r.file.mimeType === 'application/pdf' || r.file.name.toLowerCase().endsWith('.pdf')),
      );
      const tags = all.filter((r) => tagIds.has(r.id));
      const daily = all.filter((r) => r.dailyDate);
      return { docs, folders, pdfs, tags, daily };
    }),
  );

  const list: Rem[] = useMemo(() => {
    const base: Rem[] =
      filter === 'documents'
        ? data.docs
        : filter === 'folders'
          ? data.folders
          : filter === 'pdfs'
            ? data.pdfs
            : filter === 'tags'
              ? data.tags
              : filter === 'daily'
                ? data.daily
                : [
                    ...new Map(
                      [
                        ...data.docs,
                        ...data.folders,
                        ...data.pdfs,
                        ...data.tags,
                        ...data.daily,
                      ].map((r) => [r.id, r]),
                    ).values(),
                  ];
    const q = fold(query.trim());
    const filtered = q ? base.filter((r) => fold(toPlainText(r.text)).includes(q)) : base;
    const sorted = [...filtered];
    if (sort === 'newest') sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'oldest') sorted.sort((a, b) => a.createdAt - b.createdAt);
    if (sort === 'updated') sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    if (sort === 'az')
      sorted.sort((a, b) => toPlainText(a.text).localeCompare(toPlainText(b.text)));
    return sorted;
  }, [data, filter, query, sort]);

  // Group by day (except alphabetical sorting).
  const groups = useMemo(() => {
    if (sort === 'az') return [{ label: '', items: list }];
    const out: { label: string; items: Rem[] }[] = [];
    for (const r of list) {
      const t = sort === 'updated' ? r.updatedAt : r.createdAt;
      const label = formatShortDate(startOfStudyDay(t, 0));
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [list, sort]);

  const pills: { id: Filter; label: string; icon: ReactNode; count: number }[] = [
    {
      id: 'all',
      label: 'All',
      icon: <span className="pill-dot" />,
      count: new Set(
        [...data.docs, ...data.folders, ...data.pdfs, ...data.tags, ...data.daily].map((r) => r.id),
      ).size,
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText size={14} className="icon-doc" />,
      count: data.docs.length,
    },
    {
      id: 'folders',
      label: 'Folders',
      icon: <Folder size={14} className="icon-folder" />,
      count: data.folders.length,
    },
    { id: 'pdfs', label: 'PDFs', icon: <FileType size={14} />, count: data.pdfs.length },
    { id: 'tags', label: 'Tags', icon: <Tag size={14} />, count: data.tags.length },
    {
      id: 'daily',
      label: 'Daily Notes',
      icon: <CalendarDays size={14} />,
      count: data.daily.length,
    },
  ];

  return (
    <div className="main-scroll">
      <div className="page page-wide">
        <div className="page-header">
          <h1>Documents &amp; Folders</h1>
          <button className="btn" onClick={() => modals.open({ kind: 'import' })}>
            <Upload size={15} /> Import
          </button>
          <button
            className="btn"
            onClick={() => {
              const f = app.rems.createFolder(null, 'New Folder');
              navigate(`/rem/${f.id}`);
            }}
          >
            <FolderPlus size={15} /> Folder
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const d = app.rems.createDocument(null, '');
              navigate(`/rem/${d.id}`);
            }}
          >
            <Plus size={15} /> Create
          </button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter documents"
          />
          {pills.map((p) => (
            <button
              key={p.id}
              className={`pill${filter === p.id ? ' active' : ''}`}
              onClick={() => setFilter(p.id)}
            >
              {p.icon} {p.label} <span className="faint">· {p.count}</span>
            </button>
          ))}
          <span className="spacer" />
          <select
            className="select"
            style={{ width: 170 }}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
          >
            {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {list.length === 0 && <div className="empty">Nothing here yet.</div>}
        {groups.map((g) => (
          <section key={g.label || 'all'} className="doc-group">
            {g.label && <h3 className="doc-group-label">{g.label}</h3>}
            {g.items.map((r) => (
              <DocRow
                key={r.id}
                rem={r}
                onOpen={() => navigate(`/rem/${r.id}`)}
                onMenu={(anchor) =>
                  setMenu({ anchor, entries: remMenu(r.id, { includeOpen: true }) })
                }
              />
            ))}
          </section>
        ))}
      </div>
      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menu.entries}
          onClose={() => setMenu(null)}
          align="end"
        />
      )}
    </div>
  );
}

/** A row of the documents list. */
function DocRow({
  rem,
  onOpen,
  onMenu,
}: {
  rem: Rem;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
}): ReactNode {
  const title = useRemTitle(rem.id);
  const parent = useRemTitle(rem.parentId, '');
  const Icon = rem.isFolder
    ? Folder
    : rem.dailyDate
      ? CalendarDays
      : rem.file
        ? FileType
        : FileText;
  return (
    <div
      className="doc-row"
      onClick={onOpen}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <span className="doc-icon">
        <Icon size={16} className={rem.isFolder ? 'icon-folder' : 'icon-doc'} />
      </span>
      <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
        <span className="doc-title ellipsis">{title}</span>
        {parent && <span className="doc-parent ellipsis">{parent}</span>}
      </span>
      <button
        className="icon-btn"
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e.currentTarget);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
