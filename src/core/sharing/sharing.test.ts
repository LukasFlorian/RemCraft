import { generateCards } from '../cards/generate';
import { createMemoryGraph } from '../model/graph';
import { createRem } from '../model/factories';
import type { Rem, SlideAnnotations } from '../model/types';
import { rt, toPlainText } from '../richtext/ops';
import { SHARE_PRESETS, describeScope, selectScope } from './scope';
import { buildSnapshot, cloneSnapshot, validateSnapshot } from './snapshot';
import { expectedSpace } from './spaces';

/** A small course: folder → deck → slide → note + card (+ MC card with options), plus a document. */
function course(): Rem[] {
  const folder = createRem({ id: 'course', isFolder: true, text: rt('ML') });
  const deck = createRem({
    id: 'deck',
    parentId: 'course',
    isDocument: true,
    text: rt('VL 1'),
    deck: { src: 'file:pdf1', pdfName: 'vl1.pdf', pdfPages: 3, layout: 'auto', boxes: [] },
  });
  const slide = createRem({
    id: 's1',
    parentId: 'deck',
    text: rt('Folie 1'),
    slide: { index: 0, page: 0, box: 0 },
    slideText: 'Gradient',
  });
  const note = createRem({ id: 'n1', parentId: 's1', order: 'a0', text: rt('Prof sagt: wichtig') });
  const card = createRem({
    id: 'c1',
    parentId: 's1',
    order: 'a1',
    text: rt('Lernrate'),
    back: rt('Schrittweite'),
    direction: 'forward',
  });
  const mc = createRem({
    id: 'mc',
    parentId: 's1',
    order: 'a2',
    text: rt('Was ist richtig?'),
    answerMode: 'mc',
    direction: 'forward',
  });
  const o1 = createRem({ id: 'o1', parentId: 'mc', order: 'a0', text: rt('A'), mcCorrect: true });
  const o2 = createRem({ id: 'o2', parentId: 'mc', order: 'a1', text: rt('B'), mcCorrect: false });
  const doc = createRem({
    id: 'doc',
    parentId: 'course',
    order: 'a1',
    isDocument: true,
    text: rt('Zusammenfassung'),
  });
  const ref = createRem({
    id: 'r1',
    parentId: 'doc',
    text: [
      { type: 'ref', remId: 'c1' },
      { type: 'text', text: ' und ' },
      { type: 'ref', remId: 'outside' },
    ],
  });
  const outside = createRem({ id: 'outside', text: rt('Fremd') });
  return [folder, deck, slide, note, card, mc, o1, o2, doc, ref, outside];
}

const ids = (rems: Rem[]): string[] => rems.map((r) => r.id);

describe('share scopes', () => {
  const graph = createMemoryGraph(course());

  it('shares everything with the "all" preset', () => {
    const { rems, annotatedSlides } = selectScope(graph, 'course', SHARE_PRESETS.all.scope);
    expect(ids(rems)).toEqual(['course', 'deck', 's1', 'n1', 'c1', 'mc', 'o1', 'o2', 'doc', 'r1']);
    expect(rems[0]!.parentId).toBeNull();
    expect(annotatedSlides).toEqual(['s1']);
  });

  it('shares only cards (with MC options and their containers)', () => {
    const { rems } = selectScope(graph, 'course', SHARE_PRESETS.cards.scope);
    expect(ids(rems)).toEqual(['course', 'deck', 's1', 'c1', 'mc', 'o1', 'o2']);
    // Without slides the deck becomes a plain document.
    expect(rems.find((r) => r.id === 'deck')!.deck).toBeUndefined();
    expect(rems.find((r) => r.id === 's1')!.slide).toBeUndefined();
  });

  it('turns cards into plain notes when only notes are shared', () => {
    const { rems } = selectScope(graph, 'course', SHARE_PRESETS.notes.scope);
    expect(ids(rems)).toContain('n1');
    const card = rems.find((r) => r.id === 'c1')!;
    expect(generateCards(card, [])).toHaveLength(0);
    expect(toPlainText(card.back)).toBe('Schrittweite');
  });

  it('shares only slides', () => {
    const { rems } = selectScope(graph, 'deck', SHARE_PRESETS.slides.scope);
    expect(ids(rems)).toEqual(['deck', 's1']);
    expect(rems[0]!.deck?.src).toBe('file:pdf1');
  });

  it('describes custom scopes', () => {
    expect(describeScope(SHARE_PRESETS.cards.scope)).toBe('Flashcards only');
    expect(describeScope({ slides: false, notes: true, cards: true, annotations: false })).toBe(
      'Notes + Cards',
    );
  });
});

describe('snapshots', () => {
  const graph = createMemoryGraph(course());
  const ink: SlideAnnotations = {
    id: 's1',
    strokes: [{ tool: 'pen', color: '#f00', width: 2, p: [0, 0, 1, 1] }],
    boxes: [],
    marks: [],
    createdAt: 0,
    updatedAt: 0,
  };

  it('detaches references to Rems outside the share and lists files', () => {
    const snap = buildSnapshot(
      graph,
      'course',
      SHARE_PRESETS.all.scope,
      (id) => (id === 's1' ? ink : undefined),
      1,
    );
    const ref = snap.rems.find((r) => r.id === 'r1')!;
    expect(ref.text[0]).toEqual({ type: 'ref', remId: 'c1' });
    expect(ref.text[2]).toEqual({ type: 'text', text: 'Fremd' });
    expect(snap.files.map((f) => f.id)).toEqual(['pdf1']);
    expect(snap.annotations).toHaveLength(1);
    expect(validateSnapshot(JSON.parse(JSON.stringify(snap))).title).toBe('ML');
  });

  it('clones with fresh ids and rewritten references', () => {
    const snap = buildSnapshot(graph, 'course', SHARE_PRESETS.all.scope, () => ink, 1);
    let n = 0;
    const clone = cloneSnapshot(snap, 'mine', 'b0', () => `new${n++}`, 5);
    const byOld = (id: string): Rem => clone.rems.find((r) => r.id === clone.idMap.get(id))!;
    expect(byOld('course').parentId).toBe('mine');
    expect(byOld('s1').parentId).toBe(clone.idMap.get('deck'));
    expect(byOld('r1').text[0]).toEqual({ type: 'ref', remId: clone.idMap.get('c1') });
    expect(clone.annotations[0]!.id).toBe(clone.idMap.get('s1'));
    expect(clone.rems.every((r) => !r.id.startsWith('c') || r.id === 'c1')).toBe(true);
  });

  it('rejects other JSON', () => {
    expect(() => validateSnapshot({ format: 'x' })).toThrow();
  });
});

describe('space inheritance', () => {
  it('inherits the parent space unless the Rem is a space root', () => {
    const parent = createRem({ id: 'p', spaceId: 'S' });
    expect(expectedSpace(createRem({ parentId: 'p' }), parent)).toBe('S');
    expect(expectedSpace(createRem({ parentId: 'p', spaceRoot: 'T' }), parent)).toBe('T');
    expect(expectedSpace(createRem({ parentId: 'x', spaceId: 'S' }), undefined)).toBe('S');
    expect(expectedSpace(createRem({ parentId: null, spaceId: 'S' }), undefined)).toBeUndefined();
  });
});
