import { createRem } from '@core/model/factories';
import type { RichText } from '@core/model/types';
import { docToPatch, patchEquals, remToDoc } from './convert';

describe('editor conversion', () => {
  it('round-trips rich text with separator and back', () => {
    const text: RichText = [
      { type: 'text', text: 'What is ' },
      { type: 'text', text: 'x', marks: { bold: true, cloze: 'c1' } },
      { type: 'ref', remId: 'r1' },
      { type: 'latex', source: 'a^2' },
    ];
    const rem = createRem({
      text,
      back: [{ type: 'text', text: 'answer', marks: { highlight: 'red' } }],
      kind: 'concept',
      direction: 'both',
    });
    const patch = docToPatch(remToDoc(rem));
    expect(patch).toEqual({
      text,
      back: rem.back,
      kind: 'concept',
      direction: 'both',
      answerMode: 'inline',
    });
    expect(patchEquals(patch, rem)).toBe(true);
  });

  it('handles plain Rems and multi-line separators', () => {
    expect(
      docToPatch(remToDoc(createRem({ text: [{ type: 'text', text: 'plain' }] }))),
    ).toMatchObject({ back: null, direction: 'none' });
    const mc = createRem({
      text: [{ type: 'text', text: 'Q' }],
      back: [],
      direction: 'forward',
      answerMode: 'mc',
    });
    expect(docToPatch(remToDoc(mc))).toMatchObject({
      back: [],
      direction: 'forward',
      answerMode: 'mc',
    });
  });
});
