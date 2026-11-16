import { createRem } from '@core/model/factories';
import { DexieAdapter } from './dexie';

describe('DexieAdapter', () => {
  it('writes, loads and manages the outbox', async () => {
    const db = new DexieAdapter(`test-${Math.random()}`);
    const rem = createRem({ id: 'a', updatedAt: 5 });
    await db.write([{ collection: 'rems', id: 'a', before: undefined, after: rem }], true);
    expect((await db.loadAll()).rems).toEqual([rem]);
    const box = await db.outbox(10);
    expect(box).toEqual([
      { key: 'rems:a', collection: 'rems', id: 'a', updatedAt: 5, deleted: false },
    ]);
    // A newer change keeps the entry even if the old one is acknowledged.
    await db.write(
      [{ collection: 'rems', id: 'a', before: rem, after: { ...rem, updatedAt: 6 } }],
      true,
    );
    await db.removeFromOutbox(box);
    expect(await db.outbox(10)).toHaveLength(1);
    await db.removeFromOutbox(await db.outbox(10));
    expect(await db.outbox(10)).toHaveLength(0);
    await db.write([{ collection: 'rems', id: 'a', before: rem, after: undefined }], false);
    expect((await db.loadAll()).rems).toEqual([]);
    await db.setMeta('k', 42);
    expect(await db.getMeta('k')).toBe(42);
    await db.putFile({
      id: 'f',
      name: 'x',
      mimeType: 'text/plain',
      size: 1,
      blob: new Blob(['x']),
      uploaded: false,
      createdAt: 1,
    });
    expect(await db.pendingFiles()).toHaveLength(1);
    await db.clear();
    expect(await db.getMeta('k')).toBeUndefined();
  });
});
