/**
 * Persistence port: how the app stores records locally.
 *
 * Two implementations exist: {@link DexieAdapter} (IndexedDB, production) and
 * {@link MemoryAdapter} (tests). The *outbox* lists records changed locally
 * that still have to be pushed to the server; it survives reloads, so offline
 * edits are never lost.
 */
import type { CollectionName } from '@core/model/types';
import type { Change, RecordOf } from '../store/store';

/** A pending upload. */
export interface OutboxEntry {
  /** `${collection}:${id}` */
  key: string;
  collection: CollectionName;
  id: string;
  /** Timestamp of the change (deletion time for deletes). */
  updatedAt: number;
  deleted: boolean;
}

/** A locally stored binary file (image, PDF). */
export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  /** True once the file exists in remote storage. */
  uploaded: boolean;
  createdAt: number;
}

/** All records grouped by collection. */
export type CollectionData = { [K in CollectionName]: RecordOf<K>[] };

/** Local persistence backend. */
export interface PersistenceAdapter {
  /** Loads every record. */
  loadAll(): Promise<CollectionData>;
  /**
   * Persists committed changes.
   *
   * @param changes Changes to write.
   * @param addToOutbox Also queue them for upload.
   */
  write(changes: readonly Change[], addToOutbox: boolean): Promise<void>;
  /** Oldest pending uploads. */
  outbox(limit: number): Promise<OutboxEntry[]>;
  /** Removes uploaded entries (only if they were not changed meanwhile). */
  removeFromOutbox(entries: readonly OutboxEntry[]): Promise<void>;
  /** Queues every stored record for upload (first sign-in with local data). */
  enqueueAll(): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  putFile(file: StoredFile): Promise<void>;
  getFile(id: string): Promise<StoredFile | undefined>;
  /** Files not yet uploaded. */
  pendingFiles(): Promise<StoredFile[]>;
  /** Deletes all local data. */
  clear(): Promise<void>;
}

/** Builds an outbox entry for a change. */
export function outboxEntryOf(change: Change): OutboxEntry {
  return {
    key: `${change.collection}:${change.id}`,
    collection: change.collection,
    id: change.id,
    updatedAt: change.after?.updatedAt ?? change.at ?? Date.now(),
    deleted: change.after === undefined,
  };
}

/** Empty collection data. */
export function emptyData(): CollectionData {
  return { rems: [], cards: [], logs: [], exams: [], schedulers: [], settings: [], annotations: [], lectures: [], lectureEvents: [] };
}
