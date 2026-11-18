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
import { getChunked, putChunked } from './chunkedFiles';
import type { ObjectStore } from './chunkedFiles';
import type { PulledRow, RemoteBackend, RemoteRow } from './remote';

/** Storage bucket for images and PDFs. */
export const FILE_BUCKET = 'files';
/** Public bucket of read-only links (see `supabaseShare.ts`). */
const SHARE_BUCKET_NAME = 'shares';

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
    // Large PDFs are split into parts (storage upload limit), see chunkedFiles.ts.
    await putChunked(bucketStore(this.client, FILE_BUCKET), `${this.userId}/${id}`, blob, mimeType);
  }

  async downloadFile(id: string): Promise<Blob> {
    const store = bucketStore(this.client, FILE_BUCKET);
    const own = await getChunked(store, `${this.userId}/${id}`);
    if (own) return own;
    // Files of shared subtrees live in their space's folder.
    const { data: spaces } = await this.client
      .from('space_members')
      .select('space_id')
      .eq('user_id', this.userId);
    for (const { space_id } of (spaces ?? []) as { space_id: string }[]) {
      const blob = await getChunked(store, `spaces/${space_id}/${id}`);
      if (blob) return blob;
    }
    throw new Error('Download failed: file not found');
  }
}

/**
 * Object store over a Supabase Storage bucket (for `putChunked`/`getChunked`).
 *
 * Args:
 *   client: Supabase client.
 *   bucket: Bucket id.
 */
export function bucketStore(client: SupabaseClient, bucket: string): ObjectStore {
  return {
    put: async (path, blob, mimeType) => {
      const { error } = await client.storage
        .from(bucket)
        .upload(path, blob, { contentType: mimeType, upsert: true });
      if (error)
        throw new Error(`Upload fehlgeschlagen (${path.split('/').pop()}): ${error.message}`);
    },
    get: async (path) => (await client.storage.from(bucket).download(path)).data ?? null,
  };
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

  /**
   * Deletes the signed-in account and all its server data.
   *
   * Storage objects are removed through the Storage API first (SQL cannot
   * delete them): the user's own file folder and the files of their
   * read-only links. `delete_my_account()` then deletes the auth user, which
   * cascades to every table with user data. Finally the local session is
   * dropped.
   *
   * Raises:
   *   Error: When not signed in or a server step fails (nothing after the
   *     failing step runs, so a retry continues where it stopped).
   */
  async deleteAccount(): Promise<void> {
    const user = await this.currentUser();
    if (!user) throw new Error('Nicht angemeldet.');
    // 1. Own files: `files/<user id>/<file id>`.
    await this.removeFolder(FILE_BUCKET, user.id);
    // 2. Files of read-only links: `shares/<token>/<file id>`.
    const { data: shares, error } = await this.client
      .from('shares')
      .select('token')
      .eq('owner_id', user.id);
    if (error) throw new Error(`Leselinks laden: ${error.message}`);
    for (const { token } of (shares ?? []) as { token: string }[]) {
      await this.removeFolder(SHARE_BUCKET_NAME, token);
    }
    // 3. The account itself (cascades to all tables).
    const { error: rpcError } = await this.client.rpc('delete_my_account');
    if (rpcError) throw new Error(`Konto löschen: ${rpcError.message}`);
    // 4. The session belongs to a deleted user: drop it locally only.
    await this.client.auth.signOut({ scope: 'local' });
  }

  /**
   * Removes every object directly inside a storage folder.
   *
   * Args:
   *   bucket: Bucket id.
   *   folder: Folder name (no slashes).
   */
  private async removeFolder(bucket: string, folder: string): Promise<void> {
    const storage = this.client.storage.from(bucket);
    // Removing shifts the listing, so always read the first page again.
    for (;;) {
      const { data, error } = await storage.list(folder, { limit: 1000 });
      if (error) throw new Error(`Dateien laden: ${error.message}`);
      const names = (data ?? []).filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
      if (names.length === 0) return;
      const { error: removeError } = await storage.remove(names);
      if (removeError) throw new Error(`Dateien löschen: ${removeError.message}`);
    }
  }
}

/** URL auth emails redirect back to (the app's own origin + base path). */
function redirectUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.origin + window.location.pathname;
}

function toUser(session: Session | null): AuthUser | null {
  return session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
}
