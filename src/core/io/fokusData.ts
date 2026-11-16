/**
 * Conversion of a Fokus data directory (`quasi_counter_and_regression`,
 * folder `data/`) into RemCraft records. Pure functions; reading the files is
 * done by the data layer (`data/services/fokusImport.ts`).
 *
 * Fokus layout (all JSON, timestamps in unix *seconds*):
 *
 * ```
 * courses/<cid>/course.json          {name, created}
 * courses/<cid>/files/<name>         uploaded files
 * decks/<did>/deck.json              {id, name, imported, pdf_pages, layout: {mode, boxes}, slides: [[page, box]], texts, course_id}
 * decks/<did>/slides.pdf             the PDF (did = sha256(pdf)[:16])
 * decks/<did>/notes.json             {"<slide>": {text, strokes, flags, boxes, marks}}
 * decks/<did>/cards.json             {imports: [{id, file, source}], cards: [...], notes: [...]}
 * decks/<did>/cards_progress.json    {<key>: {known, unknown, last, last_known, disabled}}
 * sessions/<sid>/meta.json           {name, created, course_id}
 * sessions/<sid>/events.jsonl        one event per line (see `fokus/session.py`)
 * ```
 */
import type { FokusCard, FokusDoc, FokusNote } from '../lecture/fokusCards';
import type {
  LectureEvent,
  SlideAnnotations,
  SlideFlag,
  Stroke,
  TextBox,
  TextMark,
} from '../model/types';

/** `deck.json`. */
export interface FokusDeckJson {
  id: string;
  name?: string;
  imported?: number;
  pdf_pages?: number;
  pages?: number;
  layout?: { mode?: string; boxes?: number[][] };
  slides?: [number, number][];
  texts?: string[];
  course_id?: string;
}

/** One entry of `notes.json`. */
export interface FokusSlideNote {
  text?: string;
  strokes?: { c?: string; w?: number; a?: number; p?: [number, number][] }[];
  flags?: string[];
  boxes?: Partial<TextBox>[];
  marks?: Partial<TextMark>[];
}

/** `cards.json`. */
export interface FokusCardsJson {
  imports?: { id: string; file?: string; source?: FokusDoc['source'] }[];
  cards?: (FokusCard & { import?: string })[];
  notes?: (FokusNote & { import?: string })[];
}

/** One entry of `cards_progress.json`. */
export interface FokusCardProgress {
  known?: number;
  unknown?: number;
  last?: number;
  last_known?: boolean;
  disabled?: boolean;
}

/** `meta.json` of a session. */
export interface FokusSessionMeta {
  name?: string;
  created?: number;
  course_id?: string;
}

/** Whole-page box used by decks from before handout layouts existed. */
const FULL_PAGE = [0, 0, 1, 1];

