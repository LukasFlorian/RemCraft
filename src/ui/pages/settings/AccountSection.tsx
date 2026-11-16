/**
 * Account and synchronisation: backend configuration, sign-in/up and sync
 * status.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { isBuildTimeConfig, setStoredBackendConfig } from '@data/config';
import { useAccount, useApp } from '../../app/context';
import { useDialogs } from '../../components/Confirm';
import { Field } from '../../components/Controls';
import { useToast } from '../../components/Toast';

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
      <h2 className="card-title">Account</h2>
      <div className="row">
        <Cloud size={18} />
        <span>
          Signed in as <strong>{account.user.email}</strong>
        </span>
      </div>
      <div className="row muted">
        <span className={`sync-dot ${sync.state}`} /> Sync: {sync.state}
        {sync.lastSyncedAt && <> · last synced {new Date(sync.lastSyncedAt).toLocaleTimeString()}</>}
        {sync.pending > 0 && <> · {sync.pending} changes waiting</>}
      </div>
      {sync.error && <div className="badge badge-danger">{sync.error}</div>}
      <div className="row">
        <button className="btn" onClick={() => void app.syncNow().then(() => toast('Synchronised'))}>
          <RefreshCw size={15} /> Sync now
        </button>
        <button
          className="btn"
          onClick={async () => {
            const pw = await dialogs.prompt({ title: 'New password' });
            if (pw) await app.auth!.updatePassword(pw).then(() => toast('Password changed')).catch((e: Error) => toast(e.message, 'error'));
          }}
        >
          Change password
        </button>
        <span className="spacer" />
        <button
          className="btn btn-danger"
          onClick={async () => {
            const clear = await dialogs.confirm({
              title: 'Sign out',
              message: 'Remove the local copy of your notes from this device? Choose “Sign out & clear” on shared devices. Your data stays safe in the cloud.',
              confirmLabel: 'Sign out & clear',
              danger: true,
            });
            await app.signOut(clear);
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        Your notes are stored on this device first (works offline) and synchronised with your Supabase project. Changes from other devices arrive in real time.
      </p>
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
      <h2 className="card-title">{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
      <p className="muted" style={{ margin: 0 }}>
        Sign in to synchronise your notes and flashcards across devices. Without an account everything stays on this device.
      </p>
      <form
        className="col"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (mode === 'signin') await auth.signIn(email, password);
            else {
              const { needsConfirmation } = await auth.signUp(email, password);
              toast(needsConfirmation ? 'Check your inbox to confirm your email.' : 'Account created');
            }
          });
        }}
      >
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-sm" disabled={!email || busy} onClick={() => void run(async () => (await auth.sendMagicLink(email), toast('Magic link sent - check your inbox')))}>
          Email me a magic link
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run(() => auth.signInWithProvider('github'))}>
          <LogIn size={14} /> GitHub
        </button>
        <button className="btn btn-sm btn-ghost" disabled={!email || busy} onClick={() => void run(async () => (await auth.resetPassword(email), toast('Password reset email sent')))}>
          Forgot password?
        </button>
      </div>
      <button className="link-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
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
        <CloudOff size={18} /> Local only
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        RemCraft currently stores everything in this browser only. To get accounts and sync across devices, create a free Supabase project (see docs/deployment.md), run the SQL migration and either set <code>VITE_SUPABASE_URL</code>/<code>VITE_SUPABASE_ANON_KEY</code> at build time or enter the values here.
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
          <Field label="Supabase project URL">
            <input className="input" placeholder="https://xyz.supabase.co" required value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Supabase anon (public) key" hint="The anon key is public by design; your data is protected by row-level security.">
            <input className="input" required value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <button className="btn btn-primary">Connect</button>
        </form>
      )}
    </div>
  );
}
