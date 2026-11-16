import { createCardState, createRem } from '@core/model/factories';
import { rt } from '@core/richtext/ops';
import { Clock } from './clock';
import { Store } from './store';

/** Store with a deterministic clock. */
function makeStore(): Store {
  let t = 1000;
  return new Store(new Clock(() => t++));
}

describe('Store', () => {
  it('applies transactions atomically and notifies once', () => {
    const store = makeStore();
    const events: number[] = [];
    store.subscribe(() => events.push(store.version));
    store.transact((tx) => {
      tx.put('rems', createRem({ id: 'a', text: rt('A') }));
      tx.put('rems', createRem({ id: 'b', parentId: 'a', text: rt('B') }));
    });
    expect(events).toEqual([1]);
    expect(store.children(null).map((r) => r.id)).toEqual(['a']);
    expect(store.children('a').map((r) => r.id)).toEqual(['b']);
  });

  it('stamps updatedAt and supports update/delete', () => {
    const store = makeStore();
    store.transact((tx) => tx.put('rems', createRem({ id: 'a', updatedAt: 0 })));
    expect(store.get('a')!.updatedAt).toBeGreaterThan(0);
    store.transact((tx) => tx.update('rems', 'a', { pinned: true, heading: undefined }));
    expect(store.get('a')!.pinned).toBe(true);
    expect('heading' in store.get('a')!).toBe(false);
    store.transact((tx) => tx.delete('rems', 'a'));
    expect(store.get('a')).toBeUndefined();
    expect(store.children(null)).toEqual([]);
  });

  it('keeps children sorted and arrays immutable for callers', () => {
    const store = makeStore();
    store.transact((tx) => {
      tx.put('rems', createRem({ id: 'b', order: 'a1' }));
      tx.put('rems', createRem({ id: 'a', order: 'a0' }));
    });
    const first = store.children(null);
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
    store.transact((tx) => tx.put('rems', createRem({ id: 'c', order: 'Zz' })));
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
    expect(store.children(null).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('maintains backlinks and card indexes', () => {
    const store = makeStore();
    store.transact((tx) => {
      tx.put('rems', createRem({ id: 't' }));
      tx.put('rems', createRem({ id: 'x', text: [{ type: 'ref', remId: 't' }], tags: ['t'] }));
      tx.put('cards', { ...createCardState('x/f', 'x'), updatedAt: 1 });
    });
    expect(store.backlinks('t')).toEqual(['x']);
    expect(store.cardStateIds('x')).toEqual(['x/f']);
    store.transact((tx) => tx.update('rems', 'x', { text: [], tags: [] }));
    expect(store.backlinks('t')).toEqual([]);
  });

  it('undoes and redoes, coalescing typing', () => {
    const store = makeStore();
    store.transact((tx) => tx.put('rems', createRem({ id: 'a', text: rt('') })));
    store.transact((tx) => tx.update('rems', 'a', { text: rt('H') }), { coalesceKey: 'text:a' });
    store.transact((tx) => tx.update('rems', 'a', { text: rt('Hi') }), { coalesceKey: 'text:a' });
    expect(store.undo()).toBe(true);
    expect(store.get('a')!.text).toEqual([]);
    expect(store.redo()).toBe(true);
    expect(store.get('a')!.text).toEqual(rt('Hi'));
    store.undo();
    store.undo();
    expect(store.get('a')).toBeUndefined();
    expect(store.canUndo()).toBe(false);
  });

  it('does not record non-undoable or external changes', () => {
    const store = makeStore();
    store.transact((tx) => tx.put('rems', createRem({ id: 'a' })), { undoable: false });
    store.applyExternal([{ collection: 'rems', id: 'b', record: createRem({ id: 'b', updatedAt: 5 }), updatedAt: 5 }], 'remote');
    expect(store.canUndo()).toBe(false);
    expect(store.get('b')).toBeDefined();
  });

  it('resolves external conflicts with last-writer-wins', () => {
    const store = makeStore();
    store.transact((tx) => tx.put('rems', createRem({ id: 'a', text: rt('local') })));
    const localTime = store.get('a')!.updatedAt;
    store.applyExternal([{ collection: 'rems', id: 'a', record: createRem({ id: 'a', text: rt('old'), updatedAt: localTime - 1 }), updatedAt: localTime - 1 }], 'remote');
    expect(store.get('a')!.text).toEqual(rt('local'));
    store.applyExternal([{ collection: 'rems', id: 'a', record: createRem({ id: 'a', text: rt('new'), updatedAt: localTime + 100 }), updatedAt: localTime + 100 }], 'remote');
    expect(store.get('a')!.text).toEqual(rt('new'));
    // The clock moved past the remote timestamp.
    expect(store.clock.now()).toBeGreaterThan(localTime + 100);
    store.applyExternal([{ collection: 'rems', id: 'a', record: undefined, updatedAt: localTime + 10_000 }], 'remote');
    expect(store.get('a')).toBeUndefined();
  });

  it('memoises on dependencies', () => {
    const store = makeStore();
    let calls = 0;
    const read = () => store.memo('k', [store.collectionVersion('rems')], () => ++calls);
    read();
    read();
    expect(calls).toBe(1);
    store.transact((tx) => tx.put('rems', createRem({ id: 'a' })));
    read();
    expect(calls).toBe(2);
  });
});
