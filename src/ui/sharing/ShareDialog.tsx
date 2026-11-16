/**
 * "Teilen" dialog of a folder, course, slide deck or document.
 *
 * Two ways to share:
 * - **Link (nur lesen)**: a scoped snapshot others can view and clone; also
 *   exportable as a file (works without an account).
 * - **Live zusammenarbeiten**: the subtree moves into a shared space; invite
 *   links grant read or write access.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Copy, Download, Link2, RefreshCw, Trash2, Users } from 'lucide-react';
import { SHARE_PRESETS, describeScope, presetOf } from '@core/sharing/scope';
import type { SharePreset, ShareScope } from '@core/sharing/scope';
import { ROLE_LABELS } from '@core/sharing/spaces';
import type { SpaceInfo, SpaceMember, SpaceRole } from '@core/sharing/spaces';
import type { RemId } from '@core/model/types';
import type { PublishedShare } from '@data/sync/shareBackend';
import { SNAPSHOT_FILE_SUFFIX } from '@data/services/sharing';
import { useAccount, useApp, useRem } from '../app/context';
import { Modal } from '../components/Modal';
import { Switch } from '../components/Controls';
import { useToast } from '../components/Toast';
import { RemContent } from '../editor/RemBlock';

/** Absolute link to an in-app route (hash routing). */
export function appLink(route: string): string {
  return `${window.location.origin}${window.location.pathname}#${route}`;
}

/** Live list of the user's spaces. */
export function useSpaces(): readonly SpaceInfo[] {
  const app = useApp();
  return useSyncExternalStore(
    (l) => app.sharing.onSpacesChange(l),
    () => app.sharing.listSpaces(),
  );
}

/** Copies text to the clipboard with a toast. */
function useCopy(): (text: string) => void {
  const toast = useToast();
  return (text) =>
    void navigator.clipboard.writeText(text).then(
      () => toast('Link kopiert'),
      () => toast(text),
    );
}

/** The share dialog. */
export function ShareDialog({ remId, onClose }: { remId: RemId; onClose: () => void }): ReactNode {
  const rem = useRem(remId);
  const account = useAccount();
  const [tab, setTab] = useState<'link' | 'live'>('link');
  if (!rem) return null;
  return (
    <Modal
      title={
        <span>
          Teilen: <RemContent rem={rem} />
        </span>
      }
      onClose={onClose}
      wide
    >
      <div className="segmented">
        <button className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
          <Link2 size={14} /> Link (nur lesen, klonbar)
        </button>
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
          <Users size={14} /> Live zusammenarbeiten
        </button>
      </div>
      {!account.user && (
        <p className="muted" style={{ margin: 0 }}>
          Für Links und Zusammenarbeit musst du angemeldet sein (Einstellungen → Konto). Als Datei
          teilen geht auch ohne Konto.
        </p>
      )}
      {tab === 'link' ? (
        <LinkTab remId={remId} signedIn={Boolean(account.user)} />
      ) : (
        <LiveTab remId={remId} signedIn={Boolean(account.user)} />
      )}
    </Modal>
  );
}

