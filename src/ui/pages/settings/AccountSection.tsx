/**
 * Account and synchronisation: backend configuration, sign-in/up and sync
 * status.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { isBuildTimeConfig, setStoredBackendConfig } from '@data/config';
import { useAccount, useApp } from '../../app/context';
import { useDialogs } from '../../components/Confirm';
import { Field } from '../../components/Controls';
import { useToast } from '../../components/Toast';
import { t } from '@core/i18n';

/** Account settings. */
export function AccountSection(): ReactNode {
  const app = useApp();
  const account = useAccount();
  const toast = useToast();
  const dialogs = useDialogs();

  if (!app.auth) return <BackendSetup />;

  if (!account.user) return <SignIn />;

  const sync = account.sync;
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2 className="card-title">{t('Account')}</h2>
      <div className="row">
        <Cloud size={18} />
        <span>
          {t('Signed in as')} <strong>{account.user.email}</strong>
        </span>
      </div>
      <div className="row muted">
        <span className={`sync-dot ${sync.state}`} /> {t('Sync:')} {sync.state}
        {sync.lastSyncedAt && (
          <>
            {' '}
            {t('· last synced')} {new Date(sync.lastSyncedAt).toLocaleTimeString()}
          </>
        )}
        {sync.pending > 0 && (
          <>
            {' '}
            · {sync.pending} {t('changes waiting')}
          </>
        )}
      </div>
      {sync.error && <div className="badge badge-danger">{sync.error}</div>}
      <div className="row">
        <button
          className="btn"
          onClick={() => void app.syncNow().then(() => toast(t('Synchronised')))}
        >
          <RefreshCw size={15} /> {t('Sync now')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            const pw = await dialogs.prompt({ title: t('New password') });
            if (pw)
              await app
                .auth!.updatePassword(pw)
                .then(() => toast(t('Password changed')))
                .catch((e: Error) => toast(e.message, 'error'));
          }}
        >
          {t('Change password')}
        </button>
        <span className="spacer" />
        <button
          className="btn btn-danger"
          onClick={async () => {
            const clear = await dialogs.confirm({
              title: t('Sign out'),
              message: t(
                'Remove the local copy of your notes from this device? Choose “Sign out & clear” on shared devices. Your data stays safe in the cloud.',
              ),
              confirmLabel: t('Sign out & clear'),
              danger: true,
            });
            await app.signOut(clear);
          }}
        >
          <LogOut size={15} /> {t('Sign out')}
        </button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        {t(
          'Your notes are stored on this device first (works offline) and synchronised with your Supabase project. Changes from other devices arrive in real time. Details:',
        )}{' '}
        <Link to="/legal">{t('Privacy policy')}</Link>.
      </p>
      <DeleteAccount />
    </div>
  );
}

/**
 * "Delete account": removes the account and every server copy of the user's
 * data (records, files, read-only links, spaces, integrations) and the local
 * copy on this device. Asks for the email address as confirmation.
 */
function DeleteAccount(): ReactNode {
  const app = useApp();
  const account = useAccount();
  const toast = useToast();
  const dialogs = useDialogs();
  return (
    <div className="col danger-zone" style={{ gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{t('Delete account')}</h3>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        {t(
          'Deletes your account and all data on the server (notes, files, learning history, read-only links, shared spaces you own, integrations) as well as the local copy on this device. Export what you want to keep first. This cannot be undone.',
        )}
      </p>
      <div>
        <button
          className="btn btn-danger"
          onClick={async () => {
            const typed = await dialogs.prompt({
              title: t('Delete account permanently?'),
              label: t('Enter your email address to confirm ({0})', {
                '0': account.user?.email ?? '',
              }),
              confirmLabel: t('Delete permanently'),
            });
            if (typed === null) return;
            if (typed.trim().toLowerCase() !== (account.user?.email ?? '').toLowerCase()) {
              toast(t('The email address does not match – nothing was deleted.'), 'error');
              return;
            }
            try {
              await app.deleteAccount();
              toast(t('Your account and your data have been deleted.'));
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), 'error');
            }
          }}
        >
          <Trash2 size={15} /> {t('Delete account and all data')}
        </button>
      </div>
    </div>
  );
}

/** Sign-in / sign-up form. */
function SignIn(): ReactNode {
  const app = useApp();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const auth = app.auth!;
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
    <div className="card col" style={{ gap: 14, maxWidth: 480 }}>
      <h2 className="card-title">{mode === 'signin' ? t('Sign in') : t('Create account')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t(
          'Sign in to synchronise your notes and flashcards across devices. Without an account everything stays on this device.',
        )}
      </p>
      <form
        className="col"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (mode === 'signin') await auth.signIn(email, password);
            else {
              const { needsConfirmation } = await auth.signUp(email, password);
              toast(
                needsConfirmation
                  ? t('Check your inbox to confirm your email.')
                  : t('Account created'),
              );
            }
          });
        }}
      >
        <Field label={t('Email')}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('Password')}>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {mode === 'signin' ? t('Sign in') : t('Create account')}
        </button>
        <p className="faint legal-consent" style={{ margin: 0, fontSize: 13 }}>
          {t('Information on how your data is processed can be found in the')}{' '}
          <Link to="/legal">{t('Privacy policy')}</Link>.
        </p>
      </form>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          disabled={!email || busy}
          onClick={() =>
            void run(
              async () => (
                await auth.sendMagicLink(email),
                toast(t('Magic link sent - check your inbox'))
              ),
            )
          }
        >
          {t('Email me a magic link')}
        </button>
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={() => void run(() => auth.signInWithProvider('github'))}
        >
          <LogIn size={14} /> {t('GitHub')}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={!email || busy}
          onClick={() =>
            void run(
              async () => (await auth.resetPassword(email), toast(t('Password reset email sent'))),
            )
          }
        >
          {t('Forgot password?')}
        </button>
      </div>
      <button className="link-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin'
          ? t('No account yet? Create one')
          : t('Already have an account? Sign in')}
      </button>
    </div>
  );
}

/** Shown when no Supabase backend is configured. */
function BackendSetup(): ReactNode {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2 className="card-title">
        <CloudOff size={18} /> {t('Local only')}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {t(
          'RemCraft currently stores everything in this browser only. To get accounts and sync across devices, create a free Supabase project (see docs/deployment.md), run the SQL migration and either set',
        )}{' '}
        <code>VITE_SUPABASE_URL</code>/<code>VITE_SUPABASE_ANON_KEY</code>{' '}
        {t('at build time or enter the values here.')}
      </p>
      {!isBuildTimeConfig() && (
        <form
          className="col"
          onSubmit={(e) => {
            e.preventDefault();
            setStoredBackendConfig({ supabaseUrl: url.trim(), supabaseAnonKey: key.trim() });
            window.location.reload();
          }}
        >
          <Field label={t('Supabase project URL')}>
            <input
              className="input"
              placeholder="https://xyz.supabase.co"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field
            label={t('Supabase anon (public) key')}
            hint={t(
              'The anon key is public by design; your data is protected by row-level security.',
            )}
          >
            <input
              className="input"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary">{t('Connect')}</button>
        </form>
      )}
    </div>
  );
}
