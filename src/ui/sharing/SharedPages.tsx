/**
 * Pages reached through share links:
 * - `#/s/:token` - read-only view of a published snapshot with "Klonen",
 * - `#/join/:token` - accept an invite to a shared space.
 * Snapshot files (`*.remcraft.json`) open in the same viewer via the import dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Copy, Users } from 'lucide-react';
import type { Rem, RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { describeScope } from '@core/sharing/scope';
import type { ShareSnapshot } from '@core/sharing/snapshot';
import { snapshotStats } from '@core/sharing/snapshot';
import { ROLE_LABELS } from '@core/sharing/spaces';
import { useAccount, useApp } from '../app/context';
import { useToast } from '../components/Toast';

/** Read-only outline of a snapshot. */
export function SnapshotView({ snapshot }: { snapshot: ShareSnapshot }): ReactNode {
  const { byParent, byId } = useMemo(() => {
    const byParent = new Map<RemId | null, Rem[]>();
    for (const r of snapshot.rems)
      byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    for (const list of byParent.values())
      list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    return { byParent, byId: new Map(snapshot.rems.map((r) => [r.id, r] as const)) };
  }, [snapshot]);
  const text = (r: Rem['text'] | null): string =>
    toPlainText(r, (id) => toPlainText(byId.get(id)?.text ?? []));

  const node = (rem: Rem, depth: number): ReactNode => {
    const kids = byParent.get(rem.id) ?? [];
    const title = text(rem.text) || (rem.slide ? `Folie ${rem.slide.index + 1}` : '…');
    const head = rem.isFolder || rem.isDocument || rem.deck;
    return (
      <li
        key={rem.id}
        className={`snap-node${head ? ' snap-doc' : ''}${rem.slide ? ' snap-slide' : ''}`}
      >
        <span className={rem.mcCorrect ? 'snap-correct' : undefined}>
          {rem.isFolder ? '📁 ' : rem.deck ? '🖥 ' : rem.isDocument ? '📄 ' : ''}
          {title}
          {rem.back && rem.direction !== 'none' && (
            <>
              {' '}
              <span className="snap-arrow">{rem.direction === 'disabled' ? '—' : '→'}</span>{' '}
              {text(rem.back)}
            </>
          )}
        </span>
        {rem.slide && rem.slideText && depth < 8 && (
          <div className="faint snap-slidetext">{rem.slideText.slice(0, 160)}</div>
        )}
        {kids.length > 0 && <ul>{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };
  const root = byId.get(snapshot.rootId);
  const stats = snapshotStats(snapshot);
  return (
    <div className="snapshot">
      <p className="muted" style={{ marginTop: 0 }}>
        Umfang: {describeScope(snapshot.scope)} · {stats.rems} Einträge · {stats.slides} Folien ·
        Stand {new Date(snapshot.createdAt).toLocaleString()}
      </p>
      <ul className="snap-tree">{root && node(root, 0)}</ul>
    </div>
  );
}

/** `#/s/:token`: a published read-only share. */
export function SharedSnapshotPage(): ReactNode {
  const { token = '' } = useParams();
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.sharing
      .fetch(token)
      .then(setSnapshot, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [app, token]);

  const clone = async (): Promise<void> => {
    setBusy(true);
    try {
      const root = await app.sharing.clonePublished(token, null);
      toast('In deine Wissensbasis kopiert');
      navigate(`/rem/${root}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main-scroll">
      <div className="page">
        {error ? (
          <p className="muted">{error}</p>
        ) : !snapshot ? (
          <p className="muted">Lade Freigabe …</p>
        ) : (
          <>
            <div className="row">
              <h1 style={{ margin: 0 }}>{snapshot.title}</h1>
              <span className="badge">nur lesen</span>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={busy} onClick={() => void clone()}>
                <Copy size={14} /> In meine Wissensbasis klonen
              </button>
            </div>
            <SnapshotView snapshot={snapshot} />
          </>
        )}
      </div>
    </div>
  );
}

/** `#/join/:token`: accept an invite to a shared space. */
export function JoinSpacePage(): ReactNode {
  const { token = '' } = useParams();
  const app = useApp();
  const account = useAccount();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const join = async (): Promise<void> => {
    setBusy(true);
    try {
      const space = await app.sharing.join(token);
      toast(`Beigetreten: ${space.name} (${ROLE_LABELS[space.role]})`);
      navigate(app.store.get(space.rootId) ? `/rem/${space.rootId}` : '/');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main-scroll">
      <div className="page">
        <h1>
          <Users size={22} /> Einladung zur Zusammenarbeit
        </h1>
        <p>
          Du wurdest eingeladen, einen Bereich (z. B. eine Vorlesungsmappe) gemeinsam zu nutzen. Er
          erscheint danach in deiner Seitenleiste und wird live synchronisiert; dein Lernfortschritt
          bleibt privat.
        </p>
        {account.user ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => void join()}>
            Beitreten
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => navigate('/settings/account')}>
            Erst anmelden
          </button>
        )}
      </div>
    </div>
  );
}
