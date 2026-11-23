/**
 * Supabase implementation of {@link ShareBackend} (see
 * `supabase/migrations/20261117000000_sharing.sql`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareSnapshot } from '@core/sharing/snapshot';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';
import { completeFileIds, getChunked, putChunked, urlStore } from './chunkedFiles';
import type { PublishedShare, PublishResult, ShareBackend, ShareUpload } from './shareBackend';
import { bucketStore, FILE_BUCKET } from './supabase';
import { t as tr } from '@core/i18n';

/** Public bucket of read-only share files (`<token>/<file id>`). */
export const SHARE_BUCKET = 'shares';

/** Row returned by the space functions. */
interface SpaceRow {
  id: string;
  name: string;
  root_id: string;
  owner_id: string;
  role: SpaceRole;
}

const toSpace = (r: SpaceRow): SpaceInfo => ({
  id: r.id,
  name: r.name,
  rootId: r.root_id,
  ownerId: r.owner_id,
  role: r.role,
});

/** Throws a readable error for a failed request. */
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Sharing via Supabase; `userId` is `null` for anonymous visitors. */
export class SupabaseShareBackend implements ShareBackend {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string | null,
  ) {}

  private me(): string {
    if (!this.userId) throw new Error(tr('Sign-in required'));
    return this.userId;
  }

  async publish(
    snapshot: ShareSnapshot,
    files: readonly ShareUpload[],
    scopeLabel: string,
    token?: string,
  ): Promise<PublishResult> {
    const row = {
      owner_id: this.me(),
      title: snapshot.title,
      root_id: snapshot.rootId,
      scope_label: scopeLabel,
      snapshot,
      updated_at: new Date().toISOString(),
    };
    const saved = token
      ? check(
          await this.client.from('shares').update(row).eq('token', token).select('token').single(),
          tr('Updating share'),
        )
      : check(
          await this.client.from('shares').insert(row).select('token').single(),
          tr('Creating share'),
        );
    const t = (saved as { token: string }).token;
    const failed = await this.uploadSnapshotFiles(t, files);
    return { token: t, failed };
  }

  async uploadSnapshotFiles(
    token: string,
    files: readonly ShareUpload[],
  ): Promise<PublishResult['failed']> {
    // Every file is tried, one failure must not hide the others.
    const store = bucketStore(this.client, SHARE_BUCKET);
    const failed: PublishResult['failed'] = [];
    for (const f of files) {
      try {
        const file = await f.load();
        if (!file) throw new Error(tr('File not on this device and not loadable from the server'));
        await putChunked(store, `${token}/${f.id}`, file.blob, file.mimeType);
      } catch (e) {
        failed.push({ id: f.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return failed;
  }

  async fetchSnapshot(token: string): Promise<ShareSnapshot> {
    const data = check(await this.client.rpc('get_share', { p_token: token }), tr('Loading share'));
    if (!data) throw new Error(tr('Share not found (wrong link or revoked)'));
    return data as ShareSnapshot;
  }

  async listSnapshotFiles(token: string): Promise<string[]> {
    const names: string[] = [];
    // Paged: split PDFs add several objects per file.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.client.storage
        .from(SHARE_BUCKET)
        .list(token, { limit: 1000, offset });
      if (error) throw new Error(error.message);
      names.push(...(data ?? []).map((f) => f.name));
      if (!data || data.length < 1000) break;
    }
    return completeFileIds(names);
  }

  snapshotFileUrl(token: string, fileId: string): string {
    return this.client.storage.from(SHARE_BUCKET).getPublicUrl(`${token}/${fileId}`).data.publicUrl;
  }

  async fetchSnapshotFile(token: string, fileId: string): Promise<Blob> {
    const store = urlStore(
      (path) => this.client.storage.from(SHARE_BUCKET).getPublicUrl(path).data.publicUrl,
    );
    const blob = await getChunked(store, `${token}/${fileId}`);
    if (!blob) throw new Error(tr('File missing in the link – the owner needs to refresh it.'));
    return blob;
  }

  async unpublish(token: string): Promise<void> {
    // Remove page by page (the listing shrinks while removing).
    for (;;) {
      const { data } = await this.client.storage.from(SHARE_BUCKET).list(token, { limit: 1000 });
      if (!data?.length) break;
      const { error } = await this.client.storage
        .from(SHARE_BUCKET)
        .remove(data.map((f) => `${token}/${f.name}`));
      if (error) break;
    }
    check(await this.client.from('shares').delete().eq('token', token), tr('Deleting share'));
  }

  async myShares(): Promise<PublishedShare[]> {
    const rows = check(
      await this.client
        .from('shares')
        .select('token,title,root_id,scope_label,updated_at')
        .eq('owner_id', this.me())
        .order('updated_at', { ascending: false }),
      tr('Loading shares'),
    );
    return (rows ?? []).map(
      (r: {
        token: string;
        title: string;
        root_id: string;
        scope_label: string;
        updated_at: string;
      }) => ({
        token: r.token,
        title: r.title,
        rootId: r.root_id,
        scopeLabel: r.scope_label,
        updatedAt: Date.parse(r.updated_at),
      }),
    );
  }

  async createSpace(name: string, rootId: string): Promise<SpaceInfo> {
    const rows = check(
      await this.client.rpc('create_space', { p_name: name, p_root: rootId }),
      tr('Creating space'),
    ) as SpaceRow[];
    return toSpace(rows[0]!);
  }

  async createInvite(spaceId: string, role: Exclude<SpaceRole, 'owner'>): Promise<string> {
    return check(
      await this.client.rpc('create_invite', { p_space: spaceId, p_role: role }),
      tr('Creating invitation'),
    ) as string;
  }

  async joinSpace(inviteToken: string): Promise<SpaceInfo> {
    const rows = check(
      await this.client.rpc('join_space', { p_token: inviteToken }),
      tr('Join'),
    ) as SpaceRow[];
    if (!rows[0]) throw new Error(tr('Invalid invitation'));
    return toSpace(rows[0]);
  }

  async mySpaces(): Promise<SpaceInfo[]> {
    if (!this.userId) return [];
    return (check(await this.client.rpc('my_spaces'), tr('Loading spaces')) as SpaceRow[]).map(
      toSpace,
    );
  }

  async members(spaceId: string): Promise<SpaceMember[]> {
    const rows = check(
      await this.client.from('space_members').select('user_id,email,role').eq('space_id', spaceId),
      tr('Loading members'),
    );
    return (rows ?? []).map((r: { user_id: string; email: string | null; role: SpaceRole }) => ({
      userId: r.user_id,
      email: r.email,
      role: r.role,
    }));
  }

  async setMember(
    spaceId: string,
    userId: string,
    role: Exclude<SpaceRole, 'owner'> | null,
  ): Promise<void> {
    check(
      await this.client.rpc('set_space_member', { p_space: spaceId, p_user: userId, p_role: role }),
      tr('Changing member'),
    );
  }

  async leaveSpace(spaceId: string): Promise<void> {
    check(await this.client.rpc('leave_space', { p_space: spaceId }), tr('Leaving space'));
  }

  async uploadSpaceFile(spaceId: string, id: string, blob: Blob, mimeType: string): Promise<void> {
    await putChunked(
      bucketStore(this.client, FILE_BUCKET),
      `spaces/${spaceId}/${id}`,
      blob,
      mimeType,
    );
  }
}
