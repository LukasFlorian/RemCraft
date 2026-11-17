/**
 * Supabase implementation of {@link ShareBackend} (see
 * `supabase/migrations/20261117000000_sharing.sql`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareSnapshot } from '@core/sharing/snapshot';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';
import type { PublishedShare, ShareBackend, ShareUpload } from './shareBackend';
import { FILE_BUCKET } from './supabase';

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
    if (!this.userId) throw new Error('Anmeldung erforderlich');
    return this.userId;
  }

  async publish(
    snapshot: ShareSnapshot,
    files: readonly ShareUpload[],
    scopeLabel: string,
    token?: string,
  ): Promise<string> {
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
          'Freigabe aktualisieren',
        )
      : check(
          await this.client.from('shares').insert(row).select('token').single(),
          'Freigabe erstellen',
        );
    const t = (saved as { token: string }).token;
    for (const f of files) {
      check(
        await this.client.storage
          .from(SHARE_BUCKET)
          .upload(`${t}/${f.id}`, f.blob, { contentType: f.mimeType, upsert: true }),
        'Datei hochladen',
      );
    }
    return t;
  }

  async fetchSnapshot(token: string): Promise<ShareSnapshot> {
    const data = check(await this.client.rpc('get_share', { p_token: token }), 'Freigabe laden');
    if (!data) throw new Error('Freigabe nicht gefunden (Link falsch oder zurückgezogen)');
    return data as ShareSnapshot;
  }

  snapshotFileUrl(token: string, fileId: string): string {
    return this.client.storage.from(SHARE_BUCKET).getPublicUrl(`${token}/${fileId}`).data.publicUrl;
  }

  async fetchSnapshotFile(token: string, fileId: string): Promise<Blob> {
    const url = this.snapshotFileUrl(token, fileId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Datei nicht gefunden (${res.status})`);
    return res.blob();
  }

  async unpublish(token: string): Promise<void> {
    const { data } = await this.client.storage.from(SHARE_BUCKET).list(token);
    if (data?.length)
      await this.client.storage.from(SHARE_BUCKET).remove(data.map((f) => `${token}/${f.name}`));
    check(await this.client.from('shares').delete().eq('token', token), 'Freigabe löschen');
  }

  async myShares(): Promise<PublishedShare[]> {
    const rows = check(
      await this.client
        .from('shares')
        .select('token,title,root_id,scope_label,updated_at')
        .eq('owner_id', this.me())
        .order('updated_at', { ascending: false }),
      'Freigaben laden',
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
      'Space erstellen',
    ) as SpaceRow[];
    return toSpace(rows[0]!);
  }

  async createInvite(spaceId: string, role: Exclude<SpaceRole, 'owner'>): Promise<string> {
    return check(
      await this.client.rpc('create_invite', { p_space: spaceId, p_role: role }),
      'Einladung erstellen',
    ) as string;
  }

  async joinSpace(inviteToken: string): Promise<SpaceInfo> {
    const rows = check(
      await this.client.rpc('join_space', { p_token: inviteToken }),
      'Beitreten',
    ) as SpaceRow[];
    if (!rows[0]) throw new Error('Einladung ungültig');
    return toSpace(rows[0]);
  }

  async mySpaces(): Promise<SpaceInfo[]> {
    if (!this.userId) return [];
    return (check(await this.client.rpc('my_spaces'), 'Spaces laden') as SpaceRow[]).map(toSpace);
  }

  async members(spaceId: string): Promise<SpaceMember[]> {
    const rows = check(
      await this.client.from('space_members').select('user_id,email,role').eq('space_id', spaceId),
      'Mitglieder laden',
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
      'Mitglied ändern',
    );
  }

  async leaveSpace(spaceId: string): Promise<void> {
    check(await this.client.rpc('leave_space', { p_space: spaceId }), 'Space verlassen');
  }

  async uploadSpaceFile(spaceId: string, id: string, blob: Blob, mimeType: string): Promise<void> {
    check(
      await this.client.storage
        .from(FILE_BUCKET)
        .upload(`spaces/${spaceId}/${id}`, blob, { contentType: mimeType, upsert: true }),
      'Datei hochladen',
    );
  }
}
