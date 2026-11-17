import { createMemoryGraph } from '../model/graph';
import { createRem } from '../model/factories';
import type { LectureEvent } from '../model/types';
import { rt } from '../richtext/ops';
import { detectTitles, slideLines } from './titles';
import {
  DEFAULT_LECTURE_SETTINGS,
  lectureKpis,
  mergeStats,
  slideStats,
  timeline,
} from './analytics';
import {
  anchorScore,
  cardKey,
  cardOutline,
  exportCardFile,
  resolveSlides,
  validateCardFile,
} from './cardFile';
import type { Mask } from './layout';
import {
  detectAuto,
  detectBoxes,
  detectGrid,
  detectImages,
  nonEmptyBoxes,
  planRelayout,
} from './layout';
import { openQuestions } from './notes';
import { reviewRows, todo } from './review';
import {
  buildLectureState,
  nextCheckinIn,
  nextCheckinPrompt,
  openCheckin,
  summarize,
  toActive,
} from './session';

const T0 = 1_700_000_000_000;
const S = 1000;
let n = 0;
/** Event helper. */
function ev(
  type: LectureEvent['type'],
  t: number,
  extra: Partial<LectureEvent> = {},
): LectureEvent {
  return { id: `e${++n}`, lectureId: 'L', type, t: T0 + t, createdAt: 0, updatedAt: 0, ...extra };
}

const events: LectureEvent[] = [
  ev('focus', 0, { trackAway: true }),
  ev('start', 0),
  ev('slide', 0, { slide: 0 }),
  ev('slide', 300 * S, { slide: 1 }),
  ev('away', 320 * S, { start: T0 + 320 * S, end: T0 + 380 * S, slide: 1 }),
  ev('stop', 400 * S, { pause: true }),
  ev('start', 600 * S),
  ev('drift', 650 * S, { slide: 1 }),
  ev('checkin_prompt', 700 * S, { text: 'Q?' }),
  ev('slide', 800 * S, { slide: 2 }),
  ev('stop', 900 * S),
];
const st = buildLectureState(events);
const NOW = T0 + 1000 * S;

describe('lecture session', () => {
  it('replays intervals, pauses and check-ins', () => {
    expect(st.intervals).toEqual([
      [T0, T0 + 400 * S],
      [T0 + 600 * S, T0 + 900 * S],
    ]);
    const s = summarize(st, NOW);
    expect(s.durationMs).toBe(700 * S);
    expect(s.awayMs).toBe(60 * S);
    expect(s.focusRatio).toBeCloseTo(1 - 60 / 700, 3);
    expect(openCheckin(st)?.prompt).toBe('Q?');
    expect(toActive(st, T0 + 500 * S, NOW)).toBeNaN();
    expect(toActive(st, T0 + 650 * S, NOW)).toBe(450 * S);
  });

  it('schedules check-ins after the interval and rotates prompts', () => {
    const running = buildLectureState([ev('start', 0)]);
    expect(nextCheckinIn(running, T0 + 60 * S, 10)).toBe(540 * S);
    expect(nextCheckinIn(running, T0, 0)).toBeNull();
    expect(nextCheckinPrompt(running)).toMatch(/Kernpunkt/);
  });
});

describe('lecture analytics', () => {
  it('computes time per slide, KPIs and the timeline', () => {
    const stats = slideStats(st, 3, NOW);
    expect(stats.map((s) => s.dwellMs / S)).toEqual([300, 300, 100]); // the pause does not count
    expect(stats[1]!.awayMs).toBe(60 * S);
    expect(stats[1]!.drifts).toBe(1);
    const k = lectureKpis(st, DEFAULT_LECTURE_SETTINGS, 3, NOW);
    expect(k).toMatchObject({ slidesSeen: 3, drifts: 1, awayCount: 1, longestAwayMs: 60 * S });
    const tl = timeline(st, NOW);
    expect(tl.minutes).toBe(12);
    expect(tl.awaySeconds[5]).toBe(40);
    expect(tl.awaySeconds[6]).toBe(20);
    expect(tl.slide[0]).toBe(0);
    expect(mergeStats([stats, stats])[1]!.dwellMs).toBe(600 * S);
  });

  it('builds review rows with reasons', () => {
    const stats = slideStats(st, 3, NOW);
    const rows = reviewRows(
      stats,
      (i) => ({
        flags: i === 2 ? ['unclear'] : [],
        openQuestions: i === 0 ? ['warum?'] : [],
        hasNote: i !== 1,
        forgottenCards: 0,
      }),
      DEFAULT_LECTURE_SETTINGS,
    );
    const keys = rows.map((r) => r.reasons.map((x) => x.key));
    expect(keys[1]).toEqual(['missed', 'drift']);
    expect(todo(rows)[0]!.slide).toBe(1);
    expect(openQuestions('? offen\n? zu → ja\nnormal')).toEqual(['offen']);
  });
});

