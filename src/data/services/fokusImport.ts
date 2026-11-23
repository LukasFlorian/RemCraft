/**
 * Imports everything from a Fokus data directory: courses → folders,
 * course files → file documents, slide decks with their exact Fokus layout
 * (slide indices stay identical), notes per slide → outline (cards included),
 * markers, ink/text boxes/highlights, imported `*.fokus.json` cards (mapped to
 * slides, disabled state kept) and every lecture with its full event history.
 *
 * Re-running the import is safe: objects already imported are recognised via
 * `settings.externalIds` (synced, so this also holds on other devices) and
 * deterministic lecture ids; notes are only added to slides without notes.
 * The conversion itself is pure and lives in `@core/io/fokusData`.
 */
import { cardKey } from '@core/lecture/cardFile';
import {
  cardDocs,
  convertAnnotations,
  convertFlags,
  convertSessionEvents,
  deckGeometry,
  findDataRoot,
  noteOutlineSource,
  parseJsonl,
} from '@core/io/fokusData';
import type {
  FokusCardProgress,
  FokusCardsJson,
  FokusDeckJson,
  FokusSessionMeta,
  FokusSlideNote,
} from '@core/io/fokusData';
import { createRem } from '@core/model/factories';
import { ordersBetween } from '@core/model/ordering';
import { walkSubtree } from '@core/model/graph';
import type { CardId, LectureEvent, RemId } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import { selectCardIndex, selectSettings } from '../selectors';
import type { Store } from '../store/store';
import type { FileService } from './files';
import type { ImportExportService } from './io';
import type { LectureService } from './lectures';
import { slideTitle } from './lectures';
import type { PracticeService } from './practice';
import type { RemService } from './rems';
import type { SettingsService } from './settings';
import { t } from '@core/i18n';

/** Read access to a Fokus data directory (paths relative to `data/`). */
export interface FokusArchive {
  paths(): readonly string[];
  text(path: string): Promise<string>;
  blob(path: string): Promise<Blob>;
}

/** Counts of an import run. */
export interface FokusImportSummary {
  courses: number;
  decks: number;
  slidesWithNotes: number;
  annotatedSlides: number;
  cards: number;
  disabledCards: number;
  lectures: number;
  files: number;
  /** Objects that were already imported earlier. */
  skipped: number;
  /** Problems that did not stop the import. */
  warnings: string[];
}

/** Progress callback: what is being done, step and total. */
export type FokusImportProgress = (message: string, done: number, total: number) => void;

/** Folder for decks and lectures without a course. */
const NO_COURSE_NAME = t('No course (Fokus)');

/**
 * Wraps the files of a selected folder (`<input webkitdirectory>`).
 *
 * @throws Error when the folder contains no Fokus data.
 */
export function archiveFromFiles(files: readonly File[]): FokusArchive {
  const rel = (f: File): string => (f.webkitRelativePath || f.name).replace(/\\/g, '/');
  const root = findDataRoot(files.map(rel));
  if (root === null)
    throw new Error(
      t(
        'No Fokus data found. Choose the “data” folder of Fokus (with the subfolders decks, sessions, courses).',
      ),
    );
  const byPath = new Map<string, File>();
  for (const f of files) {
    const p = rel(f);
    if (p.startsWith(root)) byPath.set(p.slice(root.length), f);
  }
  const get = (path: string): File => {
    const f = byPath.get(path);
    if (!f) throw new Error(t('File missing: {path}', { path }));
    return f;
  };
  return { paths: () => [...byPath.keys()], text: (p) => get(p).text(), blob: async (p) => get(p) };
}

