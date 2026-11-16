import type { RichText } from '../model/types';
import { parseInline, serializeInline } from './markup';
import { clozeIds } from './ops';

/** Deterministic cloze ids for snapshot-like assertions. */
function counter(): () => string {
  let n = 0;
  return () => `z${++n}`;
}

describe('parseInline', () => {
  it('parses formatting', () => {
    const { text } = parseInline('a **b** *c* <u>d</u> ~~e~~ `f`');
    expect(text).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: { bold: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: { italic: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: { underline: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'e', marks: { strike: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'f', marks: { code: true } },
    ]);
  });

  it('parses LaTeX but not prices', () => {
    expect(parseInline('$x^2$').text).toEqual([{ type: 'latex', source: 'x^2' }]);
    expect(parseInline('costs $5 and $10').text).toEqual([
      { type: 'text', text: 'costs $5 and $10' },
    ]);
  });

  it('parses clozes with hints', () => {
    const { text, clozeHints } = parseInline('The {{TLB}}{({small cache})} caches {{PTEs}}', {
      newClozeId: counter(),
    });
    expect(clozeIds(text)).toEqual(['z1', 'z2']);
    expect(clozeHints).toEqual({ z1: 'small cache' });
  });

  it('merges Anki-style cloze groups', () => {
    const { text, clozeHints } = parseInline('{{c1::a}} and {{c1::b::hint}} and {{c2::c}}', {
      newClozeId: counter(),
    });
    expect(clozeIds(text)).toEqual(['z1', 'z2']);
    expect(clozeHints).toEqual({ z1: 'hint' });
  });

  it('resolves references and extracts tags', () => {
    const { text, tags } = parseInline('see [[Foo]] #[[Extra Card Detail]]', {
      resolveRef: (n) => (n === 'Foo' ? 'id-foo' : undefined),
    });
    expect(text).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'ref', remId: 'id-foo' },
    ]);
    expect(tags).toEqual(['Extra Card Detail']);
  });

  it('keeps unresolved references literally', () => {
    expect(parseInline('[[Nope]]').text).toEqual([{ type: 'text', text: '[[Nope]]' }]);
  });

  it('parses links and highlights', () => {
    expect(parseInline('[site](https://x.org) <mark class="red">hot</mark>').text).toEqual([
      { type: 'text', text: 'site', marks: { link: 'https://x.org' } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'hot', marks: { highlight: 'red' } },
    ]);
  });

  it('treats lone stars as text', () => {
    expect(parseInline('a * b').text).toEqual([{ type: 'text', text: 'a * b' }]);
  });
});

describe('serializeInline', () => {
  const roundTrip = (value: RichText): RichText =>
    parseInline(serializeInline(value, { refName: (id) => id }), {
      resolveRef: (n) => n,
      newClozeId: counter(),
    }).text;

  it('round-trips formatting, latex and references', () => {
    const value: RichText = [
      { type: 'text', text: 'x ' },
      { type: 'text', text: 'bold', marks: { bold: true, italic: true } },
      { type: 'latex', source: 'a+b' },
      { type: 'ref', remId: 'R1' },
      { type: 'text', text: ' a >> b * c' },
    ];
    expect(roundTrip(value)).toEqual(value);
  });

  it('round-trips merged clozes with hints', () => {
    const value: RichText = [
      { type: 'text', text: 'A', marks: { cloze: 'z1' } },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'B', marks: { cloze: 'z1' } },
    ];
    const s = serializeInline(value, { clozeHints: { z1: 'h' } });
    expect(s).toBe('{{c1::A}} and {{c1::B}}{({h})}');
    const parsed = parseInline(s, { newClozeId: counter() });
    expect(parsed.text).toEqual(value);
    expect(parsed.clozeHints).toEqual({ z1: 'h' });
  });

  it('escapes delimiters so they do not create cards', () => {
    expect(serializeInline([{ type: 'text', text: 'a :: b' }])).toBe('a \\:\\: b');
  });
});
