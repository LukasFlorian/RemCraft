/**
 * In-memory, observable record store with transactions and undo/redo.
 *
 * The whole knowledge base lives in memory (a few MB even for large bases),
 * which keeps every read synchronous and the outliner fast. Persistence and
 * synchronisation subscribe to committed changes (see `onCommit`), so the
 * store itself knows nothing about IndexedDB or Supabase.
 *
 * The store also implements {@link RemGraph} so all domain algorithms can run
 * directly against it.
 */
import type { RemGraph } from '@core/model/graph';
import { compareOrder } from '@core/model/ordering';
import type { CardId, CollectionName, CollectionTypes, Rem, RemId } from '@core/model/types';
import { referencedRemIds } from '@core/richtext/ops';
import { parseCardId } from '@core/cards/generate';
import { Clock } from './clock';

/** Record type of a collection. */
export type RecordOf<K extends CollectionName> = CollectionTypes[K];

/** One change of one record. `before`/`after` are `undefined` for create/delete. */
export interface Change<K extends CollectionName = CollectionName> {
  collection: K;
  id: string;
  before: RecordOf<K> | undefined;
  after: RecordOf<K> | undefined;
}

/** Where a change came from. Persistence and sync react differently. */
export type ChangeOrigin = 'local' | 'undo' | 'redo' | 'remote' | 'tab' | 'load';

/** A committed batch of changes. */
export interface CommitEvent {
  changes: readonly Change[];
  origin: ChangeOrigin;
}

/** Options of {@link Store.transact}. */
export interface TransactOptions {
  /** Add to the undo history (default: true for local changes). */
  undoable?: boolean;
  /**
   * Consecutive undoable transactions with the same key (within 1.5 s) are
   * merged into a single undo step - used for typing.
   */
  coalesceKey?: string;
  origin?: ChangeOrigin;
  /** Keep the `updatedAt` of written records (remote data, imports). */
  keepTimestamps?: boolean;
}

/** Entry of the undo/redo history. */
interface UndoEntry {
  changes: Change[];
  key: string | undefined;
  time: number;
}

/** Shared empty child list (stable identity for React snapshots). */
const EMPTY_CHILDREN: readonly Rem[] = Object.freeze([]);

/** All collection names. */
const COLLECTION_NAMES: readonly CollectionName[] = [
  'rems',
  'cards',
  'logs',
  'exams',
  'schedulers',
  'settings',
];

/** Key of a record inside a transaction. */
const keyOf = (c: CollectionName, id: string): string => `${c}\u0000${id}`;

/**
 * Write handle passed to transaction callbacks. Reads see the transaction's
 * own pending writes.
 */
export class Transaction {
  constructor(
    private readonly store: Store,
    private readonly pending: Map<string, Change>,
    private readonly options: TransactOptions,
  ) {}

  /** Reads a record (including pending writes of this transaction). */
  get<K extends CollectionName>(collection: K, id: string): RecordOf<K> | undefined {
    const p = this.pending.get(keyOf(collection, id));
    return p ? (p.after as RecordOf<K> | undefined) : this.store.getRecord(collection, id);
  }

  /** Creates or replaces a record. */
  put<K extends CollectionName>(collection: K, record: RecordOf<K>): RecordOf<K> {
    const stamped = this.options.keepTimestamps
      ? record
      : ({ ...record, updatedAt: this.store.clock.now() } as RecordOf<K>);
    const key = keyOf(collection, record.id);
    const prev = this.pending.get(key);
    const before = prev ? prev.before : this.store.getRecord(collection, record.id);
    this.pending.set(key, { collection, id: record.id, before, after: stamped } as Change);
    return stamped;
  }

  /**
   * Shallow-merges a patch into an existing record.
   *
   * @returns The updated record, or `undefined` when it does not exist.
   */
  update<K extends CollectionName>(
    collection: K,
    id: string,
    patch: Partial<RecordOf<K>>,
  ): RecordOf<K> | undefined {
    const current = this.get(collection, id);
    if (!current) return undefined;
    const next = { ...current, ...patch } as RecordOf<K>;
    // Remove keys explicitly set to undefined so records stay compact.
    for (const [k, v] of Object.entries(patch))
      if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
    return this.put(collection, next);
  }

