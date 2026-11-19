/**
 * Where search terms occur in a text (for highlighting results). Matching
 * folds case and accents like the search itself, while the returned ranges
 * refer to the original text.
 */
import { fold } from './search';

/** A match: start (inclusive) and end (exclusive) in the original text. */
export type MatchRange = [number, number];

/**
 * Finds every occurrence of the terms.
 *
 * Args:
 *   text: Original text.
 *   terms: Search terms (folded or not).
 *
 * Returns:
 *   Sorted, non-overlapping ranges in `text`.
 */
export function findMatches(text: string, terms: readonly string[]): MatchRange[] {
  const wanted = terms.map(fold).filter(Boolean);
  if (wanted.length === 0 || !text) return [];
  // Folded text plus, for each folded character, the original index.
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]!);
    for (const ch of f) {
      folded += ch;
      origin.push(i);
    }
  }
  const raw: MatchRange[] = [];
  for (const term of wanted) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      raw.push([origin[at]!, origin[at + term.length - 1]! + 1]);
    }
  }
  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: MatchRange[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** A piece of a snippet, marked when it matched. */
export interface SnippetPart {
  text: string;
  match: boolean;
}

/**
 * A short excerpt around the first match (for long texts whose match would
 * be cut off).
 *
 * Args:
 *   text: Original text.
 *   ranges: Matches from `findMatches`.
 *   radius: Characters of context before the first match.
 *   length: Maximum length of the excerpt.
 */
export function snippet(
  text: string,
  ranges: readonly MatchRange[],
  radius = 30,
  length = 140,
): SnippetPart[] {
  if (ranges.length === 0) return [{ text: text.slice(0, length), match: false }];
  let start = Math.max(0, ranges[0]![0] - radius);
  // Start at a word boundary.
  const space = text.lastIndexOf(' ', start);
  if (start > 0 && space !== -1 && ranges[0]![0] - space <= radius + 15) start = space + 1;
  const end = Math.min(text.length, start + length);
  const parts: SnippetPart[] = [];
  if (start > 0) parts.push({ text: '…', match: false });
  let pos = start;
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue;
    if (a > pos) parts.push({ text: text.slice(pos, a), match: false });
    parts.push({ text: text.slice(Math.max(a, pos), Math.min(b, end)), match: true });
    pos = Math.min(b, end);
  }
  if (pos < end) parts.push({ text: text.slice(pos, end), match: false });
  if (end < text.length) parts.push({ text: '…', match: false });
  return parts;
}
