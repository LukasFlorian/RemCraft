/**
 * Store-backed search helpers used by the search dialog, autocomplete and
 * search portals.
 */
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import type { SearchHit, SearchItem } from '@core/search/search';
import { fold, search } from '@core/search/search';
import type { Store } from '@data/store/store';

/** Searchable items (memoised per Rem version). */
function items(store: Store): SearchItem[] {
  return store.memo('searchItems', [store.collectionVersion('rems')], () => {
    const resolve = (id: RemId): string => toPlainText(store.get(id)?.text ?? []);
    return store.all('rems').map((rem) => ({
      rem,
      text:
        toPlainText(rem.text, resolve) +
        (rem.back ? ` ${toPlainText(rem.back, resolve)}` : '') +
        (rem.slideText ? ` ${rem.slideText}` : ''),
    }));
  });
}

/**
 * Searches all Rems.
 *
 * @param store Store.
 * @param query Query string (supports `#tag` and `is:` filters).
 * @param limit Maximum number of hits.
 */
export function searchStore(store: Store, query: string, limit = 30): SearchHit[] {
  // Memoised per query so React selectors get a stable result between changes.
  return store.memo(`search:${limit}:${query}`, [store.collectionVersion('rems')], () => {
    const tagName = (id: RemId): string => fold(toPlainText(store.get(id)?.text ?? []));
    return search(items(store), query, tagName, limit);
  });
}