  /** Deletes a record (no-op when missing). */
  delete<K extends CollectionName>(collection: K, id: string): void {
    const key = keyOf(collection, id);
    const prev = this.pending.get(key);
    const before = prev ? prev.before : this.store.getRecord(collection, id);
    if (!before && !prev) return;
    this.pending.set(key, { collection, id, before, after: undefined } as Change);
  }
}

/** The application's record store. */
export class Store implements RemGraph {
  /** Record maps per collection. */
  private readonly data: { [K in CollectionName]: Map<string, RecordOf<K>> } = {
    rems: new Map(),
    cards: new Map(),
    logs: new Map(),
    exams: new Map(),
    schedulers: new Map(),
    settings: new Map(),
  };
  /** Per-collection change counters (for memoisation). */
  private readonly versions: Record<CollectionName, number> = {
    rems: 0,
    cards: 0,
    logs: 0,
    exams: 0,
    schedulers: 0,
    settings: 0,
  };
  /** Global change counter (the React snapshot). */
  private globalVersion = 0;

  private readonly listeners = new Set<() => void>();
  private readonly commitHandlers = new Set<(e: CommitEvent) => void>();
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  // --- indexes -------------------------------------------------------------
  private readonly childIndex = new Map<RemId | null, Rem[]>();
  private readonly unsortedParents = new Set<RemId | null>();
  /** Child lists created during the current batch (safe to mutate in place). */
  private readonly freshLists = new Set<Rem[]>();
  private readonly backlinkIndex = new Map<RemId, Set<RemId>>();
  private readonly cardIndex = new Map<RemId, Set<CardId>>();
  private readonly memoCache = new Map<string, { deps: readonly unknown[]; value: unknown }>();
  private readonly allCache = new Map<CollectionName, { version: number; list: unknown[] }>();

  /** Clock used to stamp records. */
  readonly clock: Clock;

  constructor(clock: Clock = new Clock()) {
    this.clock = clock;
  }

  // =========================================================================
  // Reads
  // =========================================================================

  /** Global version; changes after every commit. */
  get version(): number {
    return this.globalVersion;
  }

  /** Version of one collection. */
  collectionVersion(collection: CollectionName): number {
    return this.versions[collection];
  }

  /** Reads a record. */
  getRecord<K extends CollectionName>(collection: K, id: string): RecordOf<K> | undefined {
    return this.data[collection].get(id) as RecordOf<K> | undefined;
  }

  /** All records of a collection (cached array, do not mutate). */
  all<K extends CollectionName>(collection: K): readonly RecordOf<K>[] {
    const cached = this.allCache.get(collection);
    if (cached && cached.version === this.versions[collection]) return cached.list as RecordOf<K>[];
    const list = [...this.data[collection].values()] as RecordOf<K>[];
    this.allCache.set(collection, { version: this.versions[collection], list });
    return list;
  }

  /** Number of records in a collection. */
  count(collection: CollectionName): number {
    return this.data[collection].size;
  }

  /** {@link RemGraph.get}. */
  get(id: RemId): Rem | undefined {
    return this.data.rems.get(id);
  }

  /** {@link RemGraph.children} - ordered children of a Rem. */
  children(id: RemId | null): readonly Rem[] {
    const list = this.childIndex.get(id);
    if (!list) return EMPTY_CHILDREN;
    if (this.unsortedParents.has(id)) {
      list.sort(compareOrder);
      this.unsortedParents.delete(id);
    }
    return list;
  }

  /** Rems whose text, back or tags reference `id`. */
  backlinks(id: RemId): readonly RemId[] {
    return [...(this.backlinkIndex.get(id) ?? [])];
  }

  /** Ids of persisted card states belonging to a Rem. */
  cardStateIds(remId: RemId): readonly CardId[] {
    return [...(this.cardIndex.get(remId) ?? [])];
  }

