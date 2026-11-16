import { SHARE_PRESETS } from '@core/sharing/scope';
import { rt, toPlainText } from '@core/richtext/ops';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';
import { selectCardIndex } from '../selectors';
import { FakeServer } from '../testing/fakeRemote';

/** An app signed in as `userId` on the fake server. */
async function user(server: FakeServer, userId: string): Promise<RemCraftApp> {
  const app = await RemCraftApp.create({
    persistence: new MemoryAdapter(),
    backend: null,
    seed: false,
    remoteFactory: (u) => server.client(u.id),
    shareFactory: (u) => server.share(u?.id ?? null),
  });
  await app.handleUser({ id: userId, email: null });
  await app.syncNow();
  return app;
}

async function settle(...apps: RemCraftApp[]): Promise<void> {
  for (let i = 0; i < 3; i++) {
    for (const a of apps) {
      await a.flush();
      await a.syncNow();
    }
  }
}

/** A course folder with a document, a note and a card. */
function course(app: RemCraftApp): { folder: string; doc: string; card: string } {
  const folder = app.rems.createFolder(null, 'ML');
  const doc = app.rems.createDocument(folder.id, 'VL 1');
  app.rems.create({ parentId: doc.id }, { text: rt('Notiz') });
  const card = app.rems.create(
    { parentId: doc.id },
    { text: rt('Lernrate'), back: rt('Schrittweite'), direction: 'forward' },
  );
  return { folder: folder.id, doc: doc.id, card: card.id };
}

describe('read-only shares', () => {
  it('publishes a scoped snapshot that others can clone', async () => {
    const server = new FakeServer();
    const owner = await user(server, 'alice');
    const { folder } = course(owner);
    const token = await owner.sharing.publish(folder, SHARE_PRESETS.cards.scope);

    const bob = await user(server, 'bob');
    const snap = await bob.sharing.fetch(token);
    expect(snap.rems.map((r) => toPlainText(r.text))).toEqual(['ML', 'VL 1', 'Lernrate']);
    const root = await bob.sharing.clonePublished(token, null);
    expect(bob.store.children(root)).toHaveLength(1);
    expect(selectCardIndex(bob.store).specs).toHaveLength(1);
    // Clones are independent: new ids.
    expect(bob.store.get(folder)).toBeUndefined();
    expect(await owner.sharing.myShares()).toHaveLength(1);
    owner.dispose();
    bob.dispose();
  });

  it('round-trips a snapshot file without an account', async () => {
    const a = await RemCraftApp.create({
      persistence: new MemoryAdapter(),
      backend: null,
      seed: false,
    });
    const { folder } = course(a);
    const file = await a.sharing.exportFile(folder, SHARE_PRESETS.all.scope);
    const b = await RemCraftApp.create({
      persistence: new MemoryAdapter(),
      backend: null,
      seed: false,
    });
    const root = await b.sharing.clone(await b.sharing.readFile(file), null);
    expect(toPlainText(b.store.get(root)!.text)).toBe('ML');
    a.dispose();
    b.dispose();
  });
});

describe('shared spaces', () => {
  it('synchronises a subtree live between members', async () => {
    const server = new FakeServer();
    const alice = await user(server, 'alice');
    const bob = await user(server, 'bob');
    const { folder, doc, card } = course(alice);
    const space = await alice.sharing.shareLive(folder);
    // The whole subtree moved into the space.
    expect(alice.store.get(card)!.spaceId).toBe(space.id);
    const invite = await alice.sharing.invite(space.id, 'writer');
    await settle(alice);

    await bob.sharing.join(invite);
    await settle(bob);
    // The shared root appears at Bob's top level (its parent is Alice's).
    expect(bob.store.children(null).map((r) => r.id)).toContain(folder);
    expect(selectCardIndex(bob.store).byRem.has(card)).toBe(true);

    // Bob adds a note: it inherits the space and reaches Alice.
    const note = bob.rems.create({ parentId: doc }, { text: rt('Von Bob') });
    expect(note.spaceId ?? bob.store.get(note.id)!.spaceId).toBe(space.id);
    await settle(bob, alice);
    expect(toPlainText(alice.store.get(note.id)!.text)).toBe('Von Bob');

    // Alice edits; Bob sees it.
    alice.rems.update(card, { text: rt('Lernrate η') });
    await settle(alice, bob);
    expect(toPlainText(bob.store.get(card)!.text)).toBe('Lernrate η');

    // Moving a Rem out of the shared subtree makes it personal again.
    alice.rems.move([note.id], { parentId: null });
    expect(alice.store.get(note.id)!.spaceId).toBeUndefined();

    // Learning progress stays personal.
    expect(server.rows.size).toBeGreaterThan(0);
    for (const row of server.rows.values())
      if (row.space) expect(['rems', 'annotations']).toContain(row.collection);
    alice.dispose();
    bob.dispose();
  });

  it('keeps read-only members from writing and leaves copies when sharing ends', async () => {
    const server = new FakeServer();
    const alice = await user(server, 'alice');
    const carol = await user(server, 'carol');
    const { folder, card } = course(alice);
    const space = await alice.sharing.shareLive(folder);
    await settle(alice);
    await carol.sharing.join(await alice.sharing.invite(space.id, 'reader'));
    await settle(carol);

    // Carol's local edit is not uploaded (and does not break her sync).
    carol.rems.update(card, { text: rt('Kaputt') });
    await settle(carol, alice);
    expect(toPlainText(alice.store.get(card)!.text)).toBe('Lernrate');
    expect(carol.getAccount().sync.state).not.toBe('error');

    // Alice stops sharing: her subtree is personal again, Carol keeps a copy.
    await alice.sharing.leave(space.id);
    expect(alice.store.get(card)!.spaceId).toBeUndefined();
    await carol.sharing.reconcile(true);
    expect(carol.store.get(card)!.spaceId).toBeUndefined();
    expect(carol.store.get(folder)).toBeDefined();
    alice.dispose();
    carol.dispose();
  });
});
