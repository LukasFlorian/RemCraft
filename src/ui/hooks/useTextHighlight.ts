/**
 * Highlights search terms inside rendered content with the CSS Custom
 * Highlight API (`::highlight(search-hit)`). The DOM is not changed, so it is
 * safe with React-rendered text. Browsers without the API show no highlight.
 */
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { findMatches } from '@core/search/highlight';

/** Name of the highlight (styled in pages.css). */
const NAME = 'search-hit';

/** Ranges of every mounted element, so several results share one highlight. */
const registry = new Map<object, Range[]>();

/** Re-registers the combined highlight. */
function refresh(): void {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return;
  const all = [...registry.values()].flat();
  if (all.length === 0) CSS.highlights.delete(NAME);
  else CSS.highlights.set(NAME, new Highlight(...all));
}

/**
 * Highlights the terms in an element's text.
 *
 * Args:
 *   ref: The element.
 *   terms: Search terms.
 *   version: Changes when the element's content changes.
 */
export function useTextHighlight(
  ref: RefObject<HTMLElement | null>,
  terms: readonly string[],
  version: unknown,
): void {
  const key = terms.join('\u0001');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !key || typeof Highlight === 'undefined') return;
    const owner = {};
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      // Formulas are rendered markup, not the searched text.
      acceptNode: (n) =>
        n.parentElement?.closest('.katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue ?? '';
      for (const [a, b] of findMatches(text, key.split('\u0001'))) {
        const r = document.createRange();
        r.setStart(n, a);
        r.setEnd(n, b);
        ranges.push(r);
      }
    }
    registry.set(owner, ranges);
    refresh();
    return () => {
      registry.delete(owner);
      refresh();
    };
  }, [ref, key, version]);
}
