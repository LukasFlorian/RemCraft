import { describe, expect, it } from 'vitest';
import { findMatches, snippet } from './highlight';

describe('search highlighting', () => {
  it('finds terms ignoring case and accents, in original positions', () => {
    const text = 'Ärger über Datenbanken: DATENbank-Systeme';
    expect(findMatches(text, ['datenbank'])).toEqual([
      [11, 20],
      [24, 33],
    ]);
    expect(findMatches(text, ['arger'])).toEqual([[0, 5]]);
    expect(findMatches(text, ['uber', 'über'])).toEqual([[6, 10]]);
  });

  it('merges overlapping terms', () => {
    expect(findMatches('Bloom-Filter', ['bloom', 'oom-f'])).toEqual([[0, 7]]);
  });

  it('builds a snippet around the first match', () => {
    const text = `${'Lorem ipsum dolor sit amet '.repeat(5)}Bloom-Filter erklärt`;
    const parts = snippet(text, findMatches(text, ['bloom']));
    expect(parts[0]).toEqual({ text: '…', match: false });
    expect(parts.find((p) => p.match)?.text).toBe('Bloom');
  });
});
