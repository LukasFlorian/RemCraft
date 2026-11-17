/**
 * Pages reached through share links:
 * - `#/s/:token` - read-only view of a published snapshot with "Klonen",
 * - `#/join/:token` - accept an invite to a shared space.
 * Snapshot files (`*.remcraft.json`) open in the same viewer via the import dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Copy, Eye, FileText, Folder, Presentation, Users } from 'lucide-react';
import type { Rem, RemId, SlideAnnotations } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { describeScope } from '@core/sharing/scope';
import type { ShareSnapshot } from '@core/sharing/snapshot';
import { snapshotStats } from '@core/sharing/snapshot';
import { ROLE_LABELS } from '@core/sharing/spaces';
import { useAccount, useApp } from '../app/context';
import { useToast } from '../components/Toast';
import type { PdfDoc } from '@data/lecture/pdf';
import { pdfJsEngine } from '@data/lecture/pdf';
import { annotatedSlideImage } from '../lecture/handoutImage';

/** Loads a file of the snapshot (`null` when unavailable). */
export type SnapshotFileLoader = (fileId: string) => Promise<Blob | null>;

/** Rendered slide images of shared decks, by `file:page:box:width`. */
const slideImages = new Map<string, Promise<string>>();
/** Opened PDFs of shared decks, by file id. */
const sharedPdfs = new Map<string, Promise<PdfDoc>>();

/**
 * Image of a shared slide (with its annotations), rendered once it scrolls
 * into view - shared decks often have hundreds of slides.
 */
function SharedSlideImage({
  fileId,
  page,
  box,
  annotations,
  loadFile,
  alt,
}: {
  fileId: string;
  page: number;
  box: number[];
  annotations: SlideAnnotations | undefined;
  loadFile: SnapshotFileLoader;
  alt: string;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Aspect ratio of the slide box (16:9 until the PDF is open).
  const [ratio, setRatio] = useState(16 / 9);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const width = Math.min(
      1600,
      Math.ceil(((ref.current?.clientWidth ?? 800) * (window.devicePixelRatio || 1)) / 200) * 200,
    );
    const key = `${fileId}:${page}:${box.join(',')}:${width}:${annotations?.updatedAt ?? 0}`;
    let job = slideImages.get(key);
    if (!job) {
      let pdf = sharedPdfs.get(fileId);
      if (!pdf) {
        pdf = loadFile(fileId).then((blob) => {
          if (!blob) throw new Error('missing');
          return pdfJsEngine.open(blob);
        });
        pdf.catch(() => sharedPdfs.delete(fileId));
        sharedPdfs.set(fileId, pdf);
      }
      job = pdf
        .then((doc) => doc.render(page, width, box))
        .then((canvas) => annotatedSlideImage(canvas.toDataURL('image/png'), annotations));
      job.catch(() => slideImages.delete(key));
      slideImages.set(key, job);
    }
    job.then(
      (u) => {
        if (!alive) return;
        const img = new Image();
        img.onload = () => alive && setRatio(img.naturalWidth / Math.max(1, img.naturalHeight));
        img.src = u;
        setUrl(u);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [visible, fileId, page, box, annotations, loadFile]);

  return (
    <div ref={ref} className="snap-slide-img" style={{ aspectRatio: String(ratio) }}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" />
      ) : (
        <span className="faint">{failed ? 'Folie nicht verfügbar' : 'Folie wird geladen …'}</span>
      )}
    </div>
  );
}

/**
 * Read-only view of a snapshot: documents as outlines, slide decks as a
 * column of slides with their notes and cards underneath.
 *
 * @param snapshot The shared snapshot.
 * @param loadFile Loads shared files (slide PDFs); without it slides show their text.
 */
