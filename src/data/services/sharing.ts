/**
 * Sharing: read-only snapshots (link or file, cloneable) and live shared
 * spaces (collaboration with read or write access).
 *
 * - **Snapshots** copy a scoped subtree (see `@core/sharing/scope`). They are
 *   published under an unguessable link token or exported as a
 *   `*.remcraft.json` file (works without an account). Recipients view them
 *   read-only and can clone them into their own knowledge base.
 * - **Spaces** synchronise a whole subtree live between members. Records of
 *   the subtree carry `spaceId` and are pushed to the space partition by the
 *   sync engine. A pre-commit hook keeps `spaceId` consistent when Rems are
 *   created, moved or deleted inside shared subtrees.
 */
import type { RemId, SlideAnnotations } from '@core/model/types';
import { describeScope } from '@core/sharing/scope';
import type { ShareScope } from '@core/sharing/scope';
import { buildSnapshot, cloneSnapshot, fileRefs, validateSnapshot } from '@core/sharing/snapshot';
import type { ShareSnapshot } from '@core/sharing/snapshot';
import { canWrite, expectedSpace } from '@core/sharing/spaces';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';
import { newId } from '@core/util/ids';
import { orderBetween } from '@core/model/ordering';
import type { PersistenceAdapter } from '../persistence/adapter';
import type { Store, Transaction } from '../store/store';
import type { PublishedShare, ShareBackend, ShareUpload } from '../sync/shareBackend';
import type { FileService } from './files';
import { FILE_PREFIX } from './files';

/** Meta key: files already uploaded into spaces (`space/fileId`). */
const SPACE_FILES_KEY = 'sharing.spaceFiles';
/** How long the list of spaces is cached (ms). */
const SPACES_TTL = 60_000;

/** Snapshot export file with embedded files. */
export const SNAPSHOT_FILE_SUFFIX = '.remcraft.json';

/** Sharing service. */
export class SharingService {
  /** Server port (set while signed in with a backend). */
  backend: ShareBackend | null = null;
  /** Called after joining a space (the app resets the sync cursor and syncs). */
  onJoined: (() => Promise<void>) | null = null;

