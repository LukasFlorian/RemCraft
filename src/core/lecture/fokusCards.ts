/**
 * The `fokus-cards` exchange format (`*.fokus.json`, written by the
 * `fokus-flashcards` Claude skill): flashcards and slide explanations with
 * the PDF page(s) and a verbatim *anchor* phrase of their slide.
 *
 * Import maps every item onto a slide (page + anchor, see
 * {@link resolveSlides}) and turns it into RemCraft Rems below the slide Rem,
 * so imported cards are regular spaced-repetition cards. Export produces the
 * same format from a deck, closing the loop with the skill and Fokus.
 */
import { exportMarkdown } from '../io/markdown';
import type { OutlineNode } from '../io/outline';
import { parseOutline } from '../io/outline';
import { answerChildren, generateCards } from '../cards/generate';
import { mcOptions } from '../cards/content';
import type { RemGraph } from '../model/graph';
import type { Rem, RemId } from '../model/types';
import { toPlainText } from '../richtext/ops';
import { fold } from '../search/search';
import { isoDate } from '../util/time';

/** Format name and version. */
export const FOKUS_FORMAT = 'fokus-cards';
export const FOKUS_VERSION = 1;
/** Card types of the format. */
export const FOKUS_TYPES = ['basic', 'concept', 'cloze', 'mc', 'numeric', 'set', 'list', 'descriptor'] as const;

/** A card of a `fokus-cards` file. */
export interface FokusCard {
  id?: string;
  section?: string;
  type?: string;
  front: string;
  back?: string;
  options?: { text: string; correct: boolean }[];
  items?: string[];
  pages?: number[];
  anchor?: string;
  remnote?: string;
}

/** An explanation of a slide. */
export interface FokusNote {
  pages?: number[];
  anchor?: string;
  title?: string;
  text: string;
}

/** A `fokus-cards` document. */
export interface FokusDoc {
  format: typeof FOKUS_FORMAT;
  version: number;
  created?: string;
  source?: { pdf?: string; pdf_pages?: number; title?: string };
  remnote_file?: string;
  cards: FokusCard[];
  notes?: FokusNote[];
}

/** Problems of an import file (empty = fine). */
export function validateFokus(doc: unknown): string[] {
  const d = doc as Partial<FokusDoc> | null;
  if (!d || typeof d !== 'object' || d.format !== FOKUS_FORMAT) return [`Kein Fokus-Kartenformat (erwartet "format": "${FOKUS_FORMAT}")`];
  const errors: string[] = [];
  if (Number(d.version ?? 0) > FOKUS_VERSION) errors.push(`Version ${String(d.version)} ist neuer als diese App (kann ${FOKUS_VERSION})`);
  if (!Array.isArray(d.cards) || (d.notes !== undefined && !Array.isArray(d.notes))) errors.push('"cards" und "notes" müssen Listen sein');
  else if (d.cards.length + (d.notes?.length ?? 0) > 5000) errors.push('Zu viele Einträge (max. 5000)');
  else d.cards.forEach((c, i) => (!c || !String(c.front ?? '').trim()) && errors.push(`Karte ${i + 1}: "front" fehlt`));
  return errors;
}

/** FNV-1a hash as 12 hex characters (deterministic on every device). */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

/** Stable content key: results survive re-imports and re-ordering. */
export function cardKey(card: Pick<FokusCard, 'front' | 'back' | 'section'>): string {
  return hash(`${card.front}\u0000${card.back ?? ''}\u0000${card.section ?? ''}`);
}

/** Folded words of a text. */
function words(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}_]+/gu) ?? [];
}

/**
 * How well a verbatim phrase matches a slide's text: 1 when contained,
 * otherwise the share of its words found on the slide.
 */
export function anchorScore(anchor: string, slideText: string): number {
  const a = words(anchor).join(' ');
  const t = words(slideText).join(' ');
  if (!a || !t) return 0;
  if (t.includes(a)) return 1;
  const aw = new Set(a.split(' '));
  const tw = new Set(t.split(' '));
  // Word overlap stays below a verbatim match, so the slide quoting the phrase wins ties.
  return Math.min(0.99, [...aw].filter((w) => tw.has(w)).length / aw.size);
}

/** A slide as seen by the resolver. */
export interface SlideRef {
  /** 0-based PDF page. */
  page: number;
  text: string;
}

/** How an item was mapped. */
export type MappedBy = 'page' | 'page+anchor' | 'anchor' | 'none';

/**
 * Slides (0-based indices) an imported item belongs to.
 *
 * 1. Slides on the given PDF pages (1-based); several per page → the anchor decides.
 * 2. No usable page, or the anchor clearly fits elsewhere → best anchor match over all slides.
 */
export function resolveSlides(item: { pages?: unknown[]; anchor?: string }, slides: readonly SlideRef[]): { slides: number[]; by: MappedBy } {
  const byPage = new Map<number, number[]>();
  slides.forEach((s, i) => byPage.set(s.page + 1, [...(byPage.get(s.page + 1) ?? []), i]));
  const pages = (item.pages ?? []).map(Number).filter((p) => Number.isInteger(p));
  const anchor = String(item.anchor ?? '');
  const candidates = pages.flatMap((p) => byPage.get(p) ?? []);
  const score = (i: number): number => anchorScore(anchor, slides[i]?.text ?? '');
  const firstPerPage = (): number[] => [...new Set(pages.filter((p) => byPage.has(p)).map((p) => byPage.get(p)![0]!))].sort((a, b) => a - b);
  if (candidates.length) {
    if (!anchor) return { slides: firstPerPage(), by: 'page' };
    const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    if (score(best) >= 0.5) {
      const same = candidates.filter((s) => score(s) >= Math.max(0.5, score(best) - 1e-9));
      return { slides: [...new Set(same)].sort((a, b) => a - b), by: 'page+anchor' };
    }
  }
  if (anchor) {
    let top = -1;
    let topScore = 0;
    slides.forEach((_, i) => {
      const sc = score(i);
      if (sc > topScore) {
        top = i;
        topScore = sc;
      }
    });
    if (topScore >= 0.6) return { slides: [top], by: 'anchor' };
  }
  if (candidates.length) return { slides: firstPerPage(), by: 'page' };
  return { slides: [], by: 'none' };
}

