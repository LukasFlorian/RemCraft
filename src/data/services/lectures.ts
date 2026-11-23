/**
 * Application services of lecture mode (ported from Fokus): slide decks,
 * lectures with their event log, slide annotations and the import of
 * `*.fokus.json` card files.
 */
import { buildLectureState, isRunning } from '@core/lecture/session';
import { ancestors } from '@core/model/graph';
import type { CardFileDoc, MappedBy } from '@core/lecture/cardFile';
import {
  anchorScore,
  cardKey,
  cardOutline,
  noteOutline,
  resolveSlides,
  validateCardFile,
} from '@core/lecture/cardFile';
import { detectBoxes, nonEmptyBoxes, planRelayout } from '@core/lecture/layout';
import { detectTitles, slideLines } from '@core/lecture/titles';
import type { SlideLine } from '@core/lecture/titles';
import { outlineToRems } from '@core/io/markdown';
import { createRem } from '@core/model/factories';
import { ordersBetween } from '@core/model/ordering';
import { walkSubtree } from '@core/model/graph';
import type {
  Lecture,
  LectureEvent,
  Rem,
  RemId,
  SlideAnnotations,
  SlideFlag,
} from '@core/model/types';
import { rt, toPlainText } from '@core/richtext/ops';
import { newId } from '@core/util/ids';
import type { PdfDoc, PdfEngine } from '../lecture/pdf';
import { pdfJsEngine, textInBox } from '../lecture/pdf';
import type { Store, Transaction } from '../store/store';
import type { FileService } from './files';
import type { RemService } from './rems';

/** Result of a card import. */
export interface CardImportResult {
  cards: number;
  notes: number;
  mapped: Partial<Record<MappedBy, number>>;
  unmapped: number;
}

/** Version of the slide title detection (see `@core/lecture/titles`). */
export const TITLE_VERSION = 2;

/** Slide title from its text (first line, shortened). */
export function slideTitle(index: number, text: string): string {
  const first =
    text
      .split('\n')
      .find((l) => l.trim().length > 2)
      ?.trim() ?? '';
  const short = first.length > 80 ? `${first.slice(0, 77)}…` : first;
  return short ? `Folie ${index + 1} · ${short}` : `Folie ${index + 1}`;
}

/** Lecture-mode services. */
export class LectureService {
  private readonly openDocs = new Map<string, Promise<PdfDoc>>();

  constructor(
    private readonly store: Store,
    private readonly rems: RemService,
    private readonly files: FileService,
    private readonly engine: PdfEngine = pdfJsEngine,
  ) {}

  // =========================================================================
  // Decks
  // =========================================================================

  /** Opens (and caches) the PDF of a deck. */
  openDeck(deckId: RemId): Promise<PdfDoc> {
    const deck = this.store.get(deckId)?.deck;
    if (!deck) return Promise.reject(new Error('Not a slide deck'));
    let doc = this.openDocs.get(deck.src);
    if (!doc) {
      doc = this.files.blob(deck.src, deck.origin).then((blob) => {
        if (!blob) throw new Error('PDF file is not available on this device yet');
        return this.engine.open(blob);
      });
      doc.catch(() => this.openDocs.delete(deck.src));
      this.openDocs.set(deck.src, doc);
    }
    return doc;
  }

  /**
   * Analyses a PDF: slide boxes, slide list and slide texts.
   *
   * @param pdf Opened PDF.
   * @param mode Layout mode (`auto` or `RxC`).
   */
  async analyse(
    pdf: PdfDoc,
    mode = 'auto',
  ): Promise<{
    boxes: number[][];
    slides: { page: number; box: number; text: string; title: string }[];
  }> {
    const n = pdf.pageCount;
    const sample = [
      ...new Set(
        Array.from({ length: Math.min(16, n) }, (_, i) =>
          Math.round((i * (n - 1)) / Math.max(1, Math.min(16, n) - 1)),
        ),
      ),
    ];
    const masks = await Promise.all(sample.map((p) => pdf.inkMask(p)));
    const images = await Promise.all(sample.map((p) => pdf.imageRects(p).catch(() => [])));
    const size = n ? await pdf.pageSize(0) : { width: 1, height: 1 };
    const boxes = detectBoxes(
      { sampleMasks: masks, sampleImages: images, portrait: size.height > 1.2 * size.width },
      mode,
    );
    const found: { page: number; box: number; text: string; lines: SlideLine[] }[] = [];
    for (let p = 0; p < n; p++) {
      const items = await pdf.text(p).catch(() => []);
      const used = boxes.length === 1 ? [0] : nonEmptyBoxes(await pdf.inkMask(p), boxes);
      for (const b of used)
        found.push({
          page: p,
          box: b,
          text: textInBox(items, boxes[b]!),
          lines: slideLines(items, boxes[b]!),
        });
    }
    const titles = detectTitles(found.map((f) => f.lines));
    const slides = found.map(({ lines: _l, ...f }, i) => ({ ...f, title: titles[i] ?? '' }));
    return { boxes, slides };
  }

