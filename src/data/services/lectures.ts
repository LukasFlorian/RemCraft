/**
 * Application services of lecture mode (ported from Fokus): slide decks,
 * lectures with their event log, slide annotations and the import of
 * `*.fokus.json` card files.
 */
import { buildLectureState, isRunning } from '@core/lecture/session';
import type { FokusDoc, MappedBy } from '@core/lecture/fokusCards';
import { cardKey, cardOutline, noteOutline, resolveSlides, validateFokus } from '@core/lecture/fokusCards';
import { detectBoxes, nonEmptyBoxes } from '@core/lecture/layout';
import { outlineToRems } from '@core/io/markdown';
import { createRem } from '@core/model/factories';
import { ordersBetween } from '@core/model/ordering';
import { walkSubtree } from '@core/model/graph';
import type { Lecture, LectureEvent, Rem, RemId, SlideAnnotations, SlideFlag } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import { newId } from '@core/util/ids';
import type { PdfDoc, PdfEngine } from '../lecture/pdf';
import { pdfJsEngine, textInBox } from '../lecture/pdf';
import type { Store, Transaction } from '../store/store';
import type { FileService } from './files';
import type { RemService } from './rems';

/** Result of a card import. */
export interface FokusImportResult {
  cards: number;
  notes: number;
  mapped: Partial<Record<MappedBy, number>>;
  unmapped: number;
}

