import { createMemoryGraph } from '../model/graph';
import { createRem } from '../model/factories';
import { rt } from '../richtext/ops';
import { buildCardView, mcOptions } from './content';

describe('buildCardView', () => {
  const doc = createRem({ id: 'doc', text: rt('Doc'), isDocument: true, typeInAnswer: true });
  const q = createRem({
    id: 'q',
    parentId: 'doc',
    text: rt('Front'),
    back: rt('Back'),
    direction: 'both',
  });
  const extra = createRem({ id: 'x', parentId: 'q', text: rt('detail'), extraCardDetail: true });
  const mc = createRem({
    id: 'mc',
    parentId: 'doc',
    order: 'a1',
    text: rt('Pick'),
    direction: 'forward',
    answerMode: 'mc',
  });
  const o1 = createRem({ id: 'o1', parentId: 'mc', order: 'a0', text: rt('right') });
  const o2 = createRem({ id: 'o2', parentId: 'mc', order: 'a1', text: rt('wrong') });
  const cl = createRem({
    id: 'cl',
    parentId: 'doc',
    order: 'a2',
    text: [
      { type: 'text', text: 'The ' },
      { type: 'text', text: 'TLB', marks: { cloze: 'k' } },
    ],
    clozeHints: { k: 'cache' },
  });
  const graph = createMemoryGraph([doc, q, extra, mc, o1, o2, cl]);

  it('builds forward and backward basic views with inherited context', () => {
    const fwd = buildCardView('q/f', graph);
    expect(fwd).toMatchObject({
      type: 'basic',
      reversed: false,
      context: ['doc'],
      extra: ['x'],
      typeIn: true,
      expectedAnswer: 'Back',
    });
    const bwd = buildCardView('q/b', graph);
    expect(bwd).toMatchObject({ type: 'basic', reversed: true, expectedAnswer: 'Front' });
  });

  it('builds MC views with first option correct by default', () => {
    expect(buildCardView('mc/f', graph)).toMatchObject({
      type: 'mc',
      options: [
        { remId: 'o1', correct: true },
        { remId: 'o2', correct: false },
      ],
    });
  });

  it('respects explicit correct flags', () => {
    const a = createRem({ id: 'a', mcCorrect: false });
    const b = createRem({ id: 'b', mcCorrect: true });
    const c = createRem({ id: 'c', mcCorrect: true });
    expect(mcOptions([a, b, c]).map((o) => o.correct)).toEqual([false, true, true]);
  });

  it('builds cloze views with hint', () => {
    expect(buildCardView('cl/c:k', graph)).toMatchObject({
      type: 'cloze',
      clozeId: 'k',
      hint: 'cache',
      expectedAnswer: 'TLB',
    });
  });

  it('returns undefined for vanished cards', () => {
    expect(buildCardView('cl/c:gone', graph)).toBeUndefined();
    expect(buildCardView('nope/f', graph)).toBeUndefined();
  });
});
