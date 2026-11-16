import { rt, toPlainText } from '@core/richtext/ops';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';
import { FakeServer } from '../testing/fakeRemote';
import type { AuthUser } from './supabase';

const USER: AuthUser = { id: 'user-1', email: 'u@example.com' };

/** A "device": an app with its own local storage, connected to the server. */
async function device(server: FakeServer, seed = false): Promise<RemCraftApp> {
  const app = await RemCraftApp.create({
    persistence: new MemoryAdapter(),
    backend: null,
    seed,
    remoteFactory: () => server.client(),
  });
  await app.handleUser(USER);
  await app.syncNow();
  return app;
}

/** Lets debounced timers and pending promises run. */
async function settle(...apps: RemCraftApp[]): Promise<void> {
  for (let i = 0; i < 3; i++) {
    for (const a of apps) {
      await a.flush();
      await a.syncNow();
    }
  }
}

describe('multi-device sync', () => {
  it('propagates creates, edits and deletes between devices', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    const doc = a.rems.createDocument(null, 'Shared');
    await settle(a, b);
    expect(toPlainText(b.store.get(doc.id)!.text)).toBe('Shared');

    b.rems.update(doc.id, { text: rt('Edited on B') });
    await settle(b, a);
    expect(toPlainText(a.store.get(doc.id)!.text)).toBe('Edited on B');

    a.rems.delete([doc.id]);
    await settle(a, b);
    expect(b.store.get(doc.id)).toBeUndefined();
    a.dispose();
    b.dispose();
  });

  it('resolves concurrent edits with last-writer-wins', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    const doc = a.rems.createDocument(null, 'X');
    await settle(a, b);
    // Both edit offline; B edits later.
    a.rems.update(doc.id, { text: rt('from A') });
    await new Promise((r) => setTimeout(r, 5));
    b.rems.update(doc.id, { text: rt('from B') });
    await settle(a, b);
    expect(toPlainText(a.store.get(doc.id)!.text)).toBe('from B');
    expect(toPlainText(b.store.get(doc.id)!.text)).toBe('from B');
    a.dispose();
    b.dispose();
  });

  it('syncs reviews and uploads pre-existing local data on first sign-in', async () => {
    const server = new FakeServer();
    const offline = await RemCraftApp.create({
      persistence: new MemoryAdapter(),
      backend: null,
      seed: false,
      remoteFactory: () => server.client(),
    });
    const doc = offline.rems.createDocument(null, 'Made offline');
    const q = offline.rems.create(
      { parentId: doc.id },
      { text: rt('Q'), back: rt('A'), direction: 'forward' },
    );
    offline.practice.answer(`${q.id}/f`, 3, { now: Date.now(), durationMs: 1, mode: 'srs' });
    await offline.flush();
    await offline.handleUser(USER);
    await settle(offline);
    const other = await device(server);
    expect(other.store.get(doc.id)).toBeDefined();
    expect(other.store.count('logs')).toBe(1);
    expect(other.practice.stateOf(`${q.id}/f`)!.reps).toBe(1);
    offline.dispose();
    other.dispose();
  });

  it('reports sync status', async () => {
    const server = new FakeServer();
    const a = await device(server);
    expect(a.getAccount()).toMatchObject({ configured: true, user: USER });
    expect(a.getAccount().sync.state).toBe('idle');
    await a.signOut(true);
    expect(a.getAccount().user).toBeNull();
    expect(a.store.count('rems')).toBeGreaterThan(0); // re-seeded welcome document
    a.dispose();
  });
});
