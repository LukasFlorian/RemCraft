/**
 * Supabase implementation of the {@link RemoteBackend} and authentication.
 *
 * Data model: one generic table `records(user_id, collection, id, data,
 * deleted, updated_at, seq)` protected by row-level security, plus
 * `space_records` for subtrees shared live with others (see
 * `supabase/migrations`). A trigger assigns a monotonically increasing `seq`
 * on every write and rejects writes older than the stored row, which makes
 * concurrent pushes from several devices safe.
 */
import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { BackendConfig } from '../config';
import type { PulledRow, RemoteBackend, RemoteRow } from './remote';

/** Storage bucket for images and PDFs. */
export const FILE_BUCKET = 'files';

/** Creates the Supabase client. */
export function createSupabase(config: BackendConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** {@link RemoteBackend} for one signed-in user. */
export class SupabaseBackend implements RemoteBackend {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async pull(sinceSeq: number, limit: number): Promise<PulledRow[]> {
    // `pull_changes` returns the user's own rows plus the rows of every space
    // they are a member of, ordered by the global change sequence.
    const { data, error } = await this.client.rpc('pull_changes', { since: sinceSeq, lim: limit });
    if (error) throw new Error(`Pull failed: ${error.message}`);
    return ((data ?? []) as PulledRow[]).map((r) => ({
      ...r,
      updated_at: Number(r.updated_at),
      seq: Number(r.seq),
    }));
  }

  async push(rows: readonly RemoteRow[]): Promise<void> {
    if (rows.length === 0) return;
    const personal = rows
      .filter((r) => !r.space)
      .map(({ space: _s, ...r }) => ({ ...r, user_id: this.userId }));
    const shared = rows
      .filter((r) => r.space)
      .map(({ space, ...r }) => ({ ...r, space_id: space }));
    if (personal.length > 0) {
      const { error } = await this.client
        .from('records')
        .upsert(personal, { onConflict: 'user_id,collection,id' });
      if (error) throw new Error(`Push failed: ${error.message}`);
    }
    if (shared.length > 0) {
      const { error } = await this.client
        .from('space_records')
        .upsert(shared, { onConflict: 'space_id,collection,id' });
      if (error) throw new Error(`Push failed (shared): ${error.message}`);
    }
  }

  subscribe(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Debounce bursts (a push from another device touches many rows).
    const notify = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 400);
    };
    // Unique topic: supabase-js reuses channels by name, and adding listeners to
    // an already subscribed channel throws.
    const channel = this.client
      .channel(`records-${this.userId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${this.userId}` },
        notify,
      )
      // Shared spaces: row-level security limits events to spaces I belong to.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_records' }, notify)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void this.client.removeChannel(channel);
    };
  }

  async uploadFile(id: string, blob: Blob, mimeType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(FILE_BUCKET)
      .upload(`${this.userId}/${id}`, blob, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  async downloadFile(id: string): Promise<Blob> {
    const own = await this.client.storage.from(FILE_BUCKET).download(`${this.userId}/${id}`);
    if (own.data) return own.data;
    // Files of shared subtrees live in their space's folder.
    const { data: spaces } = await this.client
      .from('space_members')
      .select('space_id')
      .eq('user_id', this.userId);
    for (const { space_id } of (spaces ?? []) as { space_id: string }[]) {
      const res = await this.client.storage.from(FILE_BUCKET).download(`spaces/${space_id}/${id}`);
      if (res.data) return res.data;
    }
    throw new Error(`Download failed: ${own.error?.message ?? 'no data'}`);
  }
}

/** Minimal authenticated user information. */
export interface AuthUser {
  id: string;
  email: string | null;
}

/** Authentication operations (thin wrapper around Supabase Auth). */
export class AuthService {
  constructor(private readonly client: SupabaseClient) {}

  /** Current user or `null`. */
  async currentUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    return toUser(data.session);
  }

  /** Subscribes to sign-in/sign-out events. */
  onChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) =>
      listener(toUser(session)),
    );
    return () => data.subscription.unsubscribe();
  }

  /** Email + password sign-in. */
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  /** Creates an account (Supabase may require email confirmation). */
  async signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }

  /** Sends a passwordless magic link. */
  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) throw new Error(error.message);
  }

  /** OAuth sign-in (provider must be enabled in the Supabase dashboard). */
  async signInWithProvider(provider: 'github' | 'google'): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl() },
    });
    if (error) throw new Error(error.message);
  }

  /** Sends a password-reset email. */
  async resetPassword(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl(),
    });
    if (error) throw new Error(error.message);
  }

  /** Changes the password of the signed-in user. */
  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/** URL auth emails redirect back to (the app's own origin + base path). */
function redirectUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.origin + window.location.pathname;
}

function toUser(session: Session | null): AuthUser | null {
  return session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
}
