/**
 * Remote backend port used by the sync engine. The production implementation
 * is Supabase (see `supabase.ts`); tests use an in-memory fake.
 */
import type { CollectionName } from '@core/model/types';

/** A row of the generic `records` table. */
export interface RemoteRow {
  collection: CollectionName;
  id: string;
  /** Record JSON; `null` for deleted records. */
  data: unknown;
  deleted: boolean;
  /** Last-writer-wins timestamp (ms). */
  updated_at: number;
  /** Shared space (`null`/absent = the user's personal partition). */
  space?: string | null;
}

/** A row as returned by a pull, with the server's change sequence number. */
export interface PulledRow extends RemoteRow {
  seq: number;
}

/** Server operations needed for synchronisation. */
export interface RemoteBackend {
  /** Rows changed after `sinceSeq`, ordered by `seq`. */
  pull(sinceSeq: number, limit: number): Promise<PulledRow[]>;
  /** Upserts rows; the server keeps the row with the newest `updated_at`. */
  push(rows: readonly RemoteRow[]): Promise<void>;
  /** Notifies about remote changes (realtime); returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
  /** Uploads a file; returns once stored. */
  uploadFile(id: string, blob: Blob, mimeType: string): Promise<void>;
  /** Downloads a file. */
  downloadFile(id: string): Promise<Blob>;
}
