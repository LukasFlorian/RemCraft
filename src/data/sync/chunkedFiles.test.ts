import { describe, expect, it } from 'vitest';
import { completeFileIds, getChunked, putChunked } from './chunkedFiles';
import type { ObjectStore } from './chunkedFiles';

/** In-memory object store that rejects objects above `limit` bytes. */
function memoryStore(limit = Infinity): ObjectStore & { objects: Map<string, Blob> } {
  const objects = new Map<string, Blob>();
  return {
    objects,
    put: async (path, blob) => {
      if (blob.size > limit) throw new Error('The object exceeded the maximum allowed size');
      objects.set(path, blob);
    },
    get: async (path) => objects.get(path) ?? null,
  };
}

describe('chunked files', () => {
  it('stores small files unchanged', async () => {
    const store = memoryStore();
    await putChunked(store, 'u/a', new Blob(['hello']), 'text/plain', 10);
    expect([...store.objects.keys()]).toEqual(['u/a']);
    expect(await (await getChunked(store, 'u/a'))!.text()).toBe('hello');
  });

  it('splits files above the limit and joins them again', async () => {
    // Parts are 10 bytes; the limit leaves room for the small manifest.
    const store = memoryStore(80);
    const text = 'abcdefghijklmnopqrstuvwxyz';
    await putChunked(store, 'u/big', new Blob([text]), 'application/pdf', 10);
    expect([...store.objects.keys()]).toEqual([
      'u/big.part0',
      'u/big.part1',
      'u/big.part2',
      'u/big.parts',
    ]);
    const blob = await getChunked(store, 'u/big');
    expect(blob!.type).toBe('application/pdf');
    expect(await blob!.text()).toBe(text);
    expect(completeFileIds(['big.part0', 'big.part1', 'big.part2', 'big.parts', 'small'])).toEqual([
      'big',
      'small',
    ]);
  });

  it('treats a split file without manifest as missing and reports missing parts', async () => {
    const store = memoryStore();
    await putChunked(store, 'x', new Blob(['0123456789ab']), 'application/pdf', 5);
    store.objects.delete('x.part1');
    await expect(getChunked(store, 'x')).rejects.toThrow('unvollständig');
    store.objects.delete('x.parts');
    expect(await getChunked(store, 'x')).toBeNull();
    expect(completeFileIds(['x.part0', 'x.part2'])).toEqual([]);
  });
});
