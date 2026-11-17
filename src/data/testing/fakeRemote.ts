/**
 * In-memory fake of the Supabase backend, used to test multi-device sync and
 * sharing without a network. Mirrors the server-side rules: every accepted
 * write gets a new sequence number, stale writes are ignored, users only see
 * their own rows and the rows of spaces they are members of, read-only
 * members cannot write.
 */
import type { ShareSnapshot } from '@core/sharing/snapshot';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';
import type { PublishedShare, ShareBackend } from '../sync/shareBackend';
import type { PulledRow, RemoteBackend, RemoteRow } from '../sync/remote';

/** A stored row with its partition. */
interface StoredRow extends PulledRow {
  /** `u:<userId>` or `s:<spaceId>`. */
  partition: string;
}

/** Shared fake server (one per test, shared by several "devices" and users). */
export class FakeServer {
  private seq = 0;
  private counter = 0;
  readonly rows = new Map<string, StoredRow>();
  readonly files = new Map<string, Blob>();
  readonly spaces = new Map<
    string,
    { name: string; rootId: string; ownerId: string; members: Map<string, SpaceRole> }
  >();
  readonly invites = new Map<string, { spaceId: string; role: SpaceRole }>();
  readonly shares = new Map<
    string,
    {
      owner: string;
      snapshot: ShareSnapshot;
      scopeLabel: string;
      files: Map<string, Blob>;
      updatedAt: number;
    }
  >();
  private readonly listeners = new Set<() => void>();

  private nextId(prefix: string): string {
    return `${prefix}${++this.counter}`;
  }

  private role(spaceId: string, userId: string): SpaceRole | undefined {
    return this.spaces.get(spaceId)?.members.get(userId);
  }

  /** Creates a sync client for a user (default: `user-1`). */
  client(userId = 'user-1'): RemoteBackend {
    return {
      pull: async (since, limit) =>
        [...this.rows.values()]
          .filter(
            (r) =>
              r.seq > since &&
              (r.partition === `u:${userId}` ||
                (r.partition.startsWith('s:') && this.role(r.partition.slice(2), userId))),
          )
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map(({ partition: _p, ...r }) => structuredClone(r)),
      push: async (rows: readonly RemoteRow[]) => {
        for (const row of rows) {
          if (row.space) {
            const role = this.role(row.space, userId);
            if (role !== 'owner' && role !== 'writer')
              throw new Error('Push failed: row-level security');
          }
          const partition = row.space ? `s:${row.space}` : `u:${userId}`;
          const key = `${partition}|${row.collection}:${row.id}`;
          const existing = this.rows.get(key);
          if (existing && row.updated_at < existing.updated_at) continue;
          this.rows.set(key, {
            ...structuredClone(row),
            space: row.space ?? null,
            partition,
            seq: ++this.seq,
          });
        }
        for (const l of this.listeners) l();
      },
      subscribe: (onChange) => {
        this.listeners.add(onChange);
        return () => this.listeners.delete(onChange);
      },
      uploadFile: async (id, blob) => void this.files.set(`${userId}/${id}`, blob),
      downloadFile: async (id) => {
        const own = this.files.get(`${userId}/${id}`);
        if (own) return own;
        for (const [spaceId, s] of this.spaces) {
          const blob = s.members.has(userId)
            ? this.files.get(`spaces/${spaceId}/${id}`)
            : undefined;
          if (blob) return blob;
        }
        throw new Error('missing');
      },
    };
  }

  /** Creates a sharing client for a user (`null` = anonymous visitor). */
  share(userId: string | null): ShareBackend {
    const me = (): string => {
      if (!userId) throw new Error('Anmeldung erforderlich');
      return userId;
    };
    const info = (id: string, uid: string): SpaceInfo => {
      const s = this.spaces.get(id)!;
      return { id, name: s.name, rootId: s.rootId, ownerId: s.ownerId, role: s.members.get(uid)! };
    };
    return {
      snapshotFileUrl: (token, fileId) => `https://shares.test/${token}/${fileId}`,
      publish: async (snapshot, files, scopeLabel, token) => {
        const owner = me();
        const existing = token ? this.shares.get(token) : undefined;
        if (existing && existing.owner !== owner) throw new Error('not allowed');
        const t = token ?? this.nextId('share');
        this.shares.set(t, {
          owner,
          snapshot: structuredClone(snapshot),
          scopeLabel,
          files: new Map(files.map((f) => [f.id, f.blob])),
          updatedAt: Date.now(),
        });
        return t;
      },
      fetchSnapshot: async (token) => {
        const s = this.shares.get(token);
        if (!s) throw new Error('Freigabe nicht gefunden');
        return structuredClone(s.snapshot);
      },
      fetchSnapshotFile: async (token, fileId) => {
        const blob = this.shares.get(token)?.files.get(fileId);
        if (!blob) throw new Error('missing');
        return blob;
      },
      unpublish: async (token) => {
        if (this.shares.get(token)?.owner === me()) this.shares.delete(token);
      },
      myShares: async (): Promise<PublishedShare[]> =>
        [...this.shares.entries()]
          .filter(([, s]) => s.owner === me())
          .map(([token, s]) => ({
            token,
            title: s.snapshot.title,
            rootId: s.snapshot.rootId,
            scopeLabel: s.scopeLabel,
            updatedAt: s.updatedAt,
          })),
      createSpace: async (name, rootId) => {
        const id = this.nextId('space');
        this.spaces.set(id, { name, rootId, ownerId: me(), members: new Map([[me(), 'owner']]) });
        return info(id, me());
      },
      createInvite: async (spaceId, role) => {
        if (this.role(spaceId, me()) !== 'owner') throw new Error('not allowed');
        const token = this.nextId('invite');
        this.invites.set(token, { spaceId, role });
        return token;
      },
      joinSpace: async (token) => {
        const invite = this.invites.get(token);
        if (!invite) throw new Error('Einladung ungültig');
        const space = this.spaces.get(invite.spaceId)!;
        if (!space.members.has(me())) space.members.set(me(), invite.role);
        return info(invite.spaceId, me());
      },
      mySpaces: async () =>
        [...this.spaces.keys()].filter((id) => this.role(id, me())).map((id) => info(id, me())),
      members: async (spaceId): Promise<SpaceMember[]> =>
        [...(this.spaces.get(spaceId)?.members ?? [])].map(([uid, role]) => ({
          userId: uid,
          email: `${uid}@example.com`,
          role,
        })),
      setMember: async (spaceId, uid, role) => {
        const space = this.spaces.get(spaceId);
        if (!space || space.ownerId !== me() || uid === me()) throw new Error('not allowed');
        if (role) space.members.set(uid, role);
        else space.members.delete(uid);
      },
      leaveSpace: async (spaceId) => {
        const space = this.spaces.get(spaceId);
        if (!space) return;
        if (space.ownerId === me()) {
          this.spaces.delete(spaceId);
          for (const [k, r] of this.rows) if (r.partition === `s:${spaceId}`) this.rows.delete(k);
        } else space.members.delete(me());
      },
      uploadSpaceFile: async (spaceId, id, blob) => {
        if (!this.role(spaceId, me())) throw new Error('not allowed');
        this.files.set(`spaces/${spaceId}/${id}`, blob);
      },
    };
  }
}
