/**
 * "Was ist neu" popup: shown once per user after an update with the release
 * notes they have not seen yet (see `releases.ts`). The last seen release is
 * kept in the synced settings (so another device does not show it again) and
 * in `localStorage` (before signing in / offline).
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../app/context';
import { Modal } from '../components/Modal';
import { RELEASES, unseenReleases } from './releases';

const SEEN_KEY = 'remcraft.whatsNewSeen';

/** Reads the last seen release id (`null` when never stored or unavailable). */
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * True when RemCraft was used on this device before the popup existed
 * (stored settings or a sign-in): those users should see what is new.
 */
function usedBefore(): boolean {
  try {
    return Object.keys(localStorage).some(
      (k) => k !== SEEN_KEY && (k.startsWith('remcraft.') || k.startsWith('sb-')),
    );
  } catch {
    return false;
  }
}

/** Stores the last seen release id on this device. */
function writeSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Private mode: the synced setting still remembers it when signed in.
  }
}

/** The popup (renders nothing when there is nothing new). */
export function WhatsNew(): ReactNode {
  const app = useApp();
  // Seen on another device? The synced setting wins (it may arrive after start).
  const synced = useSelector((s) => selectSettings(s).whatsNewSeen ?? null);
  const [local] = useState(() => readSeen() ?? (usedBefore() ? '' : null));
  const seen = synced !== null && (local === null || synced > local) ? synced : local;
  const releases = unseenReleases(seen);
  const [dismissed, setDismissed] = useState(false);
  const newest = RELEASES[0]?.id;

  /** Remembers the newest release as seen, on this device and in the account. */
  const markSeen = (): void => {
    if (!newest) return;
    writeSeen(newest);
    if (synced !== newest)
      app.store.transact(
        (tx) => void tx.put('settings', { ...selectSettings(app.store), whatsNewSeen: newest }),
        { undoable: false },
      );
  };
  // First start ever: nothing is "new" - just remember the current version.
  useEffect(() => {
    if (seen === null) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed || releases.length === 0) return null;
  const close = (): void => {
    markSeen();
    setDismissed(true);
  };
  return (
    <Modal title="Was ist neu" onClose={close}>
      <div className="whats-new">
        {releases.map((r) => (
          <section key={r.id}>
            <h3>
              <Sparkles size={16} /> {r.title}
            </h3>
            <ul>
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={close}>
            Los geht’s
          </button>
        </div>
      </div>
    </Modal>
  );
}