/** Scope picker: presets plus individual switches. */
function ScopePicker({
  scope,
  onChange,
}: {
  scope: ShareScope;
  onChange: (s: ShareScope) => void;
}): ReactNode {
  const preset = presetOf(scope);
  return (
    <div className="share-scope">
      <div className="pill-row">
        {(Object.keys(SHARE_PRESETS) as SharePreset[]).map((p) => (
          <button
            key={p}
            className={`pill${preset === p ? ' active' : ''}`}
            title={SHARE_PRESETS[p].hint}
            onClick={() => onChange(SHARE_PRESETS[p].scope)}
          >
            {SHARE_PRESETS[p].label}
          </button>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
        <Switch
          checked={scope.slides}
          onChange={(v) => onChange({ ...scope, slides: v })}
          label="Folien (PDF)"
        />
        <Switch
          checked={scope.notes}
          onChange={(v) => onChange({ ...scope, notes: v })}
          label="Notizen"
        />
        <Switch
          checked={scope.cards}
          onChange={(v) => onChange({ ...scope, cards: v })}
          label="Karteikarten"
        />
        <Switch
          checked={scope.annotations}
          disabled={!scope.slides}
          onChange={(v) => onChange({ ...scope, annotations: v })}
          label="Annotationen"
        />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Lernfortschritt wird nie geteilt. Ohne „Karteikarten“ werden Karten zu normalen Notizen.
      </p>
    </div>
  );
}

/** Read-only link / file sharing. */
function LinkTab({ remId, signedIn }: { remId: RemId; signedIn: boolean }): ReactNode {
  const app = useApp();
  const toast = useToast();
  const copy = useCopy();
  const [scope, setScope] = useState<ShareScope>(SHARE_PRESETS.all.scope);
  const [shares, setShares] = useState<PublishedShare[]>([]);
  const [busy, setBusy] = useState(false);
  const stats = (() => {
    const snap = app.sharing.snapshot(remId, scope);
    return `${snap.rems.length} Rems, ${snap.files.length} Dateien`;
  })();

  const reload = (): void =>
    void (signedIn
      ? app.sharing.myShares().then(
          (all) => setShares(all.filter((s) => s.rootId === remId)),
          () => undefined,
        )
      : undefined);
  useEffect(reload, [remId, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScopePicker scope={scope} onChange={setScope} />
      <div className="row">
        <span className="muted">{stats}</span>
        <span className="spacer" />
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const blob = await app.sharing.exportFile(remId, scope);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${app.rems.title(remId).replace(/[^\w.-]+/g, '_') || 'freigabe'}${SNAPSHOT_FILE_SUFFIX}`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          }
        >
          <Download size={14} /> Als Datei
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !signedIn}
          onClick={() =>
            void run(async () => {
              const token = await app.sharing.publish(remId, scope);
              copy(appLink(`/s/${token}`));
              reload();
            })
          }
        >
          <Link2 size={14} /> Link erstellen
        </button>
      </div>
      {shares.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Link</th>
              <th>Umfang</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.token}>
                <td>
                  <code className="share-link">{appLink(`/s/${s.token}`)}</code>
                </td>
                <td>{s.scopeLabel}</td>
                <td>{new Date(s.updatedAt).toLocaleString()}</td>
                <td className="row" style={{ gap: 4 }}>
                  <button
                    className="icon-btn"
                    title="Link kopieren"
                    onClick={() => copy(appLink(`/s/${s.token}`))}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title={`Mit aktuellem Stand (${describeScope(scope)}) aktualisieren`}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        async () => (await app.sharing.publish(remId, scope, s.token), reload()),
                      )
                    }
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Link zurückziehen"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => (await app.sharing.unpublish(s.token), reload()))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Wer den Link hat, kann den Stand ansehen (auch ohne Konto) und in die eigene Wissensbasis
        klonen. Spätere Änderungen erscheinen erst nach „Aktualisieren“.
      </p>
    </>
  );
}

/** Live collaboration. */
function LiveTab({ remId, signedIn }: { remId: RemId; signedIn: boolean }): ReactNode {
  const app = useApp();
  const toast = useToast();
  const copy = useCopy();
  const rem = useRem(remId);
  const spaces = useSpaces();
  const space = rem?.spaceId ? spaces.find((s) => s.id === rem.spaceId) : undefined;
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [busy, setBusy] = useState(false);
  const owner = space?.role === 'owner';

  const reload = (): void =>
    void (space ? app.sharing.members(space.id).then(setMembers, () => undefined) : setMembers([]));
  useEffect(reload, [space?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (rem?.spaceId && !space)
    return <p className="muted">Teil eines geteilten Bereichs (lädt …).</p>;
  if (!space) {
    return (
      <>
        <p style={{ margin: 0 }}>
          Der ganze Bereich (mit allen Unterseiten, Folien, Notizen und Karten) wird live mit
          anderen synchronisiert. Jede Person lernt mit ihrem eigenen Fortschritt.
        </p>
        <div className="row">
          <span className="spacer" />
          <button
            className="btn btn-primary"
            disabled={busy || !signedIn}
            onClick={() => void run(async () => void (await app.sharing.shareLive(remId)))}
          >
            <Users size={14} /> Live teilen
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <p style={{ margin: 0 }}>
        Geteilt als <strong>{space.name}</strong> · deine Rolle: {ROLE_LABELS[space.role]}
        {space.rootId !== remId && ' (über einen übergeordneten Bereich)'}
      </p>
      {owner && (
        <div className="row">
          <span className="muted">Einladungslink:</span>
          {(['writer', 'reader'] as const).map((role) => (
            <button
              key={role}
              className="btn btn-sm"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  copy(appLink(`/join/${await app.sharing.invite(space.id, role)}`)),
                )
              }
            >
              <Link2 size={13} /> {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      )}
      <table className="table compact">
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td>{m.email ?? m.userId.slice(0, 8)}</td>
              <td>
                {owner && m.role !== 'owner' ? (
                  <select
                    className="select"
                    value={m.role}
                    onChange={(e) =>
                      void run(
                        async () => (
                          await app.sharing.setMember(
                            space.id,
                            m.userId,
                            e.target.value as Exclude<SpaceRole, 'owner'>,
                          ),
                          reload()
                        ),
                      )
                    }
                  >
                    <option value="writer">{ROLE_LABELS.writer}</option>
                    <option value="reader">{ROLE_LABELS.reader}</option>
                  </select>
                ) : (
                  ROLE_LABELS[m.role]
                )}
              </td>
              <td>
                {owner && m.role !== 'owner' && (
                  <button
                    className="icon-btn"
                    title="Entfernen"
                    onClick={() =>
                      void run(
                        async () => (
                          await app.sharing.setMember(space.id, m.userId, null),
                          reload()
                        ),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <span className="spacer" />
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() =>
            confirm(
              owner
                ? 'Teilen beenden? Mitglieder behalten eine eigene Kopie.'
                : 'Bereich verlassen? Du behältst eine eigene Kopie.',
            ) && void run(() => app.sharing.leave(space.id))
          }
        >
          {owner ? 'Teilen beenden' : 'Verlassen'}
        </button>
      </div>
    </>
  );
}
