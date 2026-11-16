/**
 * In-memory fake of the Supabase `records` table, used to test multi-device
 * synchronisation without a network. Mirrors the server-side trigger:
 * every accepted write gets a new sequence number, stale writes are ignored.
 */
import type { PulledRow, RemoteBackend, RemoteRow } from '../sync/remote';

/** Shared fake server (one per test, shared by several "devices"). */
export class FakeServer {
  private seq = 0;
  readonly rows = new Map<string, PulledRow>();
  readonly files = new Map<string, Blob>();
  private readonly listeners = new Set<() => void>();

  /** Creates a client for this server. */
  client(): RemoteBackend {
    return {
      pull: async (since, limit) => [...this.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit),
      push: async (rows: readonly RemoteRow[]) => {
        for (const row of rows) {
          const key = `${row.collection}:${row.id}`;
          const existing = this.rows.get(key);
          if (existing && row.updated_at < existing.updated_at) continue;
          this.rows.set(key, { ...structuredClone(row), seq: ++this.seq });
        }
        for (const l of this.listeners) l();
      },
      subscribe: (onChange) => {
        this.listeners.add(onChange);
        return () => this.listeners.delete(onChange);
      },
      uploadFile: async (id, blob) => void this.files.set(id, blob),
      downloadFile: async (id) => {
        const blob = this.files.get(id);
        if (!blob) throw new Error('missing');
        return blob;
      },
    };
  }
}