/** Escapes RemNote delimiters inside readable text used as fallback. */
function plain(s: string): string {
  return s.replace(/(>>|<<|==|::|;;|\{\{|\}\})/g, (m) => m.split('').map((c) => `\\${c}`).join(''));
}

/**
 * Outline nodes of a card: its `remnote` lines if present (exactly what the
 * skill wrote), otherwise built from the readable fields.
 */
export function cardOutline(card: FokusCard): OutlineNode[] {
  if (card.remnote?.trim()) return parseOutline(card.remnote);
  const front = plain(card.front.trim());
  const back = plain((card.back ?? '').trim());
  switch (card.type) {
    case 'mc': {
      const opts = [...(card.options ?? [])].sort((a, b) => Number(b.correct) - Number(a.correct));
      const correct = opts.map((o, i) => (o.correct ? String.fromCharCode(65 + i) : null)).filter(Boolean);
      return parseOutline(`- ${front} {CORRECT: ${correct.join(', ') || 'A'}} >>A)\n${opts.map((o) => `    - ${plain(o.text)}`).join('\n')}`);
    }
    case 'set':
    case 'list':
      return parseOutline(`- ${front} ${card.type === 'list' ? '>>1.' : '>>>'}\n${(card.items ?? []).map((i) => `    - ${plain(i)}`).join('\n')}`);
    case 'concept':
      return parseOutline(`- ${front} :: ${back}`);
    case 'cloze':
      return parseOutline(`- ${card.front}`);
    default:
      return parseOutline(`- ${front} >> ${back}`);
  }
}

/** Outline of an explanation: title bullet with the Markdown text below. */
export function noteOutline(note: FokusNote): OutlineNode[] {
  const body = parseOutline(note.text);
  return [{ text: `💡 ${plain(note.title?.trim() || 'Erklärung')}`, block: {}, children: body }];
}

/**
 * Exports the cards of a deck as a `fokus-cards` document plus the matching
 * RemNote file contents.
 *
 * @param graph Rem graph.
 * @param deckId Deck document.
 * @param fileBase Base name for the files (`<base>.remnote.md`).
 */
export function exportFokus(graph: RemGraph, deckId: RemId, fileBase: string): { doc: FokusDoc; remnote: string } {
  const deck = graph.get(deckId);
  const slides = graph.children(deckId).filter((r) => r.slide);
  const title = (r: Rem): string => toPlainText(r.text);
  const cards: FokusCard[] = [];
  const notes: FokusNote[] = [];
  const refName = (id: RemId): string => toPlainText(graph.get(id)?.text ?? []);
  let n = 0;
  const visit = (rem: Rem, slide: Rem, section: string): void => {
    const children = graph.children(rem.id);
    const specs = generateCards(rem, children);
    const anchor = (slide.slideText ?? title(slide)).split(/\s+/).slice(0, 8).join(' ');
    const pages = [(slide.slide?.page ?? 0) + 1];
    if (rem.fokus?.explanation) {
      notes.push({ pages, anchor, title: title(rem).replace(/^💡\s*/, ''), text: exportMarkdown(graph, [rem.id], { includeRoot: false }) });
      return;
    }
    if (specs.length) {
      const items = answerChildren(children);
      const type = rem.answerMode === 'mc' ? 'mc' : rem.answerMode === 'list' ? 'list' : rem.answerMode === 'set' ? 'set' : specs[0]!.kind === 'cloze' ? 'cloze' : rem.kind === 'plain' ? 'basic' : rem.kind;
      cards.push({
        id: `c${String(++n).padStart(3, '0')}`,
        section,
        type,
        front: toPlainText(rem.text, refName),
        back: toPlainText(rem.back ?? [], refName),
        options: rem.answerMode === 'mc' ? mcOptions(children).map((o) => ({ text: refName(o.remId), correct: o.correct })).sort((a, b) => Number(b.correct) - Number(a.correct)) : [],
        items: rem.answerMode === 'set' || rem.answerMode === 'list' ? items.map((i) => title(i)) : [],
        pages: rem.fokus?.pages ?? pages,
        anchor: rem.fokus?.anchor ?? anchor,
        remnote: exportMarkdown(graph, [rem.id]).replace(/\n$/, ''),
      });
      if (rem.answerMode !== 'inline') return; // children are the answer
    }
    for (const c of children) visit(c, slide, section);
  };
  for (const slide of slides) for (const c of graph.children(slide.id)) visit(c, slide, title(slide));
  const remnote = slides.map((s) => exportMarkdown(graph, [s.id])).join('');
  return {
    doc: {
      format: FOKUS_FORMAT,
      version: FOKUS_VERSION,
      created: isoDate(Date.now()),
      source: { pdf: deck?.deck?.pdfName ?? '', pdf_pages: deck?.deck?.pdfPages ?? 0, title: deck ? title(deck) : '' },
      remnote_file: `${fileBase}.remnote.md`,
      cards,
      notes,
    },
    remnote,
  };
}