  /**
   * Imports a PDF as slide deck: stores the file, detects the layout, extracts
   * texts and creates the deck document with one Rem per slide.
   *
   * @param file The PDF.
   * @param parentId Course folder (or `null`).
   * @param mode Layout mode.
   * @returns Id of the deck document.
   */
  async importPdf(file: File, parentId: RemId | null, mode = 'auto'): Promise<RemId> {
    const src = await this.files.save(file, file.name);
    const pdf = await this.engine.open(file);
    const { boxes, slides } = await this.analyse(pdf, mode);
    this.openDocs.set(src, Promise.resolve(pdf));
    return this.store.transact((tx) => {
      const deck = this.rems.createIn(
        tx,
        { parentId },
        {
          text: rt(file.name.replace(/\.pdf$/i, '')),
          isDocument: true,
          deck: {
            src,
            pdfName: file.name,
            pdfPages: pdf.pageCount,
            layout: mode,
            boxes,
            titles: TITLE_VERSION,
          },
        },
      );
      const orders = ordersBetween(null, null, slides.length);
      slides.forEach((s, index) => {
        tx.put(
          'rems',
          createRem(
            {
              parentId: deck.id,
              order: orders[index]!,
              text: rt(slideTitle(index, s.title || s.text)),
              slide: { index, page: s.page, box: s.box },
              slideText: s.text,
            },
            this.store.clock.now(),
          ),
        );
      });
      return deck.id;
    });
  }

  /**
   * Re-detects the slides with another layout mode. Notes, cards, markers and
   * drawings follow the place on the PDF page they belong to (see
   * `planRelayout`), so switching layouts back and forth never loses or
   * shifts content; slides that no longer exist hand their content over.
   */
  async relayout(deckId: RemId, mode: string): Promise<void> {
    const deck = this.store.get(deckId);
    if (!deck?.deck) return;
    const pdf = await this.openDeck(deckId);
    const { boxes, slides } = await this.analyse(pdf, mode);
    const existing = this.slides(deckId);
    const oldBoxes = deck.deck.boxes;
    const hasContent = (i: number): boolean => {
      const rem = existing[i]!;
      const ann = this.store.getRecord('annotations', rem.id);
      return (
        this.store.children(rem.id).length > 0 ||
        Boolean(rem.slideFlags?.length) ||
        Boolean(ann && ann.strokes.length + ann.boxes.length + ann.marks.length)
      );
    };
    const plan = planRelayout(
      existing.map((r) => ({ page: r.slide!.page, box: oldBoxes[r.slide!.box] ?? [0, 0, 1, 1] })),
      slides.map((s) => ({ page: s.page, box: boxes[s.box] ?? [0, 0, 1, 1] })),
      hasContent,
    );
    this.store.transact((tx) => {
      tx.update('rems', deckId, {
        deck: { ...deck.deck!, layout: mode, boxes, titles: TITLE_VERSION },
      });
      // Slide Rems in the new order: reused ones are re-sorted, new ones created.
      const orders = ordersBetween(null, null, slides.length);
      const target: RemId[] = slides.map((s, index) => {
        const patch = {
          order: orders[index]!,
          slide: { index, page: s.page, box: s.box },
          slideText: s.text,
          text: rt(slideTitle(index, s.title || s.text)),
        };
        const oi = plan.reuse[index];
        if (oi !== null && oi !== undefined) return tx.update('rems', existing[oi]!.id, patch)!.id;
        return tx.put('rems', createRem({ parentId: deckId, ...patch }, this.store.clock.now())).id;
      });
      // Content of slides that are gone moves to the closest new slide.
      existing.forEach((rem, oi) => {
        if (plan.reuse.includes(oi)) return;
        const ni = plan.moveTo.get(oi);
        if (ni !== undefined) {
          const to = target[ni]!;
          const kids = this.store.children(rem.id);
          const last = this.store.children(to).at(-1)?.order ?? null;
          const keys = ordersBetween(last, null, kids.length);
          kids.forEach((k, i) => tx.update('rems', k.id, { parentId: to, order: keys[i]! }));
          const flags = [
            ...new Set([...(tx.get('rems', to)?.slideFlags ?? []), ...(rem.slideFlags ?? [])]),
          ];
          if (flags.length) tx.update('rems', to, { slideFlags: flags });
          const ann = this.store.getRecord('annotations', rem.id);
          if (ann) {
            const cur = tx.get('annotations', to);
            const now = this.store.clock.now();
            tx.put('annotations', {
              id: to,
              strokes: [...(cur?.strokes ?? []), ...ann.strokes],
              boxes: [...(cur?.boxes ?? []), ...ann.boxes],
              marks: [...(cur?.marks ?? []), ...ann.marks],
              createdAt: cur?.createdAt ?? now,
              updatedAt: now,
            });
            tx.delete('annotations', rem.id);
          }
        }
        tx.delete('rems', rem.id);
      });
    });
  }