/** Deck geometry with defaults for old decks (one slide per page). */
export function deckGeometry(deck: FokusDeckJson): {
  mode: string;
  boxes: number[][];
  slides: [number, number][];
  pdfPages: number;
} {
  if (deck.slides && deck.layout?.boxes?.length) {
    return {
      mode: deck.layout.mode ?? 'auto',
      boxes: deck.layout.boxes,
      slides: deck.slides,
      pdfPages: deck.pdf_pages ?? deck.slides.length,
    };
  }
  const pages = deck.pdf_pages ?? deck.pages ?? 0;
  return {
    mode: '1x1',
    boxes: [FULL_PAGE],
    slides: Array.from({ length: pages }, (_, p) => [p, 0] as [number, number]),
    pdfPages: pages,
  };
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Converts the drawings of one slide. Fokus strokes are `{c, w, a, p: [[x, y]]}`;
 * translucent strokes (alpha < 1) were drawn with the marker.
 */
export function convertAnnotations(
  note: FokusSlideNote,
): Pick<SlideAnnotations, 'strokes' | 'boxes' | 'marks'> {
  const strokes: Stroke[] = (note.strokes ?? [])
    .filter((s) => Array.isArray(s.p) && s.p.length >= 1)
    .map((s) => ({
      tool: (s.a ?? 1) < 1 ? 'marker' : 'pen',
      color: s.c && COLOR.test(s.c) ? s.c : '#ff3b30',
      width: typeof s.w === 'number' ? s.w : 0.004,
      p: s.p!.flatMap(([x, y]) => [x, y]),
    }));
  const boxes: TextBox[] = (note.boxes ?? [])
    .filter((b) => typeof b.text === 'string' && b.text.trim())
    .map((b, i) => ({
      id: b.id || `b${i}`,
      x: b.x ?? 0.1,
      y: b.y ?? 0.1,
      w: b.w ?? 0.3,
      s: b.s ?? 0.022,
      c: b.c && COLOR.test(b.c) ? b.c : '#111111',
      bg: b.bg === 'white' || b.bg === 'none' ? b.bg : 'note',
      text: b.text!,
    }));
  const marks: TextMark[] = (note.marks ?? [])
    .filter((m) => Array.isArray(m.rects) && m.rects.length)
    .map((m, i) => ({
      id: m.id || `m${i}`,
      c: m.c && COLOR.test(m.c) ? m.c : '#ffd60a',
      text: m.text ?? '',
      rects: m.rects!,
    }));
  return { strokes, boxes, marks };
}

/** Valid slide markers of a note. */
export function convertFlags(note: FokusSlideNote): SlideFlag[] {
  return (note.flags ?? []).filter((f): f is SlideFlag => f === 'important' || f === 'unclear');
}

/**
 * Note text as outline source: every non-empty line becomes a Rem. Leading
 * whitespace is kept (indentation = nesting); lines get a bullet so plain
 * text and Markdown lists are parsed alike.
 */
export function noteOutlineSource(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const indent = /^\s*/.exec(l)![0].replace(/\t/g, '    ');
      const body = l.trim().replace(/^[-*•]\s+/, '');
      return `${indent}- ${body}`;
    })
    .join('\n');
}

/** Parses a JSON-lines file, skipping broken lines (e.g. a cut-off last line). */
export function parseJsonl(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as unknown;
      if (v && typeof v === 'object') out.push(v as Record<string, unknown>);
    } catch {
      // ignore
    }
  }
  return out;
}

/** A converted event (timestamps of the record are set by the importer). */
export type ConvertedEvent = Omit<LectureEvent, 'createdAt' | 'updatedAt'>;

/** Result of {@link convertSessionEvents}. */
export interface ConvertedSession {
  events: ConvertedEvent[];
  /** Fokus deck ids attached during the lecture (in order). */
  deckIds: string[];
  /** Time of the first event (ms). */
  startedAt: number | null;
}

/**
 * Converts the event log of a Fokus session into lecture events.
 *
 * Seconds become milliseconds (strictly increasing, in log order); `page` becomes `slide`; check-in answers point
 * to the id of their prompt event. A lecture that was never stopped (Fokus
 * crashed or is still open) is closed at its last event, as Fokus does on start.
 *
 * @param lectureId Id of the RemCraft lecture.
 * @param raw Events of `events.jsonl`.
 */
