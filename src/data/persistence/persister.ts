/**
 * Connects the store to a persistence adapter: every committed change is
 * written in order, and local edits are queued in the outbox for sync.
 */
import type { CommitEvent, Store } from '../store/store';
import type { PersistenceAdapter } from './adapter';

/** Writes store commits to persistence. */
export class Persister {
  private chain: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;
  /** Called after local changes were persisted (sync uses it to schedule a push). */
  onLocalWrite: (() => void) | null = null;
  /** Last persistence error (shown in the UI). */
  lastError: Error | null = null;

  constructor(
    store: Store,
    private readonly adapter: PersistenceAdapter,
  ) {
    this.unsubscribe = store.onCommit((e) => this.handle(e));
  }

  private handle(event: CommitEvent): void {
    // Changes loaded from disk or written by another tab are already stored.
    if (event.origin === 'load' || event.origin === 'tab') return;
    const local = event.origin !== 'remote';
    const changes = [...event.changes];
    this.chain = this.chain
      .then(() => this.adapter.write(changes, local))
      .then(() => {
        this.lastError = null;
        if (local) this.onLocalWrite?.();
      })
      .catch((err: unknown) => {
        this.lastError = err instanceof Error ? err : new Error(String(err));
        console.error('Persisting changes failed', err);
      });
  }

  /** Resolves when all queued writes have finished. */
  flush(): Promise<void> {
    return this.chain;
  }

  /** Stops listening to the store. */
  dispose(): void {
    this.unsubscribe();
  }
}
