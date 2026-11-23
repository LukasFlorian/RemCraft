/**
 * Find and replace across Rems.
 *
 * Works on the text runs of rich text (front and back of a Rem), so
 * formatting, clozes, references and formulas are kept: a match must lie
 * inside one run of equally formatted text. Pure functions; the data layer
 * applies a plan in one undoable step.
 */
import type { RemGraph } from '../model/graph';
import { walkSubtree } from '../model/graph';
import type { Rem, RemId, RichText } from '../model/types';
import { normalize, toPlainText } from '../richtext/ops';
import { t } from '@core/i18n';

/** Fields of a Rem that are searched. */
export type ReplaceField = 'text' | 'back';

/** What to look for. */
export interface FindOptions {
  /** Search text (or regular expression with `regex`). */
  query: string;
  /** Replacement (`$1` etc. refer to groups with `regex`). */
  replacement: string;
  caseSensitive?: boolean;
  /** Only whole words match. */
  wholeWord?: boolean;
  /** Treat `query` as a regular expression. */
  regex?: boolean;
}

/** One planned change. */
export interface ReplaceChange {
  remId: RemId;
  field: ReplaceField;
  /** Number of replaced occurrences in this field. */
  count: number;
  before: RichText;
  after: RichText;
  /** Plain-text previews. */
  beforeText: string;
  afterText: string;
}

/** Escapes a string for literal use in a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the global matcher.
 *
 * @returns The expression, or an error message for an invalid one.
 */
export function buildMatcher(opts: FindOptions): RegExp | string {
  if (!opts.query) return t('Search term missing');
  let source = opts.regex ? opts.query : escapeRegExp(opts.query);
  if (opts.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(source, `gu${opts.caseSensitive ? '' : 'i'}`);
  } catch (e) {
    return `Ungültiger regulärer Ausdruck: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Replaces all matches inside the text runs of a rich-text value.
 *
 * @returns The new value and the number of replacements.
 */
export function replaceInRichText(
  value: RichText,
  matcher: RegExp,
  opts: Pick<FindOptions, 'replacement' | 'regex'>,
): { value: RichText; count: number } {
  // A literal replacement must not interpret `$` patterns.
  const replacement = opts.regex ? opts.replacement : opts.replacement.replace(/\$/g, '$$$$');
  let count = 0;
  const out = value.map((seg) => {
    if (seg.type !== 'text') return seg;
    matcher.lastIndex = 0;
    const n = [...seg.text.matchAll(matcher)].filter((m) => m[0] !== '').length;
    if (n === 0) return seg;
    count += n;
    return { ...seg, text: seg.text.replace(matcher, replacement) };
  });
  return { value: count ? normalize(out) : value, count };
}

/**
 * Plans the replacements in a set of Rems.
 *
 * @param rems Rems to search.
 * @param opts What to find and how to replace it.
 * @param fields Fields to search (default: front and back).
 */
export function planReplace(
  rems: Iterable<Rem>,
  opts: FindOptions,
  fields: readonly ReplaceField[] = ['text', 'back'],
): ReplaceChange[] | string {
  const matcher = buildMatcher(opts);
  if (typeof matcher === 'string') return matcher;
  const changes: ReplaceChange[] = [];
  for (const rem of rems) {
    for (const field of fields) {
      const value = field === 'text' ? rem.text : rem.back;
      if (!value || value.length === 0) continue;
      const { value: after, count } = replaceInRichText(value, matcher, opts);
      if (count === 0) continue;
      changes.push({
        remId: rem.id,
        field,
        count,
        before: value,
        after,
        beforeText: toPlainText(value),
        afterText: toPlainText(after),
      });
    }
  }
  return changes;
}

/**
 * The Rems of a scope: a subtree (inclusive) or the whole knowledge base.
 *
 * @param graph Rem graph.
 * @param rootId Root of the scope, `null` for everything.
 * @param all All Rems (used when `rootId` is `null`).
 */
export function remsInScope(graph: RemGraph, rootId: RemId | null, all: Iterable<Rem>): Rem[] {
  if (rootId === null) return [...all];
  const out: Rem[] = [];
  walkSubtree(graph, rootId, (rem) => void out.push(rem));
  return out;
}