describe('fokus cards', () => {
  const slides = [
    { page: 0, text: 'Einführung Big Data' },
    { page: 1, text: 'Die 5 Vs: Volume Velocity Variety' },
    { page: 1, text: 'Hadoop Architektur und HDFS' },
  ];
  it('scores anchors and resolves slides by page and anchor', () => {
    expect(anchorScore('Hadoop Architektur', 'Die Hadoop Architektur')).toBe(1);
    expect(resolveSlides({ pages: [2], anchor: 'Hadoop Architektur' }, slides)).toEqual({
      slides: [2],
      by: 'page+anchor',
    });
    expect(resolveSlides({ pages: [9], anchor: 'Die 5 Vs' }, slides)).toEqual({
      slides: [1],
      by: 'anchor',
    });
    expect(resolveSlides({ pages: [1] }, slides)).toEqual({ slides: [0], by: 'page' });
    expect(resolveSlides({ anchor: 'gibt es nicht' }, slides)).toEqual({ slides: [], by: 'none' });
    // A verbatim match beats a slide that merely contains the same words.
    const tie = [
      { page: 0, text: 'Lernrate bestimmt die Schrittweite' },
      { page: 0, text: 'Die Lernrate' },
    ];
    expect(resolveSlides({ pages: [1], anchor: 'Die Lernrate' }, tie)).toEqual({
      slides: [1],
      by: 'page+anchor',
    });
  });
  it('validates and builds outlines', () => {
    expect(validateCardFile({ format: 'x' })[0]).toMatch(/Keine RemCraft-Kartendatei/);
    expect(
      validateCardFile({ format: 'fokus-cards', version: 1, cards: [{ front: '' }] })[0],
    ).toMatch(/front/);
    expect(cardKey({ front: 'a', back: 'b' })).toHaveLength(12);
    expect(cardOutline({ front: 'Q', remnote: 'Q >> A' })[0]!.text).toBe('Q >> A');
    const mc = cardOutline({
      front: 'Which?',
      type: 'mc',
      options: [
        { text: 'no', correct: false },
        { text: 'yes', correct: true },
      ],
    });
    expect(mc[0]!.text).toBe('Which? {CORRECT: A} >>A)');
    expect(mc[0]!.children.map((c) => c.text)).toEqual(['yes', 'no']);
  });
  it('exports a deck', () => {
    const deck = createRem({
      id: 'd',
      text: rt('VL 1'),
      isDocument: true,
      deck: {
        src: 'file:x',
        pdfName: 'VL01.pdf',
        pdfPages: 2,
        layout: 'auto',
        boxes: [[0, 0, 1, 1]],
      },
    });
    const s0 = createRem({
      id: 's0',
      parentId: 'd',
      text: rt('Folie 1'),
      slide: { index: 0, page: 0, box: 0 },
      slideText: 'Einführung Big Data',
    });
    const c = createRem({
      id: 'c',
      parentId: 's0',
      text: rt('Was ist Big Data?'),
      back: rt('Viele Daten'),
      direction: 'forward',
    });
    const { doc, remnote } = exportCardFile(createMemoryGraph([deck, s0, c]), 'd', 'VL01');
    expect(doc.source).toMatchObject({ pdf: 'VL01.pdf', pdf_pages: 2 });
    expect(doc.cards[0]).toMatchObject({
      front: 'Was ist Big Data?',
      back: 'Viele Daten',
      pages: [1],
      type: 'basic',
      section: 'Folie 1',
    });
    expect(remnote).toContain('Was ist Big Data? >> Viele Daten');
  });
});

