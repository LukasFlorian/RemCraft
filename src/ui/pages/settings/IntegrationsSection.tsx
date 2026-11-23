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
import { t as tr } from '@core/i18n';

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
    void run(() => app.integrations.save(patch), tr('Saved'));

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 14 }}>
        <h2 className="card-title">
          <CheckSquare size={18} /> {tr('Todoist: daily study tasks')}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {tr(
            'Every night at 00:01 Todoist gets one task per lecture (folder) for the day – with an estimated duration, without a fixed time. It is based on your study plan: exams, priorities, due reviews and new cards.',
          )}
        </p>
        {!account.user ? (
          <p style={{ margin: 0 }}>
            {tr(
              'This needs an account with a Supabase backend (Settings → Account & Sync), because the tasks are created on the server at night.',
            )}
          </p>
        ) : !settings ? (
          <p style={{ margin: 0 }}>
            {tr('The backend does not know the integration yet. Run the migration')}{' '}
            <code>20261118000000_integrations.sql</code> {tr('and deploy the Edge Function')}{' '}
            <code>todoist-daily</code> {tr('(see docs/integrations.md).')}
          </p>
        ) : (
          <>
            <Switch
              checked={settings.enabled}
              disabled={busy}
              onChange={(v) => save({ enabled: v })}
              label={tr('Active')}
            />
            <Field
              label={tr('Todoist API token')}
              hint={
                settings.hasToken
                  ? tr('A token is saved (never shown).')
                  : tr('Todoist → Settings → Integrations → Developer → API token.')
              }
            >
              <div className="row">
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={token}
                  placeholder={settings.hasToken ? '••••••••' : tr('Paste token')}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  className="btn"
                  disabled={busy || !token.trim()}
                  onClick={() =>
                    void run(
                      async () => (await app.integrations.setToken(token.trim()), setToken('')),
                      tr('Token saved'),
                    )
                  }
                >
                  {tr('Save')}
                </button>
                {settings.hasToken && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(() => app.integrations.setToken(null), tr('Token removed'))
                    }
                  >
                    {tr('Remove')}
                  </button>
                )}
              </div>
            </Field>
            <div className="grid-3">
              <Field label={tr('Project')} hint={tr('Created if it is missing.')}>
                <input
                  className="input"
                  defaultValue={settings.projectName}
                  onBlur={(e) =>
                    e.target.value !== settings.projectName &&
                    save({ projectName: e.target.value.trim() || 'RemCraft' })
                  }
                />
              </Field>
              <Field label={tr('Time zone')} hint={tr('Decides when 00:01 is.')}>
                <input
                  className="input"
                  defaultValue={settings.timezone}
                  onBlur={(e) =>
                    e.target.value !== settings.timezone &&
                    save({ timezone: e.target.value.trim() })
                  }
                />
              </Field>
              <Field label={tr('Priority')}>
                <select
                  className="select"
                  value={settings.priority}
                  onChange={(e) =>
                    save({ priority: Number(e.target.value) as TodoistSettings['priority'] })
                  }
                >
                  <option value={1}>{tr('P4 (normal)')}</option>
                  <option value={2}>P3</option>
                  <option value={3}>P2</option>
                  <option value={4}>{tr('P1 (urgent)')}</option>
                </select>
              </Field>
              <Field label={tr('Title')} hint={tr('{course} and {minutes} are replaced.')}>
                <input
                  className="input"
                  defaultValue={settings.titleTemplate}
                  onBlur={(e) =>
                    e.target.value !== settings.titleTemplate &&
                    save({ titleTemplate: e.target.value })
                  }
                />
              </Field>
              <Field label={tr('Labels')} hint={tr('Comma-separated, optional.')}>
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
                  ? tr('Last run: {0} – {1}', {
                      '0': new Date(settings.lastRunAt).toLocaleString(),
                      '1': settings.lastError
                        ? `Fehler: ${settings.lastError}`
                        : (settings.lastResult ?? ''),
                    })
                  : tr('Not run yet.')}
              </span>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                disabled={busy || !settings.enabled || !settings.hasToken}
                onClick={() => void run(() => app.integrations.runNow())}
              >
                <Send size={14} /> {tr('Send today now')}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="card col" style={{ gap: 10 }}>
        <h2 className="card-title">{tr('Preview: the next 7 days')}</h2>
        <table className="table compact">
          <thead>
            <tr>
              <th>{tr('Tag')}</th>
              <th>{tr('Task')}</th>
              <th>{tr('Cards')}</th>
              <th>{tr('Duration')}</th>
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
                        {tr('nothing planned')}
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
                        {t.reviews} {tr('reviews ·')} {t.newCards} {tr('new')}
                      </td>
                      <td>
                        {t.minutes} {tr('min')}
                      </td>
                    </tr>
                  )),
            )}
          </tbody>
        </table>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {tr(
            'Later days assume that you do not study until then; the plan is uploaded again after every change and the current state applies at 00:01.',
          )}
        </p>
      </div>
    </div>
  );
}
