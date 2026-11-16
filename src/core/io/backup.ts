/**
 * Full JSON backup of all collections (lossless export/import).
 */
import type { CollectionName, CollectionTypes, Timestamp } from '../model/types';

/** Current backup format version. */
export const BACKUP_VERSION = 1;

/** A complete backup. */
export interface Backup {
  format: 'remcraft-backup';
  version: number;
  exportedAt: Timestamp;
  collections: { [K in CollectionName]: CollectionTypes[K][] };
}

/** All collection names in dependency order. */
export const COLLECTIONS: readonly CollectionName[] = [
  'settings',
  'schedulers',
  'rems',
  'cards',
  'logs',
  'exams',
  'annotations',
  'lectures',
  'lectureEvents',
];

/**
 * Creates a backup object.
 *
 * @param collections Records per collection.
 * @param now Export time.
 */
export function createBackup(
  collections: Backup['collections'],
  now: Timestamp = Date.now(),
): Backup {
  return { format: 'remcraft-backup', version: BACKUP_VERSION, exportedAt: now, collections };
}

/**
 * Parses and validates a backup.
 *
 * @throws Error when the JSON is not a RemCraft backup.
 */
export function parseBackup(json: string): Backup {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.format !== 'remcraft-backup') throw new Error('Not a RemCraft backup file.');
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${String(data.version)}.`);
  }
  const collections = data.collections ?? ({} as Backup['collections']);
  for (const name of COLLECTIONS) {
    const list = (collections as Record<string, unknown>)[name];
    if (list !== undefined && !Array.isArray(list))
      throw new Error(`Invalid collection "${name}".`);
    (collections as Record<string, unknown>)[name] = list ?? [];
  }
  for (const rem of collections.rems) {
    if (typeof rem.id !== 'string' || !Array.isArray(rem.text))
      throw new Error('Invalid Rem in backup.');
  }
  return {
    format: 'remcraft-backup',
    version: data.version,
    exportedAt: data.exportedAt ?? 0,
    collections,
  };
}
