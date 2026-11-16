/**
 * IndexedDB persistence via Dexie.
 */
import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { CardState, CollectionName, Exam, Rem, ReviewLog, SchedulerConfig, Settings } from '@core/model/types';
import type { Change, RecordOf } from '../store/store';
import type { CollectionData, OutboxEntry, PersistenceAdapter, StoredFile } from './adapter';
import { outboxEntryOf } from './adapter';

/** Dexie database schema. */
class RemCraftDatabase extends Dexie {
  rems!: Table<Rem, string>;
  cards!: Table<CardState, string>;
  logs!: Table<ReviewLog, string>;
  exams!: Table<Exam, string>;
  schedulers!: Table<SchedulerConfig, string>;
  settings!: Table<Settings, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  files!: Table<StoredFile, string>;

  constructor(name: string) {
    super(name);
    // Schema version 1. Add a new `version(n)` block (never edit this one)
    // when indexes change; Dexie migrates automatically.
    this.version(1).stores({
      rems: 'id',
      cards: 'id',
      logs: 'id',
      exams: 'id',
      schedulers: 'id',
      settings: 'id',
      outbox: 'key, updatedAt',
      meta: 'key',
      files: 'id, uploaded',
    });
  }
}

const COLLECTIONS: readonly CollectionName[] = ['rems', 'cards', 'logs', 'exams', 'schedulers', 'settings'];

/** IndexedDB-backed {@link PersistenceAdapter}. */
export class DexieAdapter implements PersistenceAdapter {
  private readonly db: RemCraftDatabase;

  /**
   * @param name Database name (one per installation).
   */
  constructor(name = 'remcraft') {
    this.db = new RemCraftDatabase(name);
  }

  /** Typed access to a collection table. */
  private table(name: CollectionName): Table<RecordOf<CollectionName>, string> {
    return this.db.table(name);
  }

  async loadAll(): Promise<CollectionData> {
    const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, await this.table(c).toArray()] as const));
    return Object.fromEntries(entries) as unknown as CollectionData;
  }

  async write(changes: readonly Change[], addToOutbox: boolean): Promise<void> {
    const tables = [...COLLECTIONS.map((c) => this.table(c)), this.db.outbox];
    await this.db.transaction('rw', tables, async () => {
      for (const c of changes) {
        if (c.after) await this.table(c.collection).put(c.after);
        else await this.table(c.collection).delete(c.id);
      }
      if (addToOutbox) await this.db.outbox.bulkPut(changes.map(outboxEntryOf));
    });
  }

  async outbox(limit: number): Promise<OutboxEntry[]> {
    return this.db.outbox.orderBy('updatedAt').limit(limit).toArray();
  }

  async removeFromOutbox(entries: readonly OutboxEntry[]): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const e of entries) {
        const current = await this.db.outbox.get(e.key);
        if (current?.updatedAt === e.updatedAt) await this.db.outbox.delete(e.key);
      }
    });
  }

  async enqueueAll(): Promise<void> {
    for (const c of COLLECTIONS) {
      const records = await this.table(c).toArray();
      await this.db.outbox.bulkPut(
        records.map((r) => ({ key: `${c}:${r.id}`, collection: c, id: r.id, updatedAt: r.updatedAt, deleted: false })),
      );
    }
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async putFile(file: StoredFile): Promise<void> {
    await this.db.files.put(file);
  }

  async getFile(id: string): Promise<StoredFile | undefined> {
    return this.db.files.get(id);
  }

  async pendingFiles(): Promise<StoredFile[]> {
    return (await this.db.files.toArray()).filter((f) => !f.uploaded);
  }

  async clear(): Promise<void> {
    await Promise.all([...COLLECTIONS.map((c) => this.table(c).clear()), this.db.outbox.clear(), this.db.meta.clear(), this.db.files.clear()]);
  }
}
