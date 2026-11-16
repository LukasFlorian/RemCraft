/**
 * Live collaboration: shared spaces.
 *
 * A *space* is a shared partition on the server. Every Rem of a shared
 * subtree carries the space's id in `spaceId`; the subtree's root is marked
 * with `spaceRoot`. Records with a `spaceId` are synchronised to the space
 * (visible to all members) instead of the personal partition. Learning
 * progress (card states, review logs, lectures) always stays personal.
 *
 * The invariant "a Rem's space = its parent's space, unless it is a space
 * root" is maintained by {@link expectedSpace}, applied on every local write.
 */
import type { Rem } from '../model/types';

/** Role of a member in a space. */
export type SpaceRole = 'owner' | 'writer' | 'reader';

/** A space as listed for the current user. */
export interface SpaceInfo {
  id: string;
  name: string;
  /** Root Rem of the shared subtree. */
  rootId: string;
  role: SpaceRole;
  ownerId: string;
}

/** A member of a space. */
export interface SpaceMember {
  userId: string;
  email: string | null;
  role: SpaceRole;
}

/** German labels of roles. */
export const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Besitzer',
  writer: 'Bearbeiten',
  reader: 'Nur lesen',
};

/**
 * The space a Rem should belong to.
 *
 * @param rem The Rem.
 * @param parent Its parent; `undefined` when the Rem is top level or its
 *   parent is not available locally (the root of a space shared with me).
 * @returns The space id, or `undefined` for the personal partition.
 */
export function expectedSpace(rem: Rem, parent: Rem | undefined): string | undefined {
  if (rem.spaceRoot) return rem.spaceRoot;
  if (parent) return parent.spaceId;
  // Without a local parent: top level stays personal, a shared root keeps its space.
  return rem.parentId === null ? undefined : rem.spaceId;
}

/** True when the role may edit records of the space. */
export function canWrite(role: SpaceRole | undefined): boolean {
  return role === 'owner' || role === 'writer';
}
