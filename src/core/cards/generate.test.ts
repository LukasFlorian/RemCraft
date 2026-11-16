import { createRem } from '../model/factories';
import type { Rem } from '../model/types';
import { rt } from '../richtext/ops';
import { cardTypeLabel, effectiveAnswerMode, generateCards, makeCardId, parseCardId } from './generate';

const base = (p: Partial<Rem>): Rem => createRem({ id: 'r', text: rt('Q'), ...p });

describe('generateCards', () => {
  it('creates no cards for plain Rems', () => {
    expect(generateCards(base({}), [])).toEqual([]);
  });

  it('creates forward/backward cards', () => {
    const fwd = generateCards(base({ direction: 'forward', back: rt('A') }), []);
    expect(fwd.map((c) => c.id)).toEqual(['r/f']);
    const both = generateCards(base({ direction: 'both', back: rt('A'), kind: 'concept' }), []);
    expect(both.map((c) => c.kind)).toEqual(['forward', 'backward']);
  });

  it('requires an answer', () => {
    expect(generateCards(base({ direction: 'forward', back: [] }), [])).toEqual([]);
  });

  it('treats an empty back with children as a multi-line card', () => {
    const child = createRem({ id: 'c', parentId: 'r', text: rt('x') });
    const rem = base({ direction: 'forward', back: [] });
    expect(effectiveAnswerMode(rem, [child])).toBe('set');
    expect(generateCards(rem, [child]).map((c) => c.id)).toEqual(['r/f']);
  });

  it('creates MC cards only forward and needs two options', () => {
    const a = createRem({ id: 'a', text: rt('a') });
    const b = createRem({ id: 'b', text: rt('b') });
    const rem = base({ direction: 'both', answerMode: 'mc' });
    expect(generateCards(rem, [a])).toEqual([]);
    expect(generateCards(rem, [a, b]).map((c) => c.kind)).toEqual(['forward']);
  });

  it('creates one card per cloze and per occlusion', () => {
    const rem = base({
      text: [
        { type: 'text', text: 'x', marks: { cloze: 'c1' } },
        { type: 'text', text: 'y', marks: { cloze: 'c2' } },
        { type: 'text', text: 'z', marks: { cloze: 'c1' } },
      ],
      image: { src: 'x.png', occlusions: [{ id: 'o1', x: 0, y: 0, w: 0.1, h: 0.1 }] },
    });
    expect(generateCards(rem, []).map((c) => c.id)).toEqual(['r/c:c1', 'r/c:c2', 'r/o:o1']);
  });

  it('disabled and extra-detail Rems create no cards', () => {
    expect(generateCards(base({ direction: 'disabled', back: rt('A') }), [])).toEqual([]);
    expect(generateCards(base({ direction: 'forward', back: rt('A'), extraCardDetail: true }), [])).toEqual([]);
  });

  it('labels card types', () => {
    const rem = base({ direction: 'forward', back: rt('A'), kind: 'concept' });
    expect(cardTypeLabel(rem, generateCards(rem, [])[0]!, [])).toBe('Concept');
  });
});

describe('card ids', () => {
  it('round-trips', () => {
    expect(parseCardId(makeCardId('abc', 'c:xyz'))).toEqual({ remId: 'abc', slot: 'c:xyz' });
  });
});
