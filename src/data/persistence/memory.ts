/**
 * In-memory {@link PersistenceAdapter} for tests and as a fallback when
 * IndexedDB is unavailable (e.g. some private browsing modes).
 */
import type { CollectionName } from '@core/model/types';
import type { Change, RecordOf } from '../store/store';
import type { CollectionData, OutboxEntry, PersistenceAdapter, StoredFile } from './adapter';
import { emptyData, outboxEntryOf } from './adapter';

/** Volatile persistence backed by maps. */
export class MemoryAdapter implements PersistenceAdapter {
  private readonly records = new Map<CollectionName, Map<string, RecordOf<CollectionName>>>();
  private readonly box = new Map<string, OutboxEntry>();
  private readonly meta = new Map<string, unknown>();
  private readonly files = new Map<string, StoredFile>();

  async loadAll(): Promise<CollectionData> {
    const data = emptyData();
    for (const [name, map] of this.records) (data[name] as RecordOf<CollectionName>[]).push(...map.values());
    return data;
  }

  async write(changes: readonly Change[], addToOutbox: boolean): Promise<void> {
    for (const c of changes) {
      const map = this.records.get(c.collection) ?? new Map();
      if (c.after) map.set(c.id, c.after);
      else map.delete(c.id);
      this.records.set(c.collection, map);
      if (addToOutbox) {
        const entry = outboxEntryOf(c);
        this.box.set(entry.key, entry);
      }
    }
  }

  async outbox(limit: number): Promise<OutboxEntry[]> {
    return [...this.box.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit);
  }

  async removeFromOutbox(entries: readonly OutboxEntry[]): Promise<void> {
    for (const e of entries) {
      if (this.box.get(e.key)?.updatedAt === e.updatedAt) this.box.delete(e.key);
    }
  }

  async enqueueAll(): Promise<void> {
    for (const [collection, map] of this.records) {
      for (const r of map.values()) {
        this.box.set(`${collection}:${r.id}`, { key: `${collection}:${r.id}`, collection, id: r.id, updatedAt: r.updatedAt, deleted: false });
      }
    }
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.meta.get(key) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, value);
  }

  async putFile(file: StoredFile): Promise<void> {
    this.files.set(file.id, file);
  }

  async getFile(id: string): Promise<StoredFile | undefined> {
    return this.files.get(id);
  }

  async pendingFiles(): Promise<StoredFile[]> {
    return [...this.files.values()].filter((f) => !f.uploaded);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.box.clear();
    this.meta.clear();
    this.files.clear();
  }
}
