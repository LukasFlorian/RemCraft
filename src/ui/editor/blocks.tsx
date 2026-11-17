/**
 * Renderers for special block types: images (with occlusion masks), files,
 * embeds, portals, search portals and tag tables.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ExternalLink, FileText, Search } from 'lucide-react';
import type { Occlusion, Rem, RemId } from '@core/model/types';
import { rt, toPlainText } from '@core/richtext/ops';
import { useApp, useChildren, useSelector } from '../app/context';
import { searchStore } from '../hooks/search';
import { useRemTitle } from '../hooks/useRemTitle';
import { RichTextView } from '../richtext/RichTextView';
import { Outliner } from './Outliner';

/** Resolves a `file:` / data / http source to a displayable URL. */
export function useFileUrl(src: string | undefined, origin?: string): string | null {
  const app = useApp();
  const [url, setUrl] = useState<string | null>(src && !src.startsWith('file:') ? src : null);
  useEffect(() => {
    let alive = true;
    if (!src) setUrl(null);
    else if (!src.startsWith('file:')) setUrl(src);
    else void app.files.resolve(src, origin).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [app, src, origin]);
  return url;
}

/** Image with optional occlusion masks. */
export function ImageView({
  src,
  origin,
  width,
  occlusions,
  hidden,
  revealed,
  onResize,
}: {
  src: string;
  /** Public fallback URL (images of cloned shares). */
  origin?: string | undefined;
  width?: number | undefined;
  occlusions?: Occlusion[] | undefined;
  /** Occlusions drawn as opaque masks (all when undefined). */
  hidden?: (o: Occlusion) => boolean;
  /** Occlusion highlighted as the answer. */
  revealed?: string | undefined;
  onResize?: (width: number) => void;
}): ReactNode {
  const url = useFileUrl(src, origin);
  if (!url) return <div className="image-placeholder">Loading image…</div>;
  return (
    <div className="image-block" style={width ? { width } : undefined}>
      <img src={url} alt="" draggable={false} />
      {occlusions?.map((o) => (
        <div
          key={o.id}
          className={`occlusion${hidden && !hidden(o) ? ' occlusion-open' : ''}${revealed === o.id ? ' occlusion-answer' : ''}`}
          style={{
            left: `${o.x * 100}%`,
            top: `${o.y * 100}%`,
            width: `${o.w * 100}%`,
            height: `${o.h * 100}%`,
          }}
        >
          {o.label && hidden?.(o) !== false && <span>{o.label}</span>}
        </div>
      ))}
      {onResize && (
        <span
          className="image-resize"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startW = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
            const move = (ev: MouseEvent): void =>
              onResize(Math.max(80, startW + ev.clientX - startX));
            const up = (): void => {
              window.removeEventListener('mousemove', move);
              window.removeEventListener('mouseup', up);
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
          }}
        />
      )}
    </div>
  );
}

/** Attached file (PDFs are shown inline). */
export function FileView({ rem }: { rem: Rem }): ReactNode {
  const url = useFileUrl(rem.file?.src, rem.file?.origin);
  const [open, setOpen] = useState(false);
  if (!rem.file) return null;
  const isPdf =
    rem.file.mimeType === 'application/pdf' || rem.file.name.toLowerCase().endsWith('.pdf');
  return (
    <div className="file-block" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <FileText size={16} />
        <span className="ellipsis">{rem.file.name}</span>
        <span className="faint">{Math.round(rem.file.size / 1024)} KB</span>
        <span className="spacer" />
        {isPdf && url && (
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Show'} PDF
          </button>
        )}
        {url && (
          <a
            className="btn btn-sm"
            href={url}
            target="_blank"
            rel="noreferrer"
            download={rem.file.name}
          >
            <ExternalLink size={14} /> Open
          </a>
        )}
      </div>
      {open && url && <iframe className="pdf-frame" src={url} title={rem.file.name} />}
    </div>
  );
}

/** Converts known video page URLs to embeddable URLs. */
export function embedUrl(url: string): { kind: 'iframe' | 'video' | 'audio'; src: string } {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = /vimeo\.com\/(\d+)/.exec(url);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|ogv)(\?|$)/i.test(url)) return { kind: 'video', src: url };
  if (/\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(url) || url.startsWith('file:'))
    return { kind: 'audio', src: url };
  return { kind: 'iframe', src: url };
}

