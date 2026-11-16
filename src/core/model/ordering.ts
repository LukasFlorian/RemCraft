/**
 * Sibling ordering with fractional indices.
 *
 * Each Rem stores an `order` string; siblings are sorted lexicographically.
 * Inserting between two siblings creates a key strictly between their keys,
 * so a move or insert only ever writes the moved Rem - essential for
 * conflict-free synchronisation between devices.
 */
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Returns an order key strictly between `before` and `after`.
 *
 * @param before Key of the previous sibling or `null` for "first".
 * @param after Key of the next sibling or `null` for "last".
 */
export function orderBetween(before: string | null, after: string | null): string {
  // Guard against corrupted input (equal or inverted keys), which can happen
  // when two devices insert at the same position concurrently.
  if (before !== null && after !== null && before >= after) {
    return generateKeyBetween(before, null);
  }
  return generateKeyBetween(before, after);
}

/**
 * Returns `n` ascending keys between `before` and `after`.
 */
export function ordersBetween(before: string | null, after: string | null, n: number): string[] {
  if (before !== null && after !== null && before >= after) {
    return generateNKeysBetween(before, null, n);
  }
  return generateNKeysBetween(before, after, n);
}

/** Comparator for records with an `order` key (ties broken by id). */
export function compareOrder(a: { order: string; id: string }, b: { order: string; id: string }): number {
  if (a.order < b.order) return -1;
  if (a.order > b.order) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