/** Slide title from its text (first line, shortened). */
export function slideTitle(index: number, text: string): string {
  const first = text.split('\n').find((l) => l.trim().length > 2)?.trim() ?? '';
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
      doc = this.files.blob(deck.src).then((blob) => {
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
  async analyse(pdf: PdfDoc, mode = 'auto'): Promise<{ boxes: number[][]; slides: { page: number; box: number; text: string }[] }> {
    const n = pdf.pageCount;
    const sample = [...new Set(Array.from({ length: Math.min(16, n) }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, Math.min(16, n) - 1))))];
    const masks = await Promise.all(sample.map((p) => pdf.inkMask(p)));
    const images = await Promise.all(sample.map((p) => pdf.imageRects(p).catch(() => [])));
    const size = n ? await pdf.pageSize(0) : { width: 1, height: 1 };
    const boxes = detectBoxes({ sampleMasks: masks, sampleImages: images, portrait: size.height > 1.2 * size.width }, mode);
    const slides: { page: number; box: number; text: string }[] = [];
    for (let p = 0; p < n; p++) {
      const items = await pdf.text(p).catch(() => []);
      const used = boxes.length === 1 ? [0] : nonEmptyBoxes(await pdf.inkMask(p), boxes);
      for (const b of used) slides.push({ page: p, box: b, text: textInBox(items, boxes[b]!) });
    }
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
      const deck = this.rems.createIn(tx, { parentId }, {
        text: rt(file.name.replace(/\.pdf$/i, '')),
        isDocument: true,
        deck: { src, pdfName: file.name, pdfPages: pdf.pageCount, layout: mode, boxes },
      });
      const orders = ordersBetween(null, null, slides.length);
      slides.forEach((s, index) => {
        tx.put('rems', createRem({ parentId: deck.id, order: orders[index]!, text: rt(slideTitle(index, s.text)), slide: { index, page: s.page, box: s.box }, slideText: s.text }, this.store.clock.now()));
      });
      return deck.id;
    });
  }

  /**
   * Re-detects the slides with another layout mode. Slide Rems are kept by
   * position (their notes stay); surplus empty slides are removed.
   */
  async relayout(deckId: RemId, mode: string): Promise<void> {
    const deck = this.store.get(deckId);
    if (!deck?.deck) return;
    const pdf = await this.openDeck(deckId);
    const { boxes, slides } = await this.analyse(pdf, mode);
    const existing = this.slides(deckId);
    this.store.transact((tx) => {
      tx.update('rems', deckId, { deck: { ...deck.deck!, layout: mode, boxes } });
      const last = existing[existing.length - 1]?.order ?? null;
      const extra = ordersBetween(last, null, Math.max(0, slides.length - existing.length));
      slides.forEach((s, index) => {
        const rem = existing[index];
        const patch = { slide: { index, page: s.page, box: s.box }, slideText: s.text, text: rt(slideTitle(index, s.text)) };
        if (rem) tx.update('rems', rem.id, patch);
        else tx.put('rems', createRem({ parentId: deckId, order: extra[index - existing.length]!, ...patch }, this.store.clock.now()));
      });
      for (const rem of existing.slice(slides.length)) {
        if (this.store.children(rem.id).length === 0) tx.delete('rems', rem.id);
        else tx.update('rems', rem.id, { slide: undefined });
      }
    });
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
      tx.update('rems', slideRemId, { slideFlags: flags.size ? (['important', 'unclear'] as SlideFlag[]).filter((f) => flags.has(f)) : undefined });
      if (lectureId) this.putEvent(tx, lectureId, 'flag', { flag, on, ...(rem.slide ? { slide: rem.slide.index } : {}) });
    });
  }

  // =========================================================================
  // Annotations
  // =========================================================================

  /** Drawings, text boxes and highlights of a slide. */
  annotations(slideRemId: RemId): SlideAnnotations {
    return this.store.getRecord('annotations', slideRemId) ?? { id: slideRemId, strokes: [], boxes: [], marks: [], createdAt: 0, updatedAt: 0 };
  }

  /** Updates the annotations of a slide (one undo step per edit). */
  setAnnotations(slideRemId: RemId, patch: Partial<Omit<SlideAnnotations, 'id'>>): void {
    const current = this.annotations(slideRemId);
    this.store.transact((tx) => void tx.put('annotations', { ...current, ...patch, createdAt: current.createdAt || this.store.clock.now() }));
  }

  // =========================================================================
  // Lectures
  // =========================================================================

  /** Starts a new lecture. */
  start(input: { name: string; deckId: RemId | null; courseId: RemId | null; goal?: string; trackAway: boolean; slide?: number }): Lecture {
    const now = this.store.clock.now();
    return this.store.transact(
      (tx) => {
        const lecture = tx.put('lectures', { id: newId(), name: input.name, deckId: input.deckId, courseId: input.courseId, createdAt: now, updatedAt: now });
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
  record(lectureId: string, type: LectureEvent['type'], fields: Partial<LectureEvent> = {}): LectureEvent {
    return this.store.transact((tx) => this.putEvent(tx, lectureId, type, fields), { undoable: false });
  }

  private putEvent(tx: Transaction, lectureId: string, type: LectureEvent['type'], fields: Partial<LectureEvent>): LectureEvent {
    const t = fields.t ?? this.store.clock.now();
    return tx.put('lectureEvents', { ...fields, id: fields.id ?? newId(), lectureId, type, t, createdAt: t, updatedAt: t } as LectureEvent);
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
  suggestDeck(doc: FokusDoc): RemId | undefined {
    const decks = this.store.all('rems').filter((r) => r.deck);
    const name = doc.source?.pdf?.toLowerCase();
    return (decks.find((d) => name && d.deck!.pdfName.toLowerCase() === name) ?? decks.find((d) => doc.source?.pdf_pages && d.deck!.pdfPages === doc.source.pdf_pages))?.id;
  }

  /**
   * Imports a `fokus-cards` document into a deck: every card and explanation
   * is mapped to its slide and becomes Rems below the slide Rem. Re-importing
   * the same file replaces its Rems but keeps the Rem (and so the learning
   * progress) of every unchanged card.
   *
   * @throws Error when the document is invalid.
   */
  importFokus(deckId: RemId, doc: FokusDoc, fileName: string): FokusImportResult {
    const errors = validateFokus(doc);
    if (errors.length) throw new Error(errors.slice(0, 5).join('; '));
    const slides = this.slides(deckId);
    const refs = slides.map((s) => ({ page: s.slide!.page, text: s.slideText ?? '' }));
    const existing = new Map<string, Rem>();
    walkSubtree(this.store, deckId, (r) => void (r.fokus?.file === fileName && existing.set(r.fokus.key, r)));
    const mapped: Partial<Record<MappedBy, number>> = {};
    let unmapped = 0;
    const result = this.store.transact((tx) => {
      let orphanParent: RemId | null = null;
      const parentFor = (slideIdx: number[]): RemId => {
        const target = slides[slideIdx[0] ?? -1];
        if (target) return target.id;
        if (!orphanParent) {
          const holder = this.store.children(deckId).find((r) => !r.slide && r.text.length && r.fokus?.key === 'unmapped');
          orphanParent = holder?.id ?? this.rems.createIn(tx, { parentId: deckId }, { text: rt('Karten ohne Folie'), fokus: { file: fileName, key: 'unmapped' } }).id;
        }
        return orphanParent;
      };
      const kept = new Set<string>();
      const place = (key: string, outline: ReturnType<typeof cardOutline>, parentId: RemId, origin: Rem['fokus']): void => {
        const created = outlineToRems(outline, parentId, { resolveRef: (n) => this.rems.ensureByName(n, tx), resolveTag: (n) => this.rems.ensureByName(n, tx), now: this.store.clock.now() });
        const root = created.find((r) => r.parentId === parentId);
        if (!root) return;
        const old = existing.get(key);
        kept.add(key);
        const rootId = old?.id ?? root.id;
        if (old) {
          // Keep the Rem id (= card ids = learning progress); replace its content and children.
          for (const c of this.store.children(old.id)) walkSubtree(this.store, c.id, (r) => void tx.delete('rems', r.id));
          tx.put('rems', { ...root, id: old.id, parentId, order: old.parentId === parentId ? old.order : root.order, createdAt: old.createdAt, fokus: origin } as Rem);
        } else tx.put('rems', { ...root, fokus: origin });
        for (const r of created) if (r !== root) tx.put('rems', r.parentId === root.id ? { ...r, parentId: rootId } : r);
      };
      for (const card of doc.cards) {
        const { slides: idx, by } = resolveSlides(card, refs);
        mapped[by] = (mapped[by] ?? 0) + 1;
        if (by === 'none') unmapped++;
        const key = cardKey(card);
        place(key, cardOutline(card), parentFor(idx), { file: fileName, key, ...(card.pages ? { pages: card.pages } : {}), ...(card.anchor ? { anchor: card.anchor } : {}) });
      }
      for (const note of doc.notes ?? []) {
        if (!note?.text?.trim()) continue;
        const { slides: idx } = resolveSlides(note, refs);
        if (!idx.length) unmapped++;
        const key = cardKey({ front: note.title ?? '', back: note.text, section: 'note' });
        place(key, noteOutline(note), parentFor(idx), { file: fileName, key, explanation: true, ...(note.pages ? { pages: note.pages } : {}), ...(note.anchor ? { anchor: note.anchor } : {}) });
      }
      // Remove Rems of this file that are no longer in it.
      for (const [key, rem] of existing) if (!kept.has(key) && key !== 'unmapped') walkSubtree(this.store, rem.id, (r) => void tx.delete('rems', r.id));
      return { cards: doc.cards.length, notes: (doc.notes ?? []).length, mapped, unmapped };
    });
    return result;
  }
}
