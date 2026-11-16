/**
 * In-memory full-text search over Rems.
 *
 * A linear scan with a cheap scoring function is fast enough for tens of
 * thousands of Rems (≈ a few milliseconds) and needs no index maintenance.
 */
import type { Rem, RemId } from '../model/types';

/** A searchable item. */
export interface SearchItem {
  rem: Rem;
  /** Plain text of front and back. */
  text: string;
}

/** A search result. */
export interface SearchHit {
  remId: RemId;
  score: number;
}

/** Parsed search query (used by search portals and the search dialog). */
export interface SearchQuery {
  terms: string[];
  /** Tag names that must be present (`#Tag` or `tag:Tag`). */
  tags: string[];
  /** Filters such as `is:card`, `is:todo`, `is:unfinished`, `is:document`. */
  flags: string[];
}

/** Folds case and accents for matching. */
export function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Parses a query string into terms, tag filters and flags. */
export function parseSearchQuery(query: string): SearchQuery {
  const out: SearchQuery = { terms: [], tags: [], flags: [] };
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const token = m[1] ?? m[2]!;
    if (m[2] && /^#./.test(token)) out.tags.push(fold(token.slice(1)));
    else if (m[2] && /^tag:./i.test(token)) out.tags.push(fold(token.slice(4)));
    else if (m[2] && /^is:./i.test(token)) out.flags.push(token.slice(3).toLowerCase());
    else out.terms.push(fold(token));
  }
  return out;
}

/** Evaluates `is:` flags. */
function matchesFlags(rem: Rem, flags: readonly string[]): boolean {
  return flags.every((f) => {
    switch (f) {
      case 'card':
        return rem.direction !== 'none' || rem.text.some((s) => s.marks?.cloze);
      case 'todo':
        return rem.todo !== undefined;
      case 'unfinished':
        return rem.todo === 'unfinished';
      case 'finished':
        return rem.todo === 'finished';
      case 'document':
        return rem.isDocument;
      case 'folder':
        return rem.isFolder;
      default:
        return true;
    }
  });
}

/**
 * Searches items.
 *
 * @param items Searchable items.
 * @param query Raw query string.
 * @param tagName Resolves a tag id to its folded name.
 * @param limit Maximum number of hits.
 */
export function search(
  items: Iterable<SearchItem>,
  query: string,
  tagName: (id: RemId) => string,
  limit = 50,
): SearchHit[] {
  const q = parseSearchQuery(query);
  if (q.terms.length === 0 && q.tags.length === 0 && q.flags.length === 0) return [];
  const phrase = q.terms.join(' ');
  const hits: SearchHit[] = [];
  for (const { rem, text } of items) {
    if (!matchesFlags(rem, q.flags)) continue;
    if (q.tags.length > 0) {
      const names = rem.tags.map(tagName);
      if (!q.tags.every((t) => names.includes(t))) continue;
    }
    const hay = fold([text, ...rem.aliases].join(' \u0001 '));
    let score = 0;
    let ok = true;
    for (const term of q.terms) {
      const at = hay.indexOf(term);
      if (at === -1) {
        ok = false;
        break;
      }
      score += 10;
      if (at === 0 || /[\s\p{P}]/u.test(hay[at - 1] ?? ' ')) score += 10; // word start
    }
    if (!ok) continue;
    const head = fold(text);
    if (phrase && head === phrase) score += 100;
    else if (phrase && head.startsWith(phrase)) score += 40;
    if (rem.isDocument || rem.isFolder) score += 30;
    if (rem.aliases.some((a) => fold(a) === phrase)) score += 60;
    score += 10 / (1 + text.length / 40); // prefer short, title-like Rems
    hits.push({ remId: rem.id, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