  /**
   * Re-detects the slide titles of a deck (decks imported before the layout-
   * based title detection). Only titles that still look generated
   * ("Folie N" / "Folie N · …") are replaced; renamed slides stay as they are.
   *
   * @returns Number of updated slides.
   */
  async retitle(deckId: RemId): Promise<number> {
    const deck = this.store.get(deckId);
    if (!deck?.deck) return 0;
    const pdf = await this.openDeck(deckId);
    const slides = this.slides(deckId);
    const lines: SlideLine[][] = [];
    const pages = new Map<number, Awaited<ReturnType<PdfDoc['text']>>>();
    for (const s of slides) {
      const page = s.slide!.page;
      if (!pages.has(page)) pages.set(page, await pdf.text(page).catch(() => []));
      lines.push(slideLines(pages.get(page)!, deck.deck.boxes[s.slide!.box] ?? [0, 0, 1, 1]));
    }
    const titles = detectTitles(lines);
    let changed = 0;
    this.store.transact(
      (tx) => {
        slides.forEach((s, i) => {
          const current = toPlainText(s.text);
          if (!/^Folie \d+( · .*)?$/.test(current)) return; // renamed by the user
          const next = slideTitle(i, titles[i] || s.slideText || '');
          if (next !== current) {
            tx.update('rems', s.id, { text: rt(next) });
            changed++;
          }
        });
        tx.update('rems', deckId, { deck: { ...deck.deck!, titles: TITLE_VERSION } });
      },
      { undoable: false },
    );
    return changed;
  }

  /**
   * Repairs decks affected by an earlier re-layout bug: former slide Rems that
   * lost their slide link (but still carry `slideText`) hand their notes and
   * cards back to the slide with the same text, then disappear.
   *
   * @returns Number of repaired Rems.
   */
  repairDeck(deckId: RemId): number {
    const slides = this.slides(deckId);
    const orphans = this.store
      .children(deckId)
      .filter((r) => !r.slide && r.slideText !== undefined);
    if (!orphans.length || !slides.length) return 0;
    const norm = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase();
    this.store.transact(
      (tx) => {
        for (const orphan of orphans) {
          const text = norm(orphan.slideText ?? '');
          const target =
            slides.find((s) => norm(s.slideText ?? '') === text) ??
            slides.reduce(
              (best, s) =>
                anchorScore(orphan.slideText ?? '', s.slideText ?? '') >
                anchorScore(orphan.slideText ?? '', best.slideText ?? '')
                  ? s
                  : best,
              slides[0]!,
            );
          const kids = this.store.children(orphan.id);
          const keys = ordersBetween(
            this.store.children(target.id).at(-1)?.order ?? null,
            null,
            kids.length,
          );
          kids.forEach((k, i) => tx.update('rems', k.id, { parentId: target.id, order: keys[i]! }));
          tx.delete('rems', orphan.id);
        }
      },
      { undoable: false },
    );
    return orphans.length;
  }

  /** Slide Rems of a deck in slide order. */
  slides(deckId: RemId): Rem[] {
    return this.store
      .children(deckId)
      .filter((r) => r.slide)
      .sort((a, b) => a.slide!.index - b.slide!.index);
  }

  /** Toggles a marker on a slide (and logs it in the running lecture). */
  setFlag(slideRemId: RemId, flag: SlideFlag, on: boolean, lectureId?: string): void {
    const rem = this.store.get(slideRemId);
    if (!rem) return;
    const flags = new Set(rem.slideFlags ?? []);
    if (on) flags.add(flag);
    else flags.delete(flag);
    this.store.transact((tx) => {
      tx.update('rems', slideRemId, {
        slideFlags: flags.size
          ? (['important', 'unclear'] as SlideFlag[]).filter((f) => flags.has(f))
          : undefined,
      });
      if (lectureId)
        this.putEvent(tx, lectureId, 'flag', {
          flag,
          on,
          ...(rem.slide ? { slide: rem.slide.index } : {}),
        });
    });
  }