/** Embedded media or web page. */
export function EmbedView({ url }: { url: string }): ReactNode {
  const resolved = useFileUrl(url);
  const e = embedUrl(url);
  if (!resolved) return null;
  if (e.kind === 'audio') return <audio className="embed-audio" controls src={resolved} />;
  if (e.kind === 'video') return <video className="embed-video" controls src={resolved} />;
  return (
    <iframe
      className="embed-frame"
      src={e.src}
      title="Embedded content"
      allow="fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
    />
  );
}

/** A portal: the target Rem's subtree, editable in place. */
export function PortalView({ targetId }: { targetId: RemId }): ReactNode {
  const navigate = useNavigate();
  const exists = useSelector((s) => Boolean(s.get(targetId)));
  const title = useRemTitle(targetId);
  if (!exists) return <div className="portal portal-missing">Portal target was deleted.</div>;
  return (
    <div className="portal" onClick={(e) => e.stopPropagation()}>
      <div className="portal-header">
        <button className="link-btn" onClick={() => navigate(`/rem/${targetId}`)}>
          {title}
        </button>
      </div>
      <Outliner rootId={targetId} embedded />
    </div>
  );
}

/** Search portal: live results of a query. */
export function SearchPortalView({ query }: { query: string }): ReactNode {
  const navigate = useNavigate();
  const hits = useSelector((s) => searchStore(s, query, 50));
  const store = useApp().store;
  return (
    <div className="portal search-portal" onClick={(e) => e.stopPropagation()}>
      <div className="portal-header">
        <Search size={14} /> <span className="mono">{query}</span>{' '}
        <span className="faint">· {hits.length} results</span>
      </div>
      <ul className="search-portal-list">
        {hits.map((h) => {
          const rem = store.get(h.remId);
          if (!rem) return null;
          return (
            <li
              key={h.remId}
              onClick={() => navigate(`/rem/${rem.isDocument ? rem.id : (rem.parentId ?? rem.id)}`)}
            >
              {rem.todo && <input type="checkbox" readOnly checked={rem.todo === 'finished'} />}
              <RichTextView value={rem.text} inertRefs />
              {rem.back && (
                <>
                  <span className="separator">→</span>
                  <RichTextView value={rem.back} inertRefs />
                </>
              )}
            </li>
          );
        })}
        {hits.length === 0 && <li className="faint">No results</li>}
      </ul>
    </div>
  );
}

/**
 * Table of all Rems tagged with `tagId`. Columns are the tag's property
 * children; cells hold the tagged Rem's value child for that property.
 */
export function TagTableView({ tagId }: { tagId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const properties = useChildren(tagId).filter((c) => c.isProperty);
  const rowIds = useSelector((s) =>
    s
      .backlinks(tagId)
      .filter((id) => s.get(id)?.tags.includes(tagId))
      .join(','),
  );
  const rows = useMemo(() => rowIds.split(',').filter(Boolean), [rowIds]);
  /** Value child of `rowId` for `propId`. */
  const valueOf = (rowId: RemId, propId: RemId): Rem | undefined =>
    app.store.children(rowId).find((c) => c.propertyId === propId);
  const setValue = (rowId: RemId, propId: RemId, value: string): void => {
    const existing = valueOf(rowId, propId);
    if (existing) app.rems.update(existing.id, { text: rt(value) }, `text:${existing.id}`);
    else app.rems.create({ parentId: rowId }, { propertyId: propId, text: rt(value) });
  };
  return (
    <div className="tag-table" onClick={(e) => e.stopPropagation()}>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            {properties.map((p) => (
              <th key={p.id}>{toPlainText(p.text) || 'Property'}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rowId) => (
            <tr key={rowId}>
              <td>
                <button className="link-btn" onClick={() => navigate(`/rem/${rowId}`)}>
                  {app.rems.title(rowId) || 'Untitled'}
                </button>
              </td>
              {properties.map((p) => (
                <td key={p.id}>
                  <input
                    className="cell-input"
                    defaultValue={toPlainText(valueOf(rowId, p.id)?.text ?? [])}
                    onBlur={(e) => setValue(rowId, p.id, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={properties.length + 1} className="faint">
                Tag Rems with this Rem (#) to add rows. Add children marked as “Property” to add
                columns.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
