import { createRem } from '../model/factories';
import { createMemoryGraph } from '../model/graph';
import type { RichText } from '../model/types';
import { rt, toPlainText } from '../richtext/ops';
import { buildMatcher, planReplace, remsInScope, replaceInRichText } from './findReplace';

describe('find and replace', () => {
  it('replaces literally, case-insensitive by default, keeping formatting', () => {
    const value: RichText = [
      { type: 'text', text: 'Big Data und ' },
      { type: 'text', text: 'big data', marks: { bold: true } },
    ];
    const m = buildMatcher({ query: 'big data', replacement: 'Massendaten' }) as RegExp;
    const { value: out, count } = replaceInRichText(value, m, { replacement: 'Massendaten' });
    expect(count).toBe(2);
    expect(out).toEqual([
      { type: 'text', text: 'Massendaten und ' },
      { type: 'text', text: 'Massendaten', marks: { bold: true } },
    ]);
  });

  it('supports whole words, case sensitivity and regular expressions', () => {
    const rem = createRem({ id: 'a', text: rt('Hash, Hashing, hash'), back: rt('Hash-Tabelle') });
    const words = planReplace([rem], {
      query: 'Hash',
      replacement: 'Streuwert',
      wholeWord: true,
      caseSensitive: true,
    });
    expect(Array.isArray(words) && words.map((c) => c.afterText)).toEqual([
      'Streuwert, Hashing, hash',
      'Streuwert-Tabelle',
    ]);
    const re = planReplace([rem], { query: '(\\w+)ing', replacement: '$1en', regex: true });
    expect(Array.isArray(re) && re[0]!.afterText).toBe('Hash, Hashen, hash');
  });

  it('treats $ literally without regex and reports invalid expressions', () => {
    const rem = createRem({ id: 'a', text: rt('Preis: X') });
    const plan = planReplace([rem], { query: 'X', replacement: '5 $1' });
    expect(Array.isArray(plan) && toPlainText(plan[0]!.after)).toBe('Preis: 5 $1');
    expect(planReplace([rem], { query: '(', replacement: '', regex: true })).toMatch(/Ungültig/);
  });

  it('limits the scope to a subtree', () => {
    const doc = createRem({ id: 'd', isDocument: true, text: rt('Doc') });
    const inDoc = createRem({ id: 'x', parentId: 'd', text: rt('x') });
    const other = createRem({ id: 'o', order: 'b', text: rt('x') });
    const graph = createMemoryGraph([doc, inDoc, other]);
    expect(remsInScope(graph, 'd', []).map((r) => r.id)).toEqual(['d', 'x']);
  });
});