  // =========================================================================
  // Annotations
  // =========================================================================

  /** Drawings, text boxes and highlights of a slide. */
  annotations(slideRemId: RemId): SlideAnnotations {
    return (
      this.store.getRecord('annotations', slideRemId) ?? {
        id: slideRemId,
        strokes: [],
        boxes: [],
        marks: [],
        createdAt: 0,
        updatedAt: 0,
      }
    );
  }

  /**
   * Updates the annotations of a slide (one undo step per edit).
   *
   * @param slideRemId Slide Rem.
   * @param patch Fields to replace.
   * @param options `coalesceKey` merges consecutive edits with the same key
   *   (e.g. typing into one text box) into one undo step.
   */
  setAnnotations(
    slideRemId: RemId,
    patch: Partial<Omit<SlideAnnotations, 'id'>>,
    options: { coalesceKey?: string } = {},
  ): void {
    const current = this.annotations(slideRemId);
    this.store.transact(
      (tx) =>
        void tx.put('annotations', {
          ...current,
          ...patch,
          createdAt: current.createdAt || this.store.clock.now(),
        }),
      options,
    );
  }

  // =========================================================================
  // Lectures
  // =========================================================================

  /** Starts a new lecture. */
  start(input: {
    name: string;
    deckId: RemId | null;
    courseId: RemId | null;
    goal?: string;
    trackAway: boolean;
    slide?: number;
  }): Lecture {
    const now = this.store.clock.now();
    return this.store.transact(
      (tx) => {
        const lecture = tx.put('lectures', {
          id: newId(),
          name: input.name,
          deckId: input.deckId,
          courseId: input.courseId,
          createdAt: now,
          updatedAt: now,
        });
        this.putEvent(tx, lecture.id, 'focus', { trackAway: input.trackAway });
        this.putEvent(tx, lecture.id, 'start', {});
        if (input.goal?.trim()) this.putEvent(tx, lecture.id, 'goal', { text: input.goal.trim() });
        if (input.deckId) this.putEvent(tx, lecture.id, 'slide', { slide: input.slide ?? 0 });
        return lecture;
      },
      { undoable: false },
    );
  }

  /** Appends an event to a lecture. */
  record(
    lectureId: string,
    type: LectureEvent['type'],
    fields: Partial<LectureEvent> = {},
  ): LectureEvent {
    return this.store.transact((tx) => this.putEvent(tx, lectureId, type, fields), {
      undoable: false,
    });
  }

  private putEvent(
    tx: Transaction,
    lectureId: string,
    type: LectureEvent['type'],
    fields: Partial<LectureEvent>,
  ): LectureEvent {
    const t = fields.t ?? this.store.clock.now();
    return tx.put('lectureEvents', {
      ...fields,
      id: fields.id ?? newId(),
      lectureId,
      type,
      t,
      createdAt: t,
      updatedAt: t,
    } as LectureEvent);
  }

  /** Events of a lecture. */
  events(lectureId: string): LectureEvent[] {
    return this.store.all('lectureEvents').filter((e) => e.lectureId === lectureId);
  }

  /** Pause (clock stops) or resume. */
  setPaused(lectureId: string, paused: boolean): void {
    this.record(lectureId, paused ? 'stop' : 'start', paused ? { pause: true } : {});
  }

  /** Finishes a lecture; resumes a finished one with `start`. */
  stop(lectureId: string): void {
    const st = buildLectureState(this.events(lectureId));
    if (isRunning(st) || st.pausedSince !== null) this.record(lectureId, 'stop');
  }

  /** Renames or re-assigns a lecture. */
  update(lectureId: string, patch: Partial<Lecture>): void {
    this.store.transact((tx) => void tx.update('lectures', lectureId, patch));
  }

  /** Deletes a lecture and its events. */
  delete(lectureId: string): void {
    this.store.transact((tx) => {
      tx.delete('lectures', lectureId);
      for (const e of this.events(lectureId)) tx.delete('lectureEvents', e.id);
    });
  }

  // =========================================================================
  // Fokus card files
  // =========================================================================

  /** Suggests the deck a card file belongs to (by PDF name, then page count). */
  suggestDeck(doc: CardFileDoc, within?: RemId | null): RemId | undefined {
    // Decks inside `within` (e.g. the folder a file was dropped on) come first.
    const inside = (id: RemId): boolean =>
      !within || ancestors(this.store, id).some((a) => a.id === within);
    const all = this.store.all('rems').filter((r) => r.deck);
    const decks = [...all.filter((d) => inside(d.id)), ...all.filter((d) => !inside(d.id))];
    const name = doc.source?.pdf?.toLowerCase();
    return (
      decks.find((d) => name && d.deck!.pdfName.toLowerCase() === name) ??
      decks.find((d) => doc.source?.pdf_pages && d.deck!.pdfPages === doc.source.pdf_pages)
    )?.id;
  }

