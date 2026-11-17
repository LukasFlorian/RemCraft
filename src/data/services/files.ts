/**
 * Binary files (images, PDFs): stored locally in IndexedDB and, when signed
 * in, uploaded to Supabase Storage by the sync engine. Rems reference files
 * as `file:<id>`, which is resolved to an object URL on demand.
 */
import { newId } from '@core/util/ids';
import type { PersistenceAdapter } from '../persistence/adapter';
import type { RemoteBackend } from '../sync/remote';

/** Prefix of file references. */
export const FILE_PREFIX = 'file:';

/** Local + remote file storage. */
export class FileService {
  private readonly urls = new Map<string, string>();
  /** Remote backend (set while signed in). */
  remote: RemoteBackend | null = null;

  constructor(private readonly persistence: PersistenceAdapter) {}

  /**
   * Stores a file and returns its reference.
   *
   * @param file Browser file or blob.
   * @param name File name.
   */
  async save(file: Blob, name = 'file'): Promise<string> {
    const id = newId();
    await this.persistence.putFile({
      id,
      name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
      uploaded: false,
      createdAt: Date.now(),
    });
    return FILE_PREFIX + id;
  }

  /**
   * Returns the blob of a stored file. Missing files are downloaded from the
   * own storage (when signed in) or, failing that, from `origin` - the public
   * copy of a file that came with a cloned share. A file fetched from its
   * origin is kept locally and copied into the own storage by the next sync.
   *
   * @param src `file:<id>`, data or http(s) source.
   * @param origin Public fallback URL of the file (cloned shares).
   */
  async blob(src: string, origin?: string): Promise<Blob | null> {
    if (!src.startsWith(FILE_PREFIX)) {
      const res = await fetch(src).catch(() => null);
      return res?.ok ? res.blob() : null;
    }
    const id = src.slice(FILE_PREFIX.length);
    const stored = await this.persistence.getFile(id);
    if (stored) return stored.blob;
    if (this.remote) {
      try {
        const blob = await this.remote.downloadFile(id);
        await this.persistence.putFile({
          id,
          name: id,
          mimeType: blob.type,
          size: blob.size,
          blob,
          uploaded: true,
          createdAt: Date.now(),
        });
        return blob;
      } catch {
        // Not in the own storage (yet): try the origin below.
      }
    }
    if (!origin) return null;
    const res = await fetch(origin).catch(() => null);
    if (!res?.ok) return null;
    const blob = await res.blob();
    await this.persistence.putFile({
      id,
      name: id,
      mimeType: blob.type,
      size: blob.size,
      blob,
      uploaded: false,
      createdAt: Date.now(),
    });
    return blob;
  }

  /**
   * Resolves a source (`file:<id>`, `data:` or `http(s):`) to a URL usable in
   * `<img>`/`<iframe>`. Missing local files are downloaded (see {@link blob}).
   */
  async resolve(src: string, origin?: string): Promise<string | null> {
    if (!src.startsWith(FILE_PREFIX)) return src;
    const id = src.slice(FILE_PREFIX.length);
    const cached = this.urls.get(id);
    if (cached) return cached;
    const blob = await this.blob(src, origin);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    return url;
  }
}