describe('layout detection', () => {
  /** Mask with filled rectangles (pixel coordinates). */
  function mask(w: number, h: number, rects: number[][]): Mask {
    const data = new Uint8Array(w * h);
    for (const [x0, y0, x1, y1] of rects)
      for (let y = y0!; y < y1!; y++) for (let x = x0!; x < x1!; x++) data[y * w + x] = 1;
    return { w, h, data };
  }
  it('finds two stacked slides on a portrait handout', () => {
    const m = mask(100, 141, [
      [10, 10, 90, 65],
      [10, 75, 90, 130],
      [40, 138, 60, 140],
    ]);
    const boxes = detectAuto(m);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]![1]).toBeLessThan(0.1);
    expect(boxes[1]![1]).toBeGreaterThan(0.5);
    expect(nonEmptyBoxes(m, boxes)).toEqual([0, 1]);
    expect(nonEmptyBoxes(mask(100, 141, [[10, 10, 90, 65]]), boxes)).toEqual([0]);
  });
  it('keeps landscape slides whole and supports explicit grids', () => {
    expect(detectAuto(mask(160, 90, [[5, 5, 150, 80]]))).toEqual([[0, 0, 1, 1]]);
    expect(detectGrid(mask(100, 100, []), 2, 2)).toHaveLength(4);
    expect(
      detectBoxes({ sampleMasks: [mask(100, 141, [])], sampleImages: [[]], portrait: true }, '3x1'),
    ).toHaveLength(3);
  });
  it('uses consistent embedded images', () => {
    const page = [
      [0.1, 0.05, 0.9, 0.45],
      [0.1, 0.52, 0.9, 0.92],
    ];
    expect(detectImages([page, page, page], true)).toEqual(page);
    expect(detectImages([[[0.1, 0.1, 0.9, 0.9]]], false)).toBeNull();
  });
});

describe('planRelayout', () => {
  const top = [0, 0, 1, 0.5];
  const bottom = [0, 0.5, 1, 1];
  const full = [0, 0, 1, 1];

  it('keeps content on the same place when splitting pages and back', () => {
    // 1 slide per page (2 pages) -> 2 per page (4 slides): content of page 2 lands on slide 3.
    const old = [
      { page: 0, box: full },
      { page: 1, box: full },
    ];
    const next = [
      { page: 0, box: top },
      { page: 0, box: bottom },
      { page: 1, box: top },
      { page: 1, box: bottom },
    ];
    const plan = planRelayout(old, next, () => true);
    expect(plan.reuse).toEqual([0, null, 1, null]);
    expect(plan.moveTo.size).toBe(0);
    // ...and back: the bottom halves' content moves into the full page slides.
    const back = planRelayout(next, old, (i) => i === 1 || i === 2);
    expect(back.reuse).toEqual([0, 2]);
    expect(back.moveTo.get(1)).toBe(0);
  });

  it('reuses empty slides and never drops content', () => {
    const old = [
      { page: 0, box: top },
      { page: 0, box: bottom },
      { page: 5, box: full },
    ];
    const plan = planRelayout(old, [{ page: 0, box: full }], (i) => i === 2);
    expect(plan.reuse).toEqual([0]);
    expect(plan.moveTo.get(2)).toBe(0);
    expect(plan.moveTo.has(1)).toBe(false); // empty: simply removed
  });
});

describe('card files from RemNote-style generators', () => {
  it('turns the RemNote arrow of numeric cards into a card separator', () => {
    const [node] = cardOutline({
      type: 'numeric',
      front: 'Q',
      remnote: 'Wie viel? (Numeric answer)→Korrekte Antwort: 3 Rechenweg: 1+2',
    });
    expect(node!.text).toContain('>>');
  });
});

describe('detectTitles', () => {
  const footer = (n: number) => [
    { text: 'Document Stores', y: 0.95, size: 0.02 },
    { text: String(n), y: 0.95, size: 0.02 },
    { text: 'NoSQL', y: 0.95, size: 0.02 },
  ];
  it('ignores recurring footers and picks the largest line at the top', () => {
    const slides = [
      [
        ...footer(12),
        { text: '… Fields speichern Werte als Key-Value-Paare', y: 0.08, size: 0.045 },
        { text: 'BSON-Beispiel', y: 0.2, size: 0.025 },
      ],
      [
        ...footer(13),
        {
          text: 'Einbetten: Datenlokalität und Atomarität für zusammengehörige',
          y: 0.08,
          size: 0.045,
        },
        { text: 'Daten', y: 0.13, size: 0.045 },
        { text: 'Einbettung von Dokumenten ineinander.', y: 0.18, size: 0.025 },
      ],
      [...footer(14), { text: 'Referenzen', y: 0.08, size: 0.045 }],
      [...footer(15), { text: 'Schema-Design', y: 0.08, size: 0.045 }],
    ];
    expect(detectTitles(slides)).toEqual([
      '… Fields speichern Werte als Key-Value-Paare',
      'Einbetten: Datenlokalität und Atomarität für zusammengehörige Daten',
      'Referenzen',
      'Schema-Design',
    ]);
  });

  it('groups positioned runs into lines inside a slide box', () => {
    const runs = [
      { str: 'Inhalt', x0: 0.1, y0: 0.55, x1: 0.3, y1: 0.6 },
      { str: 'der Vorlesung', x0: 0.31, y0: 0.552, x1: 0.6, y1: 0.6 },
      { str: 'oben', x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.12 },
    ];
    const lines = slideLines(runs, [0, 0.5, 1, 1]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('Inhalt der Vorlesung');
  });
});
