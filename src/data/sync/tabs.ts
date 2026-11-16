/**
 * Keeps several open tabs of the app consistent.
 *
 * Every committed change is broadcast over a `BroadcastChannel`; other tabs
 * apply it to their in-memory store without persisting it again.
 */
import type { CollectionName } from '@core/model/types';
import type { RecordOf, Store } from '../store/store';

/** Wire format of one broadcast record. */
interface TabMessageItem {
  collection: CollectionName;
  id: string;
  record: RecordOf<CollectionName> | undefined;
  updatedAt: number;
}

/** Bridges a store to other tabs. */
export class TabSync {
  private readonly channel: BroadcastChannel | null;
  private readonly unsubscribe: () => void;

  constructor(store: Store, channelName = 'remcraft') {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
    this.unsubscribe = store.onCommit((event) => {
      if (!this.channel || event.origin === 'tab' || event.origin === 'load') return;
      const items: TabMessageItem[] = event.changes.map((c) => ({
        collection: c.collection,
        id: c.id,
        record: c.after,
        updatedAt: c.after?.updatedAt ?? store.clock.now(),
      }));
      this.channel.postMessage(items);
    });
    if (this.channel) {
      this.channel.onmessage = (msg: MessageEvent<TabMessageItem[]>) => store.applyExternal(msg.data, 'tab');
    }
  }

  /** Closes the channel. */
  dispose(): void {
    this.unsubscribe();
    this.channel?.close();
  }
}