/** First 16 hex digits of the SHA-256 of a blob (= Fokus deck id of a PDF). */
async function sha256Prefix(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** Fokus deck ids in its file paths. */
const segment = (paths: readonly string[], re: RegExp): string[] => [
  ...new Set(paths.flatMap((p) => re.exec(p)?.[1] ?? [])),
];

/** The Fokus importer. */
export class FokusImportService {
  constructor(
    private readonly store: Store,
    private readonly rems: RemService,
    private readonly files: FileService,
    private readonly lectures: LectureService,
    private readonly io: ImportExportService,
    private readonly practice: PracticeService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Imports a Fokus data directory.
   *
   * @param archive Files of the directory.
   * @param onProgress Progress callback.
   */
  async run(
    archive: FokusArchive,
    onProgress: FokusImportProgress = () => undefined,
  ): Promise<FokusImportSummary> {
    const paths = archive.paths();
    const has = new Set(paths);
    const summary: FokusImportSummary = {
      courses: 0,
      decks: 0,
      slidesWithNotes: 0,
      annotatedSlides: 0,
      cards: 0,
      disabledCards: 0,
      lectures: 0,
      files: 0,
      skipped: 0,
      warnings: [],
    };
    const ids: Record<string, string> = { ...(selectSettings(this.store).externalIds ?? {}) };
    const known = (key: string): RemId | undefined => {
      const id = ids[key];
      return id && this.store.get(id) ? id : undefined;
    };
    const readJson = async <T>(path: string, fallback: T): Promise<T> => {
      if (!has.has(path)) return fallback;
      try {
        return JSON.parse(await archive.text(path)) as T;
      } catch {
        summary.warnings.push(`Nicht lesbar: ${path}`);
        return fallback;
      }
    };

    const courseIds = segment(paths, /^courses\/([^/]+)\/course\.json$/);
    const deckIds = segment(paths, /^decks\/([^/]+)\/deck\.json$/);
    const sessionIds = segment(paths, /^sessions\/([^/]+)\/meta\.json$/);
    const total = courseIds.length + deckIds.length + sessionIds.length;
    let step = 0;
    const progress = (msg: string): void => onProgress(msg, step++, total);

    // --- courses -------------------------------------------------------------
    const courseRem = new Map<string, RemId>();
    for (const cid of courseIds) {
      const meta = await readJson<{ name?: string; created?: number }>(
        `courses/${cid}/course.json`,
        {},
      );
      progress(`Kurs ${meta.name ?? cid}`);
      const key = `fokus:course:${cid}`;
      let id = known(key);
      if (id) summary.skipped++;
      else {
        id = this.createFolder(meta.name || cid, meta.created);
        ids[key] = id;
        summary.courses++;
      }
      courseRem.set(cid, id);
    }
    let noCourse: RemId | undefined = known('fokus:course:-');
    const folderFor = (cid: string | undefined): RemId => {
      const id = cid ? courseRem.get(cid) : undefined;
      if (id) return id;
      if (!noCourse) {
        noCourse = this.createFolder(NO_COURSE_NAME);
        ids['fokus:course:-'] = noCourse;
      }
      return noCourse;
    };

    // --- decks ---------------------------------------------------------------
    const deckRem = new Map<string, RemId>();
    for (const did of deckIds) {
      const deck = await readJson<FokusDeckJson | null>(`decks/${did}/deck.json`, null);
      if (!deck) continue;
      progress(`Foliensatz ${deck.name ?? did}`);
      const key = `fokus:deck:${did}`;
      let id = known(key);
      if (id) summary.skipped++;
      else {
        if (!has.has(`decks/${did}/slides.pdf`)) {
          summary.warnings.push(`PDF fehlt: ${deck.name ?? did}`);
          continue;
        }
        id = await this.createDeck(
          deck,
          await archive.blob(`decks/${did}/slides.pdf`),
          folderFor(deck.course_id),
        );
        ids[key] = id;
        summary.decks++;
      }
      deckRem.set(did, id);
      await this.importDeckContent(did, id, summary, readJson);
    }

    // --- course files (except PDFs that are decks, which exist already) ------
    for (const cid of courseIds) {
      const prefix = `courses/${cid}/files/`;
      for (const path of paths.filter(
        (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'),
      )) {
        const name = path.slice(prefix.length);
        const key = `fokus:file:${cid}/${name}`;
        if (known(key)) {
          summary.skipped++;
          continue;
        }
        const blob = await archive.blob(path);
        if (/\.pdf$/i.test(name) && deckIds.includes(await sha256Prefix(blob))) continue;
        const src = await this.files.save(blob, name);
        const doc = this.rems.create(
          { parentId: courseRem.get(cid)! },
          {
            text: rt(name.replace(/\.[^.]+$/, '')),
            isDocument: true,
            file: { src, name, mimeType: blob.type || 'application/octet-stream', size: blob.size },
          },
        );
        ids[key] = doc.id;
        summary.files++;
      }
    }

    // --- lectures --------------------------------------------------------------
    for (const sid of sessionIds) {
      const meta = await readJson<FokusSessionMeta>(`sessions/${sid}/meta.json`, {});
      progress(`Vorlesung ${meta.name ?? sid}`);
      const lectureId = `fokus-${sid}`;
      if (this.store.getRecord('lectures', lectureId)) {
        summary.skipped++;
        continue;
      }
      const raw = has.has(`sessions/${sid}/events.jsonl`)
        ? parseJsonl(await archive.text(`sessions/${sid}/events.jsonl`))
        : [];
      const { events, deckIds: used, startedAt } = convertSessionEvents(lectureId, raw);
      const fokusDeck = used[used.length - 1];
      const deckId = fokusDeck ? (deckRem.get(fokusDeck) ?? null) : null;
      const deckCourse = deckId ? (this.store.get(deckId)?.parentId ?? null) : null;
      const created = meta.created ? Math.round(meta.created * 1000) : (startedAt ?? Date.now());
      this.store.transact(
        (tx) => {
          tx.put('lectures', {
            id: lectureId,
            name: meta.name || sid,
            deckId,
            courseId: (meta.course_id ? courseRem.get(meta.course_id) : undefined) ?? deckCourse,
            createdAt: created,
            updatedAt: created,
          });
          for (const e of events)
            tx.put('lectureEvents', { ...e, createdAt: e.t, updatedAt: e.t } as LectureEvent);
        },
        { undoable: false, keepTimestamps: true },
      );
      summary.lectures++;
    }

    this.settings.update({ externalIds: ids });
    onProgress(t('Done'), total, total);
    return summary;
  }

  /** Creates a top-level folder. */
  private createFolder(name: string, createdSec?: number): RemId {
    const folder = this.rems.createFolder(null, name);
    if (createdSec)
      this.store.transact(
        (tx) => void tx.update('rems', folder.id, { createdAt: Math.round(createdSec * 1000) }),
        { undoable: false },
      );
    return folder.id;
  }

  /** Creates the deck Rem and its slide Rems with Fokus' own layout. */
  private async createDeck(deck: FokusDeckJson, pdf: Blob, parentId: RemId): Promise<RemId> {
    const name = deck.name || deck.id;
    const src = await this.files.save(pdf, `${name}.pdf`);
    const geo = deckGeometry(deck);
    const texts = deck.texts ?? [];
    return this.store.transact(
      (tx) => {
        const created = deck.imported ? Math.round(deck.imported * 1000) : this.store.clock.now();
        const rem = this.rems.createIn(
          tx,
          { parentId },
          {
            text: rt(name),
            isDocument: true,
            createdAt: created,
            deck: {
              src,
              pdfName: `${name}.pdf`,
              pdfPages: geo.pdfPages,
              layout: geo.mode,
              boxes: geo.boxes,
            },
          },
        );
        const orders = ordersBetween(null, null, geo.slides.length);
        geo.slides.forEach(([page, box], index) => {
          const text = texts[index] ?? '';
          tx.put(
            'rems',
            createRem(
              {
                parentId: rem.id,
                order: orders[index]!,
                text: rt(slideTitle(index, text)),
                slide: { index, page, box },
                slideText: text,
              },
              this.store.clock.now(),
            ),
          );
        });
        return rem.id;
      },
      { undoable: false },
    );
  }

  /** Notes, markers, drawings and cards of one deck. */
  private async importDeckContent(
    did: string,
    deckId: RemId,
    summary: FokusImportSummary,
    readJson: <T>(path: string, fallback: T) => Promise<T>,
  ): Promise<void> {
    const slides = this.lectures.slides(deckId);
    const notes = await readJson<Record<string, FokusSlideNote>>(`decks/${did}/notes.json`, {});
    for (const [index, note] of Object.entries(notes)) {
      const slide = slides[Number(index)];
      if (!slide) continue;
      // Notes only where none exist yet (safe to re-run).
      if (note.text?.trim() && this.store.children(slide.id).length === 0) {
        this.io.pasteAt({ parentId: slide.id }, noteOutlineSource(note.text));
        summary.slidesWithNotes++;
      }
      const flags = convertFlags(note);
      if (flags.length && !slide.slideFlags?.length)
        this.rems.update(slide.id, { slideFlags: flags });
      const ann = convertAnnotations(note);
      const current = this.lectures.annotations(slide.id);
      const empty = current.strokes.length + current.boxes.length + current.marks.length === 0;
      if (empty && ann.strokes.length + ann.boxes.length + ann.marks.length > 0) {
        this.lectures.setAnnotations(slide.id, ann);
        summary.annotatedSlides++;
      }
    }

    // Cards from *.fokus.json imports, then their disabled state.
    const data = await readJson<FokusCardsJson>(`decks/${did}/cards.json`, {});
    const progress = await readJson<Record<string, FokusCardProgress>>(
      `decks/${did}/cards_progress.json`,
      {},
    );
    for (const { file, doc } of cardDocs(data)) {
      try {
        summary.cards += this.lectures.importCards(deckId, doc, file).cards;
      } catch (e) {
        summary.warnings.push(`Karten aus ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const disabledKeys = new Set<string>();
      for (const card of doc.cards)
        if (progress[await fokusKey(card)]?.disabled) disabledKeys.add(cardKey(card));
      if (!disabledKeys.size) continue;
      const remIds: RemId[] = [];
      walkSubtree(
        this.store,
        deckId,
        (r) => void (r.fokus?.file === file && disabledKeys.has(r.fokus.key) && remIds.push(r.id)),
      );
      const index = selectCardIndex(this.store);
      const cardIds: CardId[] = remIds.flatMap((id) =>
        (index.byRem.get(id) ?? []).map((c) => c.id),
      );
      if (cardIds.length) {
        this.practice.setDisabled(cardIds, true);
        summary.disabledCards += remIds.length;
      }
    }
  }
}

/** Fokus' own card key: SHA-1 of front, back and section (first 12 hex digits). */
async function fokusKey(card: {
  front?: string;
  back?: string;
  section?: string;
}): Promise<string> {
  const raw = `${card.front ?? ''}\u0000${card.back ?? ''}\u0000${card.section ?? ''}`;
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}