export function SnapshotView({
  snapshot,
  loadFile,
}: {
  snapshot: ShareSnapshot;
  loadFile?: SnapshotFileLoader;
}): ReactNode {
  const { byParent, byId, annotations } = useMemo(() => {
    const byParent = new Map<RemId | null, Rem[]>();
    for (const r of snapshot.rems)
      byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    for (const list of byParent.values())
      list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    return {
      byParent,
      byId: new Map(snapshot.rems.map((r) => [r.id, r] as const)),
      annotations: new Map(snapshot.annotations.map((a) => [a.id, a] as const)),
    };
  }, [snapshot]);
  const text = (r: Rem['text'] | null): string =>
    toPlainText(r, (id) => toPlainText(byId.get(id)?.text ?? []));
  const sharedFiles = useMemo(() => new Set(snapshot.files.map((f) => f.id)), [snapshot]);

  /** A note or card line with its children. */
  const outline = (rem: Rem): ReactNode => {
    const kids = byParent.get(rem.id) ?? [];
    const card = rem.back && rem.direction !== 'none';
    return (
      <li key={rem.id} className={`snap-item${rem.mcCorrect ? ' snap-correct' : ''}`}>
        {card ? (
          <div className="snap-card">
            <span>{text(rem.text)}</span>
            <span className="snap-arrow">{rem.direction === 'disabled' ? '—' : '→'}</span>
            <span className="snap-back">{text(rem.back)}</span>
          </div>
        ) : (
          <span>{text(rem.text) || '…'}</span>
        )}
        {kids.length > 0 && <ul className="snap-list">{kids.map(outline)}</ul>}
      </li>
    );
  };

  /** A slide of a deck: image (or its text) and its notes. */
  const slide = (rem: Rem, deck: Rem): ReactNode => {
    const kids = byParent.get(rem.id) ?? [];
    // Slide Rems are named "Folie 3 · Title"; the number has its own badge.
    const title = text(rem.text).replace(/^Folie\s+\d+\s*[·:-]\s*/, '');
    const label = `Folie ${rem.slide!.index + 1}`;
    const src = deck.deck?.src ?? '';
    const fileId = src.startsWith('file:') ? src.slice('file:'.length) : null;
    const showImage = loadFile && fileId && sharedFiles.has(fileId);
    return (
      <article key={rem.id} className="snap-slide">
        <header className="snap-slide-head">
          <span className="snap-slide-no">{rem.slide!.index + 1}</span>
          <span className="snap-slide-title">{title || label}</span>
        </header>
        {showImage ? (
          <SharedSlideImage
            fileId={fileId}
            page={rem.slide!.page}
            box={deck.deck!.boxes[rem.slide!.box ?? 0] ?? [0, 0, 1, 1]}
            annotations={annotations.get(rem.id)}
            loadFile={loadFile}
            alt={title || label}
          />
        ) : (
          rem.slideText && <p className="snap-slidetext faint">{rem.slideText.slice(0, 280)}</p>
        )}
        {kids.length > 0 && <ul className="snap-list snap-notes">{kids.map(outline)}</ul>}
      </article>
    );
  };

  /** A folder, document or deck section. */
  const section = (rem: Rem, depth: number, showHeading = true): ReactNode => {
    const kids = byParent.get(rem.id) ?? [];
    const Heading = depth === 0 ? 'h2' : 'h3';
    const icon = rem.isFolder ? (
      <Folder size={18} />
    ) : rem.deck ? (
      <Presentation size={18} />
    ) : (
      <FileText size={18} />
    );
    const slides = rem.deck ? kids.filter((k) => k.slide) : [];
    const others = rem.deck ? kids.filter((k) => !k.slide) : kids;
    const sections = others.filter((k) => k.isFolder || k.isDocument || k.deck);
    const notes = others.filter((k) => !(k.isFolder || k.isDocument || k.deck));
    return (
      <section key={rem.id} className={`snap-section depth-${Math.min(depth, 2)}`}>
        {showHeading && (
          <Heading className="snap-heading">
            {icon}
            <span>{text(rem.text) || 'Ohne Titel'}</span>
            {rem.deck && <span className="badge">{slides.length} Folien</span>}
          </Heading>
        )}
        {notes.length > 0 && <ul className="snap-list">{notes.map(outline)}</ul>}
        {slides.length > 0 && <div className="snap-slides">{slides.map((s) => slide(s, rem))}</div>}
        {sections.map((k) => section(k, depth + 1))}
      </section>
    );
  };

  const root = byId.get(snapshot.rootId);
  if (!root) return null;
  // A shared single note: show it as an outline.
  // The root's title is already the page title.
  return root.isFolder || root.isDocument || root.deck ? (
    <div className="snapshot">{section(root, 0, !root.isFolder)}</div>
  ) : (
    <ul className="snap-list snapshot">{outline(root)}</ul>
  );
}

/** `#/s/:token`: a published read-only share. */
export function SharedSnapshotPage(): ReactNode {
  const { token = '' } = useParams();
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.sharing
      .fetch(token)
      .then(setSnapshot, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [app, token]);

  const stats = useMemo(() => (snapshot ? snapshotStats(snapshot) : null), [snapshot]) ?? {
    rems: 0,
    slides: 0,
  };
  const loadFile = useCallback<SnapshotFileLoader>(
    (id) => app.sharing.fetchFile(token, id),
    [app, token],
  );

  const clone = async (): Promise<void> => {
    setBusy(true);
    try {
      const root = await app.sharing.clonePublished(token, null);
      toast('In deine Wissensbasis kopiert');
      navigate(`/rem/${root}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main-scroll">
      <div className="page">
        {error ? (
          <p className="muted">{error}</p>
        ) : !snapshot ? (
          <p className="muted">Lade Freigabe …</p>
        ) : (
          <>
            <header className="snap-hero">
              <div className="snap-hero-text">
                <h1>{snapshot.title}</h1>
                <div className="snap-meta">
                  <span className="badge">
                    <Eye size={12} /> nur lesen
                  </span>
                  <span>{describeScope(snapshot.scope)}</span>
                  <span>{stats.rems} Einträge</span>
                  {stats.slides > 0 && <span>{stats.slides} Folien</span>}
                  <span>Stand {new Date(snapshot.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                className="btn btn-primary snap-clone"
                disabled={busy}
                onClick={() => void clone()}
              >
                <Copy size={14} /> In meine Wissensbasis klonen
              </button>
            </header>
            <SnapshotView snapshot={snapshot} loadFile={loadFile} />
          </>
        )}
      </div>
    </div>
  );
}

/** `#/join/:token`: accept an invite to a shared space. */
export function JoinSpacePage(): ReactNode {
  const { token = '' } = useParams();
  const app = useApp();
  const account = useAccount();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const join = async (): Promise<void> => {
    setBusy(true);
    try {
      const space = await app.sharing.join(token);
      toast(`Beigetreten: ${space.name} (${ROLE_LABELS[space.role]})`);
      navigate(app.store.get(space.rootId) ? `/rem/${space.rootId}` : '/');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main-scroll">
      <div className="page">
        <h1>
          <Users size={22} /> Einladung zur Zusammenarbeit
        </h1>
        <p>
          Du wurdest eingeladen, einen Bereich (z. B. eine Vorlesungsmappe) gemeinsam zu nutzen. Er
          erscheint danach in deiner Seitenleiste und wird live synchronisiert; dein Lernfortschritt
          bleibt privat.
        </p>
        {account.user ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => void join()}>
            Beitreten
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => navigate('/settings/account')}>
            Erst anmelden
          </button>
        )}
      </div>
    </div>
  );
}
