/**
 * Minimal read interface over the Rem tree.
 *
 * Domain algorithms (card generation, inheritance, search, export) depend on
 * this interface only, never on the concrete store. This keeps them pure and
 * trivially testable with {@link createMemoryGraph}.
 */
import { compareOrder } from './ordering';
import type { Rem, RemId } from './types';

/** Read-only access to Rems and their ordered children. */
export interface RemGraph {
  /** Returns the Rem or `undefined` when it does not exist (or is deleted). */
  get(id: RemId): Rem | undefined;
  /** Ordered children of a Rem (`null` = top level). */
  children(id: RemId | null): readonly Rem[];
}

/**
 * Builds a {@link RemGraph} over a fixed array of Rems (used in tests and by
 * importers that work on detached trees).
 */
export function createMemoryGraph(rems: readonly Rem[]): RemGraph {
  const byId = new Map(rems.map((r) => [r.id, r] as const));
  const kids = new Map<RemId | null, Rem[]>();
  for (const r of rems) {
    const list = kids.get(r.parentId) ?? [];
    list.push(r);
    kids.set(r.parentId, list);
  }
  for (const list of kids.values()) list.sort(compareOrder);
  return {
    get: (id) => byId.get(id),
    children: (id) => kids.get(id) ?? [],
  };
}

/**
 * Ancestors of a Rem from the root down to its parent.
 *
 * @param graph Rem graph.
 * @param id Rem whose ancestors are requested.
 */
export function ancestors(graph: RemGraph, id: RemId): Rem[] {
  const out: Rem[] = [];
  const seen = new Set<RemId>([id]);
  let cur = graph.get(id)?.parentId ?? null;
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur); // defends against cycles created by conflicting moves
    const rem = graph.get(cur);
    if (!rem) break;
    out.push(rem);
    cur = rem.parentId;
  }
  return out.reverse();
}

/**
 * Depth-first pre-order traversal of the subtree rooted at `id` (inclusive).
 *
 * @param graph Rem graph.
 * @param id Root of the subtree.
 * @param visit Callback; return `false` to skip the children of a Rem.
 */
export function walkSubtree(
  graph: RemGraph,
  id: RemId,
  visit: (rem: Rem, depth: number) => boolean | void,
): void {
  const root = graph.get(id);
  if (!root) return;
  const stack: [Rem, number][] = [[root, 0]];
  const seen = new Set<RemId>();
  while (stack.length > 0) {
    const [rem, depth] = stack.pop()!;
    if (seen.has(rem.id)) continue;
    seen.add(rem.id);
    if (visit(rem, depth) === false) continue;
    const children = graph.children(rem.id);
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i]!, depth + 1]);
  }
}

/** True when `ancestorId` is `id` itself or one of its ancestors. */
export function isInSubtree(graph: RemGraph, id: RemId, ancestorId: RemId): boolean {
  if (id === ancestorId) return true;
  return ancestors(graph, id).some((a) => a.id === ancestorId);
}

/**
 * The nearest enclosing document of a Rem (the Rem itself if it is one).
 */
export function enclosingDocument(graph: RemGraph, id: RemId): Rem | undefined {
  const rem = graph.get(id);
  if (rem?.isDocument || rem?.isFolder) return rem;
  const chain = ancestors(graph, id);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i]!.isDocument || chain[i]!.isFolder) return chain[i];
  }
  return chain[0];
}
