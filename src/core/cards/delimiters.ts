/**
 * Flashcard delimiter syntax (RemNote-compatible).
 *
 * A Rem becomes a flashcard when its text contains a delimiter such as `>>`
 * or `::`. The delimiter decides the card's kind, direction and answer mode.
 * The same table drives the importer, the exporter and the editor's input
 * rules, so all three always agree. See docs/flashcard-syntax.md.
 */
import type { AnswerMode, CardDirection, RemKind } from '../model/types';
import { protectedRegionEnd } from '../richtext/scan';

/** Semantics of one delimiter token. */
export interface DelimiterSpec {
  /** The literal token, e.g. `>>`. */
  token: string;
  kind: RemKind;
  direction: CardDirection;
  answerMode: AnswerMode;
  /**
   * Multi-line delimiters (`>>>`, `>>1.`, `>>A)`, …) only count at the end of
   * the line; elsewhere a shorter delimiter is matched instead.
   */
  endOnly: boolean;
  /** Human-readable description (used by the slash menu and docs). */
  label: string;
}

/** Shorthand constructor for the delimiter table. */
function d(
  token: string,
  kind: RemKind,
  direction: CardDirection,
  answerMode: AnswerMode,
  label: string,
): DelimiterSpec {
  return { token, kind, direction, answerMode, endOnly: answerMode !== 'inline', label };
}

/**
 * All supported delimiters. The first entry for a given
 * kind/direction/answerMode combination is the canonical one used for export.
 */
export const DELIMITERS: readonly DelimiterSpec[] = Object.freeze([
  // Basic cards
  d('>>', 'plain', 'forward', 'inline', 'Basic card (forward)'),
  d('==', 'plain', 'forward', 'inline', 'Basic card (forward)'),
  d('<<', 'plain', 'backward', 'inline', 'Basic card (backward)'),
  d('<>', 'plain', 'both', 'inline', 'Basic card (both directions)'),
  d('><', 'plain', 'both', 'inline', 'Basic card (both directions)'),
  d('>-', 'plain', 'disabled', 'inline', 'Disabled card'),
  d('=-', 'plain', 'disabled', 'inline', 'Disabled card'),
  // Multi-line (set) cards
  d('>>>', 'plain', 'forward', 'set', 'Multi-line card'),
  d('<<<', 'plain', 'backward', 'set', 'Multi-line card (backward)'),
  d('<><', 'plain', 'both', 'set', 'Multi-line card (both directions)'),
  d('>->', 'plain', 'disabled', 'set', 'Disabled multi-line card'),
  // List-answer cards
  d('>>1.', 'plain', 'forward', 'list', 'List-answer card'),
  d('<<1.', 'plain', 'backward', 'list', 'List-answer card (backward)'),
  d('<>1.', 'plain', 'both', 'list', 'List-answer card (both directions)'),
  d('>-1.', 'plain', 'disabled', 'list', 'Disabled list-answer card'),
  // Multiple choice
  d('>>A)', 'plain', 'forward', 'mc', 'Multiple-choice card'),
  d('==A)', 'plain', 'forward', 'mc', 'Multiple-choice card'),
  d('>-A)', 'plain', 'disabled', 'mc', 'Disabled multiple-choice card'),
  // Concepts (two-way by default)
  d('::', 'concept', 'both', 'inline', 'Concept (both directions)'),
  d(':>', 'concept', 'forward', 'inline', 'Concept (forward)'),
  d(':<', 'concept', 'backward', 'inline', 'Concept (backward)'),
  d(':-', 'concept', 'disabled', 'inline', 'Concept (disabled)'),
  d(':::', 'concept', 'both', 'set', 'Multi-line concept'),
  d('::1.', 'concept', 'both', 'list', 'List-answer concept'),
  // Descriptors (forward by default)
  d(';;', 'descriptor', 'forward', 'inline', 'Descriptor (forward)'),
  d(';<', 'descriptor', 'backward', 'inline', 'Descriptor (backward)'),
  d(';;<', 'descriptor', 'both', 'inline', 'Descriptor (both directions)'),
  d(';<>', 'descriptor', 'both', 'inline', 'Descriptor (both directions)'),
  d(';-', 'descriptor', 'disabled', 'inline', 'Descriptor (disabled)'),
  d(';;;', 'descriptor', 'forward', 'set', 'Multi-line descriptor'),
  d(';;1.', 'descriptor', 'forward', 'list', 'List-answer descriptor'),
]);

