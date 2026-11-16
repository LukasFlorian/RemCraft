/**
 * Share snapshots: a self-contained, read-only copy of a scoped subtree that
 * others can view and clone into their own knowledge base.
 *
 * A snapshot holds Rems (with their original ids), slide annotations and the
 * list of referenced files. Cloning assigns fresh ids everywhere, rewrites
 * references between the copied Rems and drops references that point outside
 * the snapshot (they become plain text). Learning progress is never part of a
 * snapshot: each person practises with their own schedule.
 */
import type { RemGraph } from '../model/graph';
import type { Rem, RemId, RichText, SlideAnnotations, Timestamp } from '../model/types';
import { toPlainText } from '../richtext/ops';
import type { ShareScope } from './scope';
import { selectScope } from './scope';

/** Format marker of snapshot files. */
export const SNAPSHOT_FORMAT = 'remcraft-share';

/** A binary file referenced by a snapshot. */
export interface SnapshotFile {
  /** File id (the part after `file:`). */
  id: string;
  name: string;
  mimeType: string;
  /** Base64 content; only in offline snapshot files (`*.remcraft.json`). */
  data?: string;
}

/** A read-only share. */
export interface ShareSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  title: string;
  /** Id of the shared root inside {@link rems}. */
  rootId: RemId;
  scope: ShareScope;
  createdAt: Timestamp;
  rems: Rem[];
  annotations: SlideAnnotations[];
  files: SnapshotFile[];
}

/** Fields that are personal and never shared. */
const PERSONAL_KEYS = ['spaceId', 'spaceRoot', 'pinned', 'editLater'] as const;

/** File references (`file:<id>`) used by a Rem. */
export function fileRefs(rem: Rem): string[] {
  return [rem.image?.src, rem.file?.src, rem.deck?.src]
    .filter((s): s is string => typeof s === 'string' && s.startsWith('file:'))
    .map((s) => s.slice('file:'.length));
}

/**
 * Builds a snapshot of a subtree.
 *
 * @param graph Rem graph.
 * @param rootId Shared root.
 * @param scope Parts to include.
 * @param annotationsOf Looks up the annotations of a slide.
 * @param now Creation time.
 */
export function buildSnapshot(
  graph: RemGraph,
  rootId: RemId,
  scope: ShareScope,
  annotationsOf: (slideId: RemId) => SlideAnnotations | undefined,
  now: Timestamp,
): ShareSnapshot {
  const { rems, annotatedSlides } = selectScope(graph, rootId, scope);
  const ids = new Set(rems.map((r) => r.id));
  const resolve = (id: RemId): string => toPlainText(graph.get(id)?.text ?? []);
  const cleaned = rems.map((r) => {
    const next = detach(r, ids, resolve);
    for (const key of PERSONAL_KEYS) delete next[key];
    return next;
  });
  const annotations = annotatedSlides
    .map(annotationsOf)
    .filter(
      (a): a is SlideAnnotations =>
        a !== undefined && (a.strokes.length > 0 || a.boxes.length > 0 || a.marks.length > 0),
    )
    .map(({ spaceId: _s, ...a }) => a);
  const files = [...new Set(cleaned.flatMap(fileRefs))].map((id) => ({
    id,
    name: id,
    mimeType: 'application/octet-stream',
  }));
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    title: toPlainText(graph.get(rootId)?.text ?? []) || 'Geteilt',
    rootId,
    scope,
    createdAt: now,
    rems: cleaned,
    annotations,
    files,
  };
}

/**
 * Removes links to Rems outside `ids`: references become plain text, tags,
 * portals and properties pointing outside are dropped.
 */
function detach(rem: Rem, ids: ReadonlySet<RemId>, resolve: (id: RemId) => string): Rem {
  const fix = (text: RichText): RichText =>
    text.map((s) =>
      s.type === 'ref' && !ids.has(s.remId)
        ? { type: 'text' as const, text: resolve(s.remId), ...(s.marks ? { marks: s.marks } : {}) }
        : s,
    );
  const next: Rem = {
    ...rem,
    text: fix(rem.text),
    back: rem.back ? fix(rem.back) : null,
    tags: rem.tags.filter((t) => ids.has(t)),
  };
  if (rem.portalOf && !ids.has(rem.portalOf)) delete next.portalOf;
  if (rem.propertyId && !ids.has(rem.propertyId)) delete next.propertyId;
  return next;
}

/** Throws unless `value` looks like a snapshot. */
export function validateSnapshot(value: unknown): ShareSnapshot {
  const s = value as Partial<ShareSnapshot> | null;
  if (
    !s ||
    s.format !== SNAPSHOT_FORMAT ||
    s.version !== 1 ||
    !Array.isArray(s.rems) ||
    typeof s.rootId !== 'string'
  )
    throw new Error('Keine gültige RemCraft-Freigabe');
  if (!s.rems.some((r) => r.id === s.rootId)) throw new Error('Freigabe ohne Wurzel');
  return { annotations: [], files: [], ...s } as ShareSnapshot;
}

/** Result of {@link cloneSnapshot}. */
export interface ClonedSnapshot {
  rootId: RemId;
  rems: Rem[];
  annotations: SlideAnnotations[];
  /** Old id → new id. */
  idMap: Map<RemId, RemId>;
}

/**
 * Copies a snapshot with fresh ids below `parentId`.
 *
 * @param snapshot The snapshot.
 * @param parentId New parent of the root (`null` = top level).
 * @param order Sibling order of the root.
 * @param makeId Id generator.
 * @param now Timestamp of the copies.
 */
export function cloneSnapshot(
  snapshot: ShareSnapshot,
  parentId: RemId | null,
  order: string,
  makeId: () => string,
  now: Timestamp,
): ClonedSnapshot {
  const idMap = new Map(snapshot.rems.map((r) => [r.id, makeId()] as const));
  const map = (id: RemId): RemId => idMap.get(id) ?? id;
  const fix = (text: RichText): RichText =>
    text.map((s) => (s.type === 'ref' ? { ...s, remId: map(s.remId) } : s));
  const rems = snapshot.rems.map((r): Rem => {
    const isRoot = r.id === snapshot.rootId;
    const next: Rem = {
      ...r,
      id: map(r.id),
      parentId: isRoot ? parentId : r.parentId === null ? null : map(r.parentId),
      order: isRoot ? order : r.order,
      text: fix(r.text),
      back: r.back ? fix(r.back) : null,
      tags: r.tags.map(map),
      createdAt: now,
      updatedAt: now,
    };
    if (r.portalOf) next.portalOf = map(r.portalOf);
    if (r.propertyId) next.propertyId = map(r.propertyId);
    for (const key of PERSONAL_KEYS) delete next[key];
    return next;
  });
  const annotations = snapshot.annotations
    .filter((a) => idMap.has(a.id))
    .map((a) => ({ ...a, id: map(a.id), createdAt: now, updatedAt: now }));
  return { rootId: map(snapshot.rootId), rems, annotations, idMap };
}

/** Counts of a snapshot for previews. */
export function snapshotStats(snapshot: ShareSnapshot): {
  rems: number;
  slides: number;
  documents: number;
} {
  return {
    rems: snapshot.rems.length,
    slides: snapshot.rems.filter((r) => r.slide).length,
    documents: snapshot.rems.filter((r) => r.isDocument || r.isFolder).length,
  };
}
