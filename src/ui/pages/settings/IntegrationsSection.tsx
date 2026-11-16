/**
 * Integrations: Todoist daily study tasks.
 *
 * Every night at 00:01 (in the chosen time zone) one task per course is
 * added to Todoist for the cards planned that day (exam quotas, priorities,
 * due reviews, new cards), with an estimated duration. The preview below is
 * computed locally with the same planner.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CheckSquare, Send } from 'lucide-react';
import type { TodoistSettings } from '@data/services/integrations';
import { useAccount, useApp, useSelector } from '../../app/context';
import { Field, Switch } from '../../components/Controls';
import { useToast } from '../../components/Toast';

/** Live Todoist settings (`null` = unavailable). */
function useTodoistSettings(): TodoistSettings | null {
  const app = useApp();
  return useSyncExternalStore(
    (l) => app.integrations.onChange(l),
    () => app.integrations.getSettings(),
  );
}

/** The integrations section. */
export function IntegrationsSection(): ReactNode {
  const app = useApp();
  const account = useAccount();
  const toast = useToast();
  const settings = useTodoistSettings();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useSelector((s) => s.version);

  const plans = useMemo(() => app.integrations.plans(7), [app, version, settings?.titleTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    setBusy(true);
    try {
      const res = await fn();
      toast(ok ?? String(res));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const save = (patch: Partial<TodoistSettings>): void =>
    void run(() => app.integrations.save(patch), 'Gespeichert');

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 14 }}>
        <h2 className="card-title">
          <CheckSquare size={18} /> Todoist: tägliche Lernaufgaben
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Jede Nacht um 00:01 bekommt Todoist pro Vorlesung (Ordner) eine Aufgabe für den Tag - mit
          geschätzter Dauer, ohne feste Uhrzeit. Grundlage ist dein Lernplan: Prüfungen,
          Prioritäten, fällige Wiederholungen und neue Karten.
        </p>
        {!account.user ? (
          <p style={{ margin: 0 }}>
            Dafür brauchst du ein Konto mit Supabase-Backend (Einstellungen → Account &amp; Sync),
            weil die Aufgaben nachts serverseitig angelegt werden.
          </p>
        ) : !settings ? (
          <p style={{ margin: 0 }}>
            Das Backend kennt die Integration noch nicht. Führe die Migration{' '}
            <code>20261118000000_integrations.sql</code> aus und deploye die Edge Function{' '}
            <code>todoist-daily</code> (siehe docs/integrations.md).
          </p>
        ) : (
          <>
            <Switch
              checked={settings.enabled}
              disabled={busy}
              onChange={(v) => save({ enabled: v })}
              label="Aktiv"
            />
            <Field
              label="Todoist-API-Token"
              hint={
                settings.hasToken
                  ? 'Ein Token ist gespeichert (wird nie angezeigt).'
                  : 'Todoist → Einstellungen → Integrationen → Entwickler → API-Token.'
              }
            >
              <div className="row">
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={token}
                  placeholder={settings.hasToken ? '••••••••' : 'Token einfügen'}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  className="btn"
                  disabled={busy || !token.trim()}
                  onClick={() =>
                    void run(
                      async () => (await app.integrations.setToken(token.trim()), setToken('')),
                      'Token gespeichert',
                    )
                  }
                >
                  Speichern
                </button>
                {settings.hasToken && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(() => app.integrations.setToken(null), 'Token entfernt')
                    }
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </Field>
            <div className="grid-3">
              <Field label="Projekt" hint="Wird angelegt, falls es fehlt.">
                <input
                  className="input"
                  defaultValue={settings.projectName}
                  onBlur={(e) =>
                    e.target.value !== settings.projectName &&
                    save({ projectName: e.target.value.trim() || 'RemCraft' })
                  }
                />
              </Field>
              <Field label="Zeitzone" hint="Bestimmt, wann 00:01 ist.">
                <input
                  className="input"
                  defaultValue={settings.timezone}
                  onBlur={(e) =>
                    e.target.value !== settings.timezone &&
                    save({ timezone: e.target.value.trim() })
                  }
                />
              </Field>
              <Field label="Priorität">
                <select
                  className="select"
                  value={settings.priority}
                  onChange={(e) =>
                    save({ priority: Number(e.target.value) as TodoistSettings['priority'] })
                  }
                >
                  <option value={1}>P4 (normal)</option>
                  <option value={2}>P3</option>
                  <option value={3}>P2</option>
                  <option value={4}>P1 (dringend)</option>
                </select>
              </Field>
              <Field label="Titel" hint="{course} und {minutes} werden ersetzt.">
                <input
                  className="input"
                  defaultValue={settings.titleTemplate}
                  onBlur={(e) =>
                    e.target.value !== settings.titleTemplate &&
                    save({ titleTemplate: e.target.value })
                  }
                />
              </Field>
              <Field label="Labels" hint="Kommagetrennt, optional.">
                <input
                  className="input"
                  defaultValue={settings.labels.join(', ')}
                  onBlur={(e) =>
                    save({
                      labels: e.target.value
                        .split(',')
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>
            <div className="row">
              <span className="muted" style={{ fontSize: 13 }}>
                {settings.lastRunAt
                  ? `Letzter Lauf: ${new Date(settings.lastRunAt).toLocaleString()} - ${settings.lastError ? `Fehler: ${settings.lastError}` : (settings.lastResult ?? '')}`
                  : 'Noch nicht gelaufen.'}
              </span>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                disabled={busy || !settings.enabled || !settings.hasToken}
                onClick={() => void run(() => app.integrations.runNow())}
              >
                <Send size={14} /> Heute jetzt senden
              </button>
            </div>
          </>
        )}
      </div>
      <div className="card col" style={{ gap: 10 }}>
        <h2 className="card-title">Vorschau: die nächsten 7 Tage</h2>
        <table className="table compact">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Aufgabe</th>
              <th>Karten</th>
              <th>Dauer</th>
            </tr>
          </thead>
          <tbody>
            {plans.flatMap((p) =>
              p.tasks.length === 0
                ? [
                    <tr key={p.date}>
                      <td>
                        {new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'numeric',
                        })}
                      </td>
                      <td className="faint" colSpan={3}>
                        nichts geplant
                      </td>
                    </tr>,
                  ]
                : p.tasks.map((t, i) => (
                    <tr key={`${p.date}-${t.key}`}>
                      <td>
                        {i === 0
                          ? new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'numeric',
                            })
                          : ''}
                      </td>
                      <td>
                        {t.content}
                        {t.exams.length > 0 && (
                          <span className="badge" style={{ marginLeft: 6 }}>
                            {t.exams.join(', ')}
                          </span>
                        )}
                      </td>
                      <td>
                        {t.reviews} Wdh. · {t.newCards} neu
                      </td>
                      <td>{t.minutes} min</td>
                    </tr>
                  )),
            )}
          </tbody>
        </table>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Spätere Tage setzen voraus, dass bis dahin nicht gelernt wird; der Plan wird bei jeder
          Änderung neu hochgeladen und um 00:01 gilt der aktuelle Stand.
        </p>
      </div>
    </div>
  );
}
