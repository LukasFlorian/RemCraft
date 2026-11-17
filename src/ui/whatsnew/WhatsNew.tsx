/**
 * "Was ist neu" popup: shown once after an update with the release notes the
 * user has not seen yet (see `releases.ts`). The last seen release is kept per
 * device in `localStorage`.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
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

/** Remembers the newest release as seen. */
function markSeen(): void {
  try {
    if (RELEASES[0]) localStorage.setItem(SEEN_KEY, RELEASES[0].id);
  } catch {
    // Private mode: the popup may show again, which is harmless.
  }
}

/** The popup (renders nothing when there is nothing new). */
export function WhatsNew(): ReactNode {
  const [releases] = useState(() => {
    // Existing users without a stored version see all notes once.
    const seen = readSeen() ?? (usedBefore() ? '' : null);
    const unseen = unseenReleases(seen);
    // First start: nothing is "new", just remember the current version.
    if (seen === null || unseen.length === 0) markSeen();
    return unseen;
  });
  const [open, setOpen] = useState(releases.length > 0);
  if (!open) return null;
  const close = (): void => {
    markSeen();
    setOpen(false);
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
