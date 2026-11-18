/**
 * Large files in object storage, split into parts.
 *
 * Supabase Storage rejects objects above the project's upload limit (50 MB on
 * the free plan). Lecture PDFs are often bigger, so a file above
 * `CHUNK_SIZE` is stored as
 *
 *   <path>.part0, <path>.part1, …   the bytes, each at most CHUNK_SIZE
 *   <path>.parts                    manifest (written last, so it only exists
 *                                   once every part is there)
 *
 * Small files keep their plain `<path>`, so existing data and older app
 * versions keep working. Readers try `<path>` first, then the manifest.
 */

/** Size of one part (well below Supabase's 50 MB default limit). */
export const CHUNK_SIZE = 20 * 1024 * 1024;

/** Suffix of the manifest object. */
export const MANIFEST_SUFFIX = '.parts';

/** Content of the manifest object. */
export interface ChunkManifest {
  version: 1;
  /** Number of parts. */
  count: number;
  /** Size of the whole file in bytes. */
  size: number;
  /** MIME type of the whole file. */
  mimeType: string;
}

/** Minimal object store: one bucket folder, a public URL prefix, … */
export interface ObjectStore {
  /** Writes (or overwrites) an object. */
  put(path: string, blob: Blob, mimeType: string): Promise<void>;
  /** Reads an object, `null` when it does not exist. */
  get(path: string): Promise<Blob | null>;
}

/**
 * Name of part `index` of the file stored at `path`.
 *
 * Args:
 *   path: Object path of the whole file.
 *   index: Zero-based part number.
 */
export function partPath(path: string, index: number): string {
  return `${path}.part${index}`;
}

/**
 * Stores a file, split into parts when it is larger than `chunkSize`.
 *
 * Args:
 *   store: Target object store.
 *   path: Object path of the whole file.
 *   blob: File content.
 *   mimeType: MIME type of the file.
 *   chunkSize: Maximum size of one object (tests use small values).
 */
export async function putChunked(
  store: ObjectStore,
  path: string,
  blob: Blob,
  mimeType: string,
  chunkSize: number = CHUNK_SIZE,
): Promise<void> {
  if (blob.size <= chunkSize) {
    await store.put(path, blob, mimeType);
    return;
  }
  const count = Math.ceil(blob.size / chunkSize);
  for (let i = 0; i < count; i++) {
    const part = blob.slice(i * chunkSize, Math.min(blob.size, (i + 1) * chunkSize));
    await store.put(partPath(path, i), part, 'application/octet-stream');
  }
  // The manifest comes last: readers only see complete files.
  const manifest: ChunkManifest = { version: 1, count, size: blob.size, mimeType };
  await store.put(
    path + MANIFEST_SUFFIX,
    new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
    'application/json',
  );
}

/**
 * Reads a file stored with `putChunked` (plain or split).
 *
 * Args:
 *   store: Object store to read from.
 *   path: Object path of the whole file.
 *
 * Returns:
 *   The file, or `null` when neither the file nor a manifest exists.
 *
 * Raises:
 *   Error: When a manifest exists but a part is missing or the size differs.
 */
export async function getChunked(store: ObjectStore, path: string): Promise<Blob | null> {
  const direct = await store.get(path);
  if (direct) return direct;
  const raw = await store.get(path + MANIFEST_SUFFIX);
  if (!raw) return null;
  const manifest = JSON.parse(await raw.text()) as ChunkManifest;
  // Parts are fetched in parallel; order is kept by index.
  const parts = await Promise.all(
    Array.from({ length: manifest.count }, (_, i) => store.get(partPath(path, i))),
  );
  if (parts.some((p) => !p)) throw new Error('Datei unvollständig (Teil fehlt)');
  const blob = new Blob(parts as Blob[], { type: manifest.mimeType });
  if (blob.size !== manifest.size) throw new Error('Datei unvollständig (Größe stimmt nicht)');
  return blob;
}

/**
 * Ids of the complete files in a folder listing.
 *
 * Args:
 *   names: Object names in the folder.
 *
 * Returns:
 *   Plain files and split files whose manifest exists (parts are hidden).
 */
export function completeFileIds(names: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const name of names) {
    if (/\.part\d+$/.test(name)) continue;
    ids.add(name.endsWith(MANIFEST_SUFFIX) ? name.slice(0, -MANIFEST_SUFFIX.length) : name);
  }
  return [...ids];
}

/**
 * Object store over public URLs (`<prefix><path>`), read-only.
 *
 * Args:
 *   url: Maps an object path to its URL.
 */
export function urlStore(url: (path: string) => string): ObjectStore {
  return {
    put: () => Promise.reject(new Error('read-only')),
    get: async (path) => {
      const res = await fetch(url(path)).catch(() => null);
      return res?.ok ? res.blob() : null;
    },
  };
}