/** Delimiters sorted by token length (longest first) for greedy matching. */
const BY_LENGTH: readonly DelimiterSpec[] = [...DELIMITERS].sort((a, b) => b.token.length - a.token.length);

/** Characters any delimiter starts with (fast pre-check). */
const START_CHARS = new Set(DELIMITERS.map((s) => s.token[0]));

/** Result of {@link findSeparator}. */
export interface SeparatorMatch {
  /** Index of the first character of the token. */
  index: number;
  spec: DelimiterSpec;
}

/**
 * Finds the card separator of a line written in RemCraft/RemNote markup.
 *
 * Rules: the first unescaped delimiter outside protected regions wins; at a
 * given position the longest token wins; multi-line tokens only match at the
 * end of the line. Delimiters made of `:-` / `;-` must be followed by
 * whitespace or the end of the line so emoticons like ":-)" stay text.
 *
 * @param line Source text (one line, may contain markup).
 * @returns The match or `null` when the line contains no delimiter.
 */
export function findSeparator(line: string): SeparatorMatch | null {
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '\\') {
      i += 2; // escaped character
      continue;
    }
    // Skip protected regions (code, LaTeX, clozes, references, link targets).
    const protectedEnd = protectedRegionEnd(line, i);
    if (protectedEnd !== -1) {
      i = protectedEnd;
      continue;
    }
    if (START_CHARS.has(ch)) {
      const rest = line.slice(i);
      for (const spec of BY_LENGTH) {
        if (!rest.startsWith(spec.token)) continue;
        const after = rest.slice(spec.token.length);
        if (spec.endOnly && after.trim() !== '') continue;
        if (spec.token.endsWith('-') && spec.token.length === 2 && after !== '' && !/^\s/.test(after)) continue;
        return { index: i, spec };
      }
    }
    i++;
  }
  return null;
}

/** A line split into front and back around its separator. */
export interface SplitLine {
  front: string;
  /** Text after the separator (`null` when there is no separator). */
  back: string | null;
  spec: DelimiterSpec | null;
}

/**
 * Splits a line at its card separator and trims both sides.
 *
 * @param line Source text.
 */
export function splitCardLine(line: string): SplitLine {
  const match = findSeparator(line);
  if (!match) return { front: line, back: null, spec: null };
  return {
    front: line.slice(0, match.index).trim(),
    back: line.slice(match.index + match.spec.token.length).trim(),
    spec: match.spec,
  };
}

/**
 * Returns the canonical delimiter for a combination of card settings, or
 * `null` when the combination has no delimiter (plain Rem).
 */
export function canonicalDelimiter(kind: RemKind, direction: CardDirection, answerMode: AnswerMode): string | null {
  if (direction === 'none') return null;
  const exact = DELIMITERS.find((s) => s.kind === kind && s.direction === direction && s.answerMode === answerMode);
  if (exact) return exact.token;
  // Fall back to the inline delimiter of the same kind/direction.
  const inline = DELIMITERS.find((s) => s.kind === kind && s.direction === direction && s.answerMode === 'inline');
  return inline?.token ?? '>>';
}

/** Regex matching every delimiter token (used to escape literal text on export). */
export const DELIMITER_PATTERN = new RegExp(
  BY_LENGTH.map((s) => s.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);

/** Arrow glyph shown in the editor for a separator. */
export function separatorGlyph(kind: RemKind, direction: CardDirection): string {
  if (kind === 'concept' && direction === 'both') return '↔';
  if (kind === 'descriptor' && direction === 'forward') return '→';
  switch (direction) {
    case 'forward':
      return '→';
    case 'backward':
      return '←';
    case 'both':
      return '↔';
    case 'disabled':
      return '⇸';
    default:
      return '';
  }
}