export function convertSessionEvents(
  lectureId: string,
  raw: readonly Record<string, unknown>[],
): ConvertedSession {
  const ms = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const events: ConvertedEvent[] = [];
  const deckIds: string[] = [];
  let n = 0;
  const push = (ev: Omit<ConvertedEvent, 'id' | 'lectureId'>, id?: string): void => {
    events.push({ ...ev, id: id ?? `${lectureId}-${n}`, lectureId } as ConvertedEvent);
    n++;
  };
  let running = false;
  let lastT = 0;
  for (const e of raw) {
    const rawT = ms(e.t);
    if (rawT === undefined) continue;
    // Keep the order of the log: Fokus stores sub-millisecond times, so two
    // events (e.g. a check-in prompt and its answer) may share a millisecond.
    const t = Math.max(rawT, lastT + 1);
    lastT = t;
    switch (e.type) {
      case 'start':
        running = true;
        push({ type: 'start', t });
        break;
      case 'stop':
        running = false;
        push({ type: 'stop', t, ...(e.pause ? { pause: true } : {}) });
        break;
      case 'deck':
        if (typeof e.deck_id === 'string') deckIds.push(e.deck_id);
        break;
      case 'slide': {
        const slide = num(e.page);
        if (slide !== undefined) push({ type: 'slide', t, slide });
        break;
      }
      case 'focus':
        push({ type: 'focus', t, trackAway: Boolean(e.track_away) });
        break;
      case 'goal':
      case 'summary':
        push({ type: e.type, t, text: str(e.text) ?? '' });
        break;
      case 'away': {
        const start = ms(e.start);
        const end = ms(e.end);
        if (start !== undefined && end !== undefined)
          push({
            type: 'away',
            t,
            start,
            end,
            ...(num(e.slide) !== undefined ? { slide: num(e.slide) } : {}),
          });
        break;
      }
      case 'drift':
        push({ type: 'drift', t, ...(num(e.slide) !== undefined ? { slide: num(e.slide) } : {}) });
        break;
      case 'checkin_prompt':
        push(
          { type: 'checkin_prompt', t, text: str(e.prompt) ?? '' },
          `${lectureId}-c-${str(e.id) ?? n}`,
        );
        break;
      case 'checkin':
        push({
          type: 'checkin',
          t,
          ref: `${lectureId}-c-${str(e.ref) ?? ''}`,
          text: str(e.text) ?? '',
          ...(num(e.focus) !== undefined ? { focus: num(e.focus) } : {}),
          ...(e.skipped ? { skipped: true } : {}),
          ...(num(e.slide) !== undefined ? { slide: num(e.slide) } : {}),
        });
        break;
      case 'flag':
        if ((e.kind === 'important' || e.kind === 'unclear') && num(e.slide) !== undefined)
          push({ type: 'flag', t, slide: num(e.slide), flag: e.kind, on: Boolean(e.on) });
        break;
      case 'note':
        push({ type: 'note', t, ...(num(e.slide) !== undefined ? { slide: num(e.slide) } : {}) });
        break;
      default:
        break; // events of the former quasi-counter and unknown types are skipped
    }
  }
  if (running) push({ type: 'stop', t: lastT + 1 });
  const first = events.reduce<number | null>((m, e) => (m === null || e.t < m ? e.t : m), null);
  return { events, deckIds, startedAt: first };
}

/** Builds the `fokus-cards` documents (one per original import file) of a deck. */
export function cardDocs(data: FokusCardsJson): { file: string; doc: FokusDoc }[] {
  const imports = data.imports ?? [];
  const byImport = new Map<string, { cards: FokusCard[]; notes: FokusNote[] }>();
  const bucket = (id: string | undefined): { cards: FokusCard[]; notes: FokusNote[] } => {
    const key = id ?? '';
    if (!byImport.has(key)) byImport.set(key, { cards: [], notes: [] });
    return byImport.get(key)!;
  };
  for (const { import: imp, ...card } of data.cards ?? [])
    bucket(imp).cards.push(stripDerived(card) as FokusCard);
  for (const { import: imp, ...note } of data.notes ?? [])
    bucket(imp).notes.push(stripDerived(note) as FokusNote);
  return [...byImport.entries()]
    .filter(([, v]) => v.cards.length || v.notes.length)
    .map(([id, v]) => {
      const imp = imports.find((i) => i.id === id);
      return {
        file: imp?.file || 'fokus-import.fokus.json',
        doc: {
          format: 'fokus-cards',
          version: 1,
          ...(imp?.source ? { source: imp.source } : {}),
          cards: v.cards,
          notes: v.notes,
        } as FokusDoc,
      };
    });
}

/** Removes fields Fokus derived after import (slide mapping, progress). */
function stripDerived<T extends object>(item: T): T {
  const copy = { ...item } as Record<string, unknown>;
  for (const k of ['slides', 'mapped_by', 'progress', 'key']) delete copy[k];
  return copy as T;
}

/**
 * Locates the Fokus data root in a list of paths (e.g. the relative paths of a
 * selected folder: `data/decks/…` or `quasi_counter_and_regression/data/…`).
 *
 * @returns The prefix to strip (possibly empty), or `null` if no Fokus data was found.
 */
export function findDataRoot(paths: readonly string[]): string | null {
  for (const p of paths) {
    const m =
      /^(.*?)(?:^|\/)(decks\/[^/]+\/deck\.json|sessions\/[^/]+\/meta\.json|courses\/[^/]+\/course\.json)$/.exec(
        p,
      );
    if (m) return p.slice(0, p.length - m[2]!.length);
  }
  return null;
}