  /**
   * Memoises a derived value on explicit dependencies (usually collection
   * versions). Selectors use it to avoid recomputation on every render.
   */
  memo<T>(key: string, deps: readonly unknown[], compute: () => T): T {
    const hit = this.memoCache.get(key);
    if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => Object.is(d, deps[i])))
      return hit.value as T;
    const value = compute();
    // Bound the cache (keys such as search queries are open-ended).
    if (this.memoCache.size > 1000) this.memoCache.clear();
    this.memoCache.set(key, { deps, value });
    return value;
  }

  // =========================================================================
  // Writes
  // =========================================================================

  /**
   * Runs `fn` as a transaction. All writes are applied atomically, then
   * subscribers are notified once.
   *
   * @returns Whatever `fn` returns.
   */
  transact<T>(fn: (tx: Transaction) => T, options: TransactOptions = {}): T {
    const pending = new Map<string, Change>();
    const result = fn(new Transaction(this, pending, options));
    const changes = [...pending.values()].filter(
      (c) => c.before !== undefined || c.after !== undefined,
    );
    if (changes.length === 0) return result;
    const origin = options.origin ?? 'local';
    this.applyChanges(changes);
    if (origin === 'local' && options.undoable !== false)
      this.recordUndo(changes, options.coalesceKey);
    this.emit({ changes, origin });
    return result;
  }

  /**
   * Bulk-loads records (initial load from IndexedDB). Does not notify commit
   * handlers, so nothing is written back.
   */
  load(records: Partial<{ [K in CollectionName]: RecordOf<K>[] }>): void {
    const changes: Change[] = [];
    for (const name of COLLECTION_NAMES) {
      for (const record of (records[name] ?? []) as RecordOf<CollectionName>[]) {
        changes.push({
          collection: name,
          id: record.id,
          before: this.getRecord(name, record.id),
          after: record,
        } as Change);
        this.clock.observe(record.updatedAt);
      }
    }
    if (changes.length === 0) return;
    this.applyChanges(changes);
    this.emit({ changes, origin: 'load' });
  }

  /**
   * Applies records received from another tab or device. Remote records with
   * an older timestamp than the local copy are ignored (last writer wins).
   *
   * @param items Records (`record` undefined = deleted).
   * @param origin `remote` (server) or `tab` (another browser tab).
   * @returns The changes that were applied.
   */
  applyExternal(
    items: readonly {
      collection: CollectionName;
      id: string;
      record: RecordOf<CollectionName> | undefined;
      updatedAt: number;
    }[],
    origin: 'remote' | 'tab',
  ): Change[] {
    return this.transact(
      (tx) => {
        for (const item of items) {
          this.clock.observe(item.updatedAt);
          const local = this.getRecord(item.collection, item.id);
          // Ties keep the local copy (it is usually the very same record echoed back).
          if (local && local.updatedAt >= item.updatedAt) continue;
          if (item.record) tx.put(item.collection, item.record);
          else tx.delete(item.collection, item.id);
        }
        return [];
      },
      { origin, keepTimestamps: true, undoable: false },
    );
  }

  /** Removes all records (sign-out, reset). */
  clear(): void {
    const changes: Change[] = [];
    for (const name of COLLECTION_NAMES) {
      for (const record of this.data[name].values())
        changes.push({
          collection: name,
          id: record.id,
          before: record,
          after: undefined,
        } as Change);
    }
    this.undoStack = [];
    this.redoStack = [];
    if (changes.length === 0) return;
    this.applyChanges(changes);
    this.emit({ changes, origin: 'load' });
  }

  // =========================================================================
  // Undo / redo
  // =========================================================================

  /** True when there is something to undo. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** True when there is something to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Reverts the last undoable transaction. */
  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.revert(entry.changes, 'undo');
    this.redoStack.push(entry);
    return true;
  }

  /** Re-applies the last undone transaction. */
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.transact(
      (tx) => {
        for (const c of entry.changes) {
          if (c.after) tx.put(c.collection, c.after);
          else tx.delete(c.collection, c.id);
        }
      },
      { origin: 'redo', undoable: false },
    );
    this.undoStack.push(entry);
    return true;
  }

  /** Applies the inverse of `changes`. */
  private revert(changes: readonly Change[], origin: ChangeOrigin): void {
    this.transact(
      (tx) => {
        for (let i = changes.length - 1; i >= 0; i--) {
          const c = changes[i]!;
          if (c.before) tx.put(c.collection, c.before);
          else tx.delete(c.collection, c.id);
        }
      },
      { origin, undoable: false },
    );
  }

  /** Pushes an undo entry, merging typing bursts. */
  private recordUndo(changes: Change[], key: string | undefined): void {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (key && top && top.key === key && now - top.time < 1500) {
      // Merge: keep the oldest `before`, take the newest `after`.
      for (const c of changes) {
        const existing = top.changes.find((e) => e.collection === c.collection && e.id === c.id);
        if (existing) existing.after = c.after;
        else top.changes.push(c);
      }
      top.time = now;
    } else {
      this.undoStack.push({ changes: [...changes], key, time: now });
      if (this.undoStack.length > 300) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  /** Subscribes to any change (React `useSyncExternalStore`). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Subscribes to committed change batches (persistence, sync). */
  onCommit(handler: (e: CommitEvent) => void): () => void {
    this.commitHandlers.add(handler);
    return () => this.commitHandlers.delete(handler);
  }

  private emit(event: CommitEvent): void {
    this.globalVersion++;
    for (const h of this.commitHandlers) h(event);
    for (const l of this.listeners) l();
  }

  // =========================================================================
  // Index maintenance
  // =========================================================================

  private applyChanges(changes: readonly Change[]): void {
    this.freshLists.clear();
    for (const change of changes) {
      const map = this.data[change.collection] as Map<string, RecordOf<CollectionName>>;
      const current = map.get(change.id);
      if (change.after) map.set(change.id, change.after);
      else map.delete(change.id);
      this.versions[change.collection]++;
      if (change.collection === 'rems')
        this.indexRem(current as Rem | undefined, change.after as Rem | undefined);
      if (change.collection === 'cards') this.indexCard(change.id, change.after !== undefined);
    }
  }

  /**
   * Updates the child and backlink indexes. Child lists are copy-on-write so
   * arrays handed out by {@link children} never change under the caller.
   */
  private indexRem(before: Rem | undefined, after: Rem | undefined): void {
    if (before) {
      const list = this.ownedList(before.parentId);
      const i = list.findIndex((r) => r.id === before.id);
      if (i !== -1) list.splice(i, 1);
      for (const target of this.linksOf(before)) this.backlinkIndex.get(target)?.delete(before.id);
    }
    if (after) {
      this.ownedList(after.parentId).push(after);
      this.unsortedParents.add(after.parentId);
      for (const target of this.linksOf(after)) {
        const set = this.backlinkIndex.get(target) ?? new Set();
        set.add(after.id);
        this.backlinkIndex.set(target, set);
      }
    }
  }

  /**
   * Returns a child list that may be mutated during the current batch: the
   * first access per batch copies the list (copy-on-write), later accesses in
   * the same batch reuse the copy, which keeps bulk loads linear.
   */
  private ownedList(parentId: RemId | null): Rem[] {
    const list = this.childIndex.get(parentId);
    if (list && this.freshLists.has(list)) return list;
    const copy = list ? [...list] : [];
    this.childIndex.set(parentId, copy);
    this.freshLists.add(copy);
    return copy;
  }

  private linksOf(rem: Rem): RemId[] {
    return [
      ...referencedRemIds(rem.text),
      ...referencedRemIds(rem.back),
      ...rem.tags,
      ...(rem.portalOf ? [rem.portalOf] : []),
    ];
  }

  private indexCard(cardId: CardId, exists: boolean): void {
    const { remId } = parseCardId(cardId);
    const set = this.cardIndex.get(remId) ?? new Set();
    if (exists) set.add(cardId);
    else set.delete(cardId);
    this.cardIndex.set(remId, set);
  }
}
