/**
 * Server port for sharing: published read-only snapshots and shared spaces.
 * Implemented by Supabase (`supabaseShare.ts`) and by the in-memory fake
 * used in tests (`testing/fakeRemote.ts`).
 */
import type { ShareSnapshot } from '@core/sharing/snapshot';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';

/** A read-only share published by the current user. */
export interface PublishedShare {
  token: string;
  title: string;
  rootId: string;
  /** Scope description (for lists). */
  scopeLabel: string;
  updatedAt: number;
}

/** A file to publish with a snapshot. */
export interface ShareUpload {
  id: string;
  /**
   * Loads the content (`null` when it is not available). Loaded one file at
   * a time, so big folders do not keep every PDF in memory at once.
   */
  load: () => Promise<{ blob: Blob; mimeType: string } | null>;
}

/** Outcome of publishing a snapshot. */
export interface PublishResult {
  /** The share token (part of the share link). */
  token: string;
  /** Files that could not be uploaded (the snapshot itself is saved). */
  failed: { id: string; error: string }[];
}

/** Sharing operations of the server. */
export interface ShareBackend {
  // --- read-only snapshots (link, anyone can view and clone) ---------------
  /**
   * Publishes (or, with `token`, updates) a snapshot and its files. Every
   * file is attempted; failures are reported, not thrown.
   *
   * @returns The share token and the files that failed.
   */
  publish(
    snapshot: ShareSnapshot,
    files: readonly ShareUpload[],
    scopeLabel: string,
    token?: string,
  ): Promise<PublishResult>;
  /** Fetches a published snapshot (works without an account). */
  fetchSnapshot(token: string): Promise<ShareSnapshot>;
  /** Downloads a file of a published snapshot. */
  fetchSnapshotFile(token: string, fileId: string): Promise<Blob>;
  /** Ids of the files already stored with a published snapshot. */
  listSnapshotFiles(token: string): Promise<string[]>;
  /** Public URL of a file of a published snapshot. */
  snapshotFileUrl(token: string, fileId: string): string;
  /** Removes a published snapshot. */
  unpublish(token: string): Promise<void>;
  /** Snapshots published by the current user. */
  myShares(): Promise<PublishedShare[]>;

  // --- shared spaces (live collaboration) ------------------------------------
  /** Creates a space for a subtree; the current user becomes its owner. */
  createSpace(name: string, rootId: string): Promise<SpaceInfo>;
  /** Creates an invite link token granting `role`. */
  createInvite(spaceId: string, role: Exclude<SpaceRole, 'owner'>): Promise<string>;
  /** Joins a space with an invite token. */
  joinSpace(inviteToken: string): Promise<SpaceInfo>;
  /** Spaces the current user is a member of. */
  mySpaces(): Promise<SpaceInfo[]>;
  /** Members of a space. */
  members(spaceId: string): Promise<SpaceMember[]>;
  /** Changes a member's role or removes them (`null`; owner only). */
  setMember(
    spaceId: string,
    userId: string,
    role: Exclude<SpaceRole, 'owner'> | null,
  ): Promise<void>;
  /** Leaves a space (members) or deletes it with all shared rows (owner). */
  leaveSpace(spaceId: string): Promise<void>;
  /** Uploads a file into a space (readable by all members). */
  uploadSpaceFile(spaceId: string, id: string, blob: Blob, mimeType: string): Promise<void>;
}