  private spaces: SpaceInfo[] = [];
  private spacesLoaded = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: Store,
    private readonly files: FileService,
    private readonly persistence: PersistenceAdapter,
  ) {
    store.addPreCommitHook((tx, changes) =>
      this.normalizeSpaces(
        tx,
        changes.filter((c) => c.after).map((c) => ({ collection: c.collection, id: c.id })),
      ),
    );
  }

  // ===========================================================================
  // Space invariant
  // ===========================================================================

  /**
   * Keeps `spaceId` consistent: Rems inherit the space of their parent (or of
   * their own `spaceRoot`), descendants follow when a subtree moves, and slide
   * annotations follow their slide. Runs to a fixed point.
   */
  private normalizeSpaces(tx: Transaction, written: { collection: string; id: string }[]): void {
    const work = new Set(written.filter((w) => w.collection === 'rems').map((w) => w.id));
    const annotationIds = new Set(
      written.filter((w) => w.collection === 'annotations').map((w) => w.id),
    );
    // Children created in this transaction are not yet in the store's index.
    const pendingChildren = new Map<RemId, RemId[]>();
    for (const id of work) {
      const parentId = tx.get('rems', id)?.parentId;
      if (parentId) pendingChildren.set(parentId, [...(pendingChildren.get(parentId) ?? []), id]);
    }
    let guard = 0;
    while (work.size > 0 && guard++ < 100_000) {
      const id = work.values().next().value as RemId;
      work.delete(id);
      const rem = tx.get('rems', id);
      if (!rem) continue;
      const parent = rem.parentId ? tx.get('rems', rem.parentId) : undefined;
      const want = expectedSpace(rem, parent);
      if (want === rem.spaceId) continue;
      tx.update('rems', id, { spaceId: want });
      annotationIds.add(id);
      for (const child of this.store.children(id)) work.add(child.id);
      for (const child of pendingChildren.get(id) ?? []) work.add(child);
    }
    for (const id of annotationIds) {
      const annotations = tx.get('annotations', id);
      if (!annotations) continue;
      const want = tx.get('rems', id)?.spaceId;
      if (annotations.spaceId !== want)
        tx.update('annotations', id, { spaceId: want } as Partial<SlideAnnotations>);
    }
  }

  // ===========================================================================
  // Snapshots
  // ===========================================================================

  /** Builds a snapshot of a subtree. */
  snapshot(rootId: RemId, scope: ShareScope): ShareSnapshot {
    return buildSnapshot(
      this.store,
      rootId,
      scope,
      (id) => this.store.getRecord('annotations', id),
      Date.now(),
    );
  }

  /** Exports a snapshot with embedded files (to send as a file). */
  async exportFile(rootId: RemId, scope: ShareScope): Promise<Blob> {
    const snap = this.snapshot(rootId, scope);
    for (const f of snap.files) {
      const blob = await this.files.blob(FILE_PREFIX + f.id);
      if (!blob) continue;
      f.mimeType = blob.type || f.mimeType;
      f.data = await toBase64(blob);
    }
    return new Blob([JSON.stringify(snap)], { type: 'application/json' });
  }

  /** Reads a snapshot file. */
  async readFile(file: Blob): Promise<ShareSnapshot> {
    return validateSnapshot(JSON.parse(await file.text()));
  }

  /**
   * Clones a snapshot into the own knowledge base.
   *
   * @param snapshot The snapshot.
   * @param parentId New parent (`null` = top level).
   * @param fetchFile Loads a file missing locally (published snapshots);
   *   embedded files of snapshot files are used directly.
   * @returns Id of the cloned root.
   */
  async clone(
    snapshot: ShareSnapshot,
    parentId: RemId | null,
    fetchFile?: (id: string) => Promise<Blob>,
  ): Promise<RemId> {
    // Files first, so the copy never points to missing data.
    for (const f of snapshot.files) {
      if (await this.persistence.getFile(f.id)) continue;
      const blob = f.data
        ? fromBase64(f.data, f.mimeType)
        : await fetchFile?.(f.id).catch(() => null);
      if (!blob) continue;
      await this.persistence.putFile({
        id: f.id,
        name: f.name,
        mimeType: blob.type || f.mimeType,
        size: blob.size,
        blob,
        uploaded: false,
        createdAt: Date.now(),
      });
    }
    const siblings = this.store.children(parentId);
    const order = orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
    const copy = cloneSnapshot(snapshot, parentId, order, () => newId(), this.store.clock.now());
    this.store.transact((tx) => {
      for (const r of copy.rems) tx.put('rems', r);
      for (const a of copy.annotations) tx.put('annotations', a);
    });
    return copy.rootId;
  }

  /** Publishes (or updates) a read-only link share. */
  async publish(rootId: RemId, scope: ShareScope, token?: string): Promise<string> {
    const backend = this.requireBackend();
    const snap = this.snapshot(rootId, scope);
    const uploads: ShareUpload[] = [];
    for (const f of snap.files) {
      const blob = await this.files.blob(FILE_PREFIX + f.id);
      if (!blob) continue;
      f.mimeType = blob.type || f.mimeType;
      uploads.push({ id: f.id, blob, mimeType: f.mimeType });
    }
    return backend.publish(snap, uploads, describeScope(scope), token);
  }

  /** Fetches a published snapshot by token. */
  async fetch(token: string): Promise<ShareSnapshot> {
    if (!this.backend)
      throw new Error(
        'Diese RemCraft-Instanz hat keinen Server konfiguriert - Freigabe-Links funktionieren nur mit Supabase.',
      );
    return validateSnapshot(await this.backend.fetchSnapshot(token));
  }

  /**
   * A file of a published snapshot (e.g. a slide PDF for the read-only view).
   *
   * @returns The file, or `null` when it is not available.
   */
  async fetchFile(token: string, fileId: string): Promise<Blob | null> {
    if (!this.backend) return null;
    return this.backend.fetchSnapshotFile(token, fileId).catch(() => null);
  }

  /** Clones a published snapshot. */
  async clonePublished(token: string, parentId: RemId | null): Promise<RemId> {
    const backend = this.requireBackend();
    const snap = await this.fetch(token);
    return this.clone(snap, parentId, (id) => backend.fetchSnapshotFile(token, id));
  }

  /** Read-only shares published by me. */
  async myShares(): Promise<PublishedShare[]> {
    return this.requireBackend().myShares();
  }

  /** Removes a published share. */
  async unpublish(token: string): Promise<void> {
    return this.requireBackend().unpublish(token);
  }

  // ===========================================================================
  // Spaces
  // ===========================================================================

  /** Known spaces (refreshed while syncing). */
  listSpaces(): readonly SpaceInfo[] {
    return this.spaces;
  }

  /** Subscribes to changes of the space list. */
  onSpacesChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The space a Rem is shared in, if any. */
  spaceOf(remId: RemId): SpaceInfo | undefined {
    const id = this.store.get(remId)?.spaceId;
    return id ? this.spaces.find((s) => s.id === id) : undefined;
  }

  /** Whether local records of a space may be uploaded. */
  canPush(spaceId: string): boolean {
    const space = this.spaces.find((s) => s.id === spaceId);
    return space ? canWrite(space.role) : true;
  }

  /**
   * Starts live sharing of a subtree: creates a space and moves the subtree
   * (including slide annotations and files) into it.
   */
  async shareLive(rootId: RemId): Promise<SpaceInfo> {
    const backend = this.requireBackend();
    const root = this.store.get(rootId);
    if (!root) throw new Error('Nicht gefunden');
    if (root.spaceId) throw new Error('Bereits geteilt');
    const space = await backend.createSpace(this.title(rootId), rootId);
    this.setSpaces([...this.spaces, space]);
    this.store.transact((tx) => void tx.update('rems', rootId, { spaceRoot: space.id }), {
      undoable: false,
    });
    await this.uploadSpaceFiles();
    return space;
  }

  /** Creates an invite link token for a space. */
  async invite(spaceId: string, role: Exclude<SpaceRole, 'owner'>): Promise<string> {
    return this.requireBackend().createInvite(spaceId, role);
  }

  /** Joins a space by invite token and downloads its content. */
  async join(token: string): Promise<SpaceInfo> {
    const space = await this.requireBackend().joinSpace(token);
    this.setSpaces([...this.spaces.filter((s) => s.id !== space.id), space]);
    await this.onJoined?.();
    return space;
  }

  /** Members of a space. */
  async members(spaceId: string): Promise<SpaceMember[]> {
    return this.requireBackend().members(spaceId);
  }

  /** Changes or removes a member (owner only). */
  async setMember(
    spaceId: string,
    userId: string,
    role: Exclude<SpaceRole, 'owner'> | null,
  ): Promise<void> {
    return this.requireBackend().setMember(spaceId, userId, role);
  }

  /**
   * Ends a membership. The owner stops sharing (the space is deleted on the
   * server, the subtree returns to the personal space); members keep a
   * personal copy of the current state.
   */
  async leave(spaceId: string): Promise<void> {
    await this.requireBackend().leaveSpace(spaceId);
    this.setSpaces(this.spaces.filter((s) => s.id !== spaceId));
    this.detachSpace(spaceId);
  }

  /**
   * Runs before every push: refreshes memberships, detaches subtrees of
   * spaces the user no longer belongs to (they become personal copies) and
   * uploads files referenced in shared subtrees.
   */
  async reconcile(force = false): Promise<void> {
    if (!this.backend) return;
    if (force || Date.now() - this.spacesLoaded > SPACES_TTL) {
      const spaces = await this.backend.mySpaces();
      this.spacesLoaded = Date.now();
      this.setSpaces(spaces);
      const known = new Set(spaces.map((s) => s.id));
      const stale = new Set(
        this.store
          .all('rems')
          .flatMap((r) => (r.spaceId && !known.has(r.spaceId) ? [r.spaceId] : [])),
      );
      for (const id of stale) this.detachSpace(id);
    }
    await this.uploadSpaceFiles();
  }

  /** Moves every Rem of a space back to the personal partition. */
  private detachSpace(spaceId: string): void {
    const rems = this.store
      .all('rems')
      .filter((r) => r.spaceId === spaceId || r.spaceRoot === spaceId);
    if (rems.length === 0) return;
    this.store.transact(
      (tx) => {
        for (const r of rems) tx.update('rems', r.id, { spaceId: undefined, spaceRoot: undefined });
        for (const r of rems) {
          const a = tx.get('annotations', r.id);
          if (a?.spaceId)
            tx.update('annotations', r.id, { spaceId: undefined } as Partial<SlideAnnotations>);
        }
      },
      { undoable: false },
    );
  }

  /** Uploads files used in shared subtrees into their space (once). */
  private async uploadSpaceFiles(): Promise<void> {
    if (!this.backend) return;
    const done = new Set((await this.persistence.getMeta<string[]>(SPACE_FILES_KEY)) ?? []);
    let changed = false;
    for (const rem of this.store.all('rems')) {
      if (!rem.spaceId || !this.canPush(rem.spaceId)) continue;
      for (const id of fileRefs(rem)) {
        const key = `${rem.spaceId}/${id}`;
        if (done.has(key)) continue;
        const blob = await this.files.blob(FILE_PREFIX + id);
        if (!blob) continue;
        await this.backend.uploadSpaceFile(
          rem.spaceId,
          id,
          blob,
          blob.type || 'application/octet-stream',
        );
        done.add(key);
        changed = true;
      }
    }
    if (changed) await this.persistence.setMeta(SPACE_FILES_KEY, [...done]);
  }

  private setSpaces(spaces: SpaceInfo[]): void {
    this.spaces = spaces;
    for (const l of this.listeners) l();
  }

  private title(id: RemId): string {
    return (
      (this.store.get(id)?.text ?? []).map((s) => (s.type === 'text' ? s.text : '')).join('') ||
      'Geteilt'
    );
  }

  private requireBackend(): ShareBackend {
    if (!this.backend)
      throw new Error('Zum Teilen per Link musst du angemeldet sein (Einstellungen → Konto).');
    return this.backend;
  }
}

/** Base64 of a blob. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Blob from base64. */
function fromBase64(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
