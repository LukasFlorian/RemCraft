/**
 * Synchronisation engine (local-first, last-writer-wins per record).
 *
 * - **Push**: drains the persistent outbox and upserts the current version
 *   of each record (or a tombstone) to the server.
 * - **Pull**: fetches every row whose server sequence number is greater than
 *   the last one seen and applies it unless the local copy is newer.
 * - Triggers: local writes (debounced), realtime notifications, a periodic
 *   poll, the browser coming back online and an explicit "sync now".
 *
 * The engine never blocks the UI: all edits happen locally first.
 */
import type { CollectionName } from '@core/model/types';
import type { PersistenceAdapter } from '../persistence/adapter';
import type { RecordOf, Store } from '../store/store';
import type { RemoteBackend, RemoteRow } from './remote';

/** Observable sync status. */
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'disabled';
  lastSyncedAt: number | null;
  error: string | null;
  /** Records waiting for upload (approximate). */
  pending: number;
}

/** Meta key storing the last pulled sequence number. */
const SEQ_KEY = 'sync.lastSeq';
const BATCH = 500;

/** Options of {@link SyncEngine}. */
export interface SyncEngineOptions {
  /** Debounce for pushes after local edits (ms). */
  pushDelay?: number;
  /** Fallback polling interval (ms). */
  pollInterval?: number;
}

/** Pushes and pulls records between the local store and a remote backend. */
export class SyncEngine {
  private status: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null, pending: 0 };
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private cleanup: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly persistence: PersistenceAdapter,
    private readonly remote: RemoteBackend,
    private readonly options: SyncEngineOptions = {},
  ) {}

  /** Starts automatic synchronisation. */
  start(): void {
    this.cleanup.push(this.remote.subscribe(() => void this.syncNow()));
    const poll = this.options.pollInterval ?? 60_000;
    if (poll > 0) {
      this.pollTimer = setInterval(() => void this.syncNow(), poll);
      this.cleanup.push(() => this.pollTimer && clearInterval(this.pollTimer));
    }
    if (typeof window !== 'undefined') {
      const online = (): void => void this.syncNow();
      window.addEventListener('online', online);
      this.cleanup.push(() => window.removeEventListener('online', online));
    }
    void this.syncNow();
  }

  /** Stops all timers and subscriptions. */
  stop(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    if (this.pushTimer) clearTimeout(this.pushTimer);
  }

  /** Schedules a push shortly after local edits (debounced). */
  schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.syncNow(), this.options.pushDelay ?? 800);
  }

  /** Current status. */
  getStatus(): SyncStatus {
    return this.status;
  }

  /** Subscribes to status changes. */
  onStatus(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Runs a full push + pull cycle. Concurrent calls are coalesced into one
   * follow-up run.
   */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.cycle();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  private async cycle(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus({ state: 'offline' });
      return;
    }
    this.setStatus({ state: 'syncing', error: null });
    try {
      await this.push();
      await this.pull();
      await this.pushFiles();
      const pending = (await this.persistence.outbox(BATCH)).length;
      this.setStatus({ state: 'idle', lastSyncedAt: Date.now(), pending });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: 'error', error: message });
    }
  }

  /** Uploads the outbox in batches. */
  private async push(): Promise<void> {
    for (;;) {
      const entries = await this.persistence.outbox(BATCH);
      if (entries.length === 0) return;
      const rows: RemoteRow[] = entries.map((e) => {
        const record = this.store.getRecord(e.collection, e.id);
        if (!record || e.deleted) {
          return { collection: e.collection, id: e.id, data: null, deleted: true, updated_at: e.updatedAt };
        }
        return { collection: e.collection, id: e.id, data: record, deleted: false, updated_at: record.updatedAt };
      });
      await this.remote.push(rows);
      await this.persistence.removeFromOutbox(entries);
      if (entries.length < BATCH) return;
    }
  }

  /** Downloads and applies remote changes. */
  private async pull(): Promise<void> {
    let since = (await this.persistence.getMeta<number>(SEQ_KEY)) ?? 0;
    for (;;) {
      const rows = await this.remote.pull(since, BATCH);
      if (rows.length === 0) return;
      // Never overwrite local changes that are still waiting for upload.
      const pending = new Map((await this.persistence.outbox(100_000)).map((e) => [e.key, e.updatedAt]));
      const items = rows
        .filter((r) => (pending.get(`${r.collection}:${r.id}`) ?? -1) < r.updated_at)
        .map((r) => ({
          collection: r.collection as CollectionName,
          id: r.id,
          record: r.deleted ? undefined : (r.data as RecordOf<CollectionName>),
          updatedAt: r.updated_at,
        }));
      if (items.length > 0) this.store.applyExternal(items, 'remote');
      since = Math.max(since, ...rows.map((r) => r.seq));
      await this.persistence.setMeta(SEQ_KEY, since);
      if (rows.length < BATCH) return;
    }
  }

  /** Uploads files that only exist locally. */
  private async pushFiles(): Promise<void> {
    for (const file of await this.persistence.pendingFiles()) {
      await this.remote.uploadFile(file.id, file.blob, file.mimeType);
      await this.persistence.putFile({ ...file, uploaded: true });
    }
  }
}