  /**
   * Imports a card file (`remcraft-cards`) into a deck: every card and explanation
   * is mapped to its slide and becomes Rems below the slide Rem. Re-importing
   * the same file replaces its Rems but keeps the Rem (and so the learning
   * progress) of every unchanged card.
   *
   * @throws Error when the document is invalid.
   */
  importCards(deckId: RemId, doc: CardFileDoc, fileName: string): CardImportResult {
    const errors = validateCardFile(doc);
    if (errors.length) throw new Error(errors.slice(0, 5).join('; '));
    const slides = this.slides(deckId);
    const refs = slides.map((s) => ({ page: s.slide!.page, text: s.slideText ?? '' }));
    const existing = new Map<string, Rem>();
    walkSubtree(
      this.store,
      deckId,
      (r) => void (r.fokus?.file === fileName && existing.set(r.fokus.key, r)),
    );
    const mapped: Partial<Record<MappedBy, number>> = {};
    let unmapped = 0;
    const result = this.store.transact((tx) => {
      let orphanParent: RemId | null = null;
      const parentFor = (slideIdx: number[]): RemId => {
        const target = slides[slideIdx[0] ?? -1];
        if (target) return target.id;
        if (!orphanParent) {
          const holder = this.store
            .children(deckId)
            .find((r) => !r.slide && r.text.length && r.fokus?.key === 'unmapped');
          orphanParent =
            holder?.id ??
            this.rems.createIn(
              tx,
              { parentId: deckId },
              { text: rt('Karten ohne Folie'), fokus: { file: fileName, key: 'unmapped' } },
            ).id;
        }
        return orphanParent;
      };
      const kept = new Set<string>();
      const place = (
        key: string,
        outline: ReturnType<typeof cardOutline>,
        parentId: RemId,
        origin: Rem['fokus'],
      ): void => {
        const created = outlineToRems(outline, parentId, {
          resolveRef: (n) => this.rems.ensureByName(n, tx),
          resolveTag: (n) => this.rems.ensureByName(n, tx),
          now: this.store.clock.now(),
        });
        const root = created.find((r) => r.parentId === parentId);
        if (!root) return;
        const old = existing.get(key);
        kept.add(key);
        const rootId = old?.id ?? root.id;
        if (old) {
          // Keep the Rem id (= card ids = learning progress); replace its content and children.
          for (const c of this.store.children(old.id))
            walkSubtree(this.store, c.id, (r) => void tx.delete('rems', r.id));
          tx.put('rems', {
            ...root,
            id: old.id,
            parentId,
            order: old.parentId === parentId ? old.order : root.order,
            createdAt: old.createdAt,
            fokus: origin,
          } as Rem);
        } else tx.put('rems', { ...root, fokus: origin });
        for (const r of created)
          if (r !== root) tx.put('rems', r.parentId === root.id ? { ...r, parentId: rootId } : r);
      };
      for (const card of doc.cards) {
        const { slides: idx, by } = resolveSlides(card, refs);
        mapped[by] = (mapped[by] ?? 0) + 1;
        if (by === 'none') unmapped++;
        const key = cardKey(card);
        place(key, cardOutline(card), parentFor(idx), {
          file: fileName,
          key,
          ...(card.pages ? { pages: card.pages } : {}),
          ...(card.anchor ? { anchor: card.anchor } : {}),
        });
      }
      for (const note of doc.notes ?? []) {
        if (!note?.text?.trim()) continue;
        const { slides: idx } = resolveSlides(note, refs);
        if (!idx.length) unmapped++;
        const key = cardKey({ front: note.title ?? '', back: note.text, section: 'note' });
        place(key, noteOutline(note), parentFor(idx), {
          file: fileName,
          key,
          explanation: true,
          ...(note.pages ? { pages: note.pages } : {}),
          ...(note.anchor ? { anchor: note.anchor } : {}),
        });
      }
      // Remove Rems of this file that are no longer in it.
      for (const [key, rem] of existing)
        if (!kept.has(key) && key !== 'unmapped')
          walkSubtree(this.store, rem.id, (r) => void tx.delete('rems', r.id));
      return { cards: doc.cards.length, notes: (doc.notes ?? []).length, mapped, unmapped };
    });
    return result;
  }
}
