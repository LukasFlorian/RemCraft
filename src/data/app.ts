/**
 * Composition root of the data layer.
 *
 * `RemCraftApp` wires the store, local persistence, tab synchronisation,
 * services and - when a Supabase backend is configured and the user is signed
 * in - remote synchronisation. The UI receives one instance via React context.
 */
import type { BackendConfig } from './config';
import { getBackendConfig } from './config';
import type { PersistenceAdapter } from './persistence/adapter';
import { DexieAdapter } from './persistence/dexie';
import { MemoryAdapter } from './persistence/memory';
import { Persister } from './persistence/persister';
import { seedStore } from './seed';
import { ExamService } from './services/exams';
import { HabitService } from './services/habits';
import { FileService } from './services/files';
import { ImportExportService } from './services/io';
import { LectureService } from './services/lectures';
import { PracticeService } from './services/practice';
import { RemService } from './services/rems';
import { SettingsService } from './services/settings';
import { SharingService } from './services/sharing';
import { FokusImportService } from './services/fokusImport';
import { IntegrationService } from './services/integrations';
import type { IntegrationBackend } from './services/integrations';
import { SupabaseIntegrationBackend } from './sync/supabaseIntegrations';
import { Store } from './store/store';
import type { SyncStatus } from './sync/engine';
import { SyncEngine } from './sync/engine';
import type { RemoteBackend } from './sync/remote';
import type { ShareBackend } from './sync/shareBackend';
import { SupabaseShareBackend } from './sync/supabaseShare';
import type { AuthUser } from './sync/supabase';
import { AuthService, createSupabase, SupabaseBackend } from './sync/supabase';
import { TabSync } from './sync/tabs';
import { parseChannel } from '@core/release/features';
import { t } from '@core/i18n';

/**
 * Local storage namespace of this build: the beta app (served below the
 * stable one, same origin) keeps its own IndexedDB and tab channel, so a
 * newer database schema in beta never breaks the stable app.
 */
const LOCAL_NAMESPACE =
  parseChannel((import.meta.env as Record<string, string | undefined>).VITE_CHANNEL) === 'beta'
    ? 'remcraft-beta'
    : 'remcraft';

/** Meta key: id of the user whose data is stored locally. */
const USER_KEY = 'auth.userId';
/** Meta key: local data was edited by the user (not only seed data). */
const DIRTY_KEY = 'local.dirty';

/** Options for {@link RemCraftApp.create}. */
export interface AppOptions {
  /** Persistence adapter (default: IndexedDB, falling back to memory). */
  persistence?: PersistenceAdapter;
  /** Backend configuration (`null` = offline only; default: from env/settings). */
  backend?: BackendConfig | null;
  /** Remote backend factory (tests inject a fake). */
  remoteFactory?: (user: AuthUser) => RemoteBackend;
  /** Sharing backend factory (`null` user = anonymous visitor; tests inject a fake). */
  shareFactory?: (user: AuthUser | null) => ShareBackend;
  /** Integration (Todoist) backend factory (tests inject a fake). */
  integrationFactory?: (user: AuthUser) => IntegrationBackend;
  /** Seed a fresh installation with the welcome document (default true). */
  seed?: boolean;
}

/** Account/sync state shown in the UI. */
export interface AccountState {
  /** A backend is configured. */
  configured: boolean;
  user: AuthUser | null;
  sync: SyncStatus;
}

/** The running application (data side). */
export class RemCraftApp {
  readonly store = new Store();
  readonly rems = new RemService(this.store);
  readonly practice = new PracticeService(this.store);
  readonly exams = new ExamService(this.store);
  readonly habits = new HabitService(this.store);
  readonly settings = new SettingsService(this.store);
  readonly io = new ImportExportService(this.store, this.rems);
  readonly files: FileService;
  readonly lectures: LectureService;
  readonly sharing: SharingService;
  readonly fokusImport: FokusImportService;
  readonly integrations = new IntegrationService(this.store);
  private readonly integrationFactory: ((user: AuthUser) => IntegrationBackend) | null;
  readonly auth: AuthService | null;

  private readonly persister: Persister;
  private tabSync: TabSync | null = null;
  private sync: SyncEngine | null = null;
  private account: AccountState;
  private readonly accountListeners = new Set<() => void>();
  private unsubscribeSyncStatus: (() => void) | null = null;
  /** Pending background repair of the user's read-only links. */
  private repairTimer: ReturnType<typeof setTimeout> | null = null;
  /** Delay before links are checked for missing files after sign-in. */
  static LINK_REPAIR_DELAY_MS = 20_000;
  /** Serialises {@link handleUser} calls. */
  private userQueue: Promise<void> = Promise.resolve();

  private constructor(
    readonly persistence: PersistenceAdapter,
    private readonly backend: BackendConfig | null,
    private readonly remoteFactory: ((user: AuthUser) => RemoteBackend) | null,
    private readonly shareFactory: ((user: AuthUser | null) => ShareBackend) | null,
    integrationFactory: ((user: AuthUser) => IntegrationBackend) | null = null,
  ) {
    this.persister = new Persister(this.store, persistence);
    this.files = new FileService(persistence);
    this.lectures = new LectureService(this.store, this.rems, this.files);
    this.sharing = new SharingService(this.store, this.files, persistence);
    this.fokusImport = new FokusImportService(
      this.store,
      this.rems,
      this.files,
      this.lectures,
      this.io,
      this.practice,
      this.settings,
    );
    const client = backend ? createSupabase(backend) : null;
    this.auth = client ? new AuthService(client) : null;
    this.remoteFactory =
      remoteFactory ?? (client ? (user) => new SupabaseBackend(client, user.id) : null);
    this.shareFactory =
      shareFactory ??
      (client ? (user) => new SupabaseShareBackend(client, user?.id ?? null) : null);
    this.integrationFactory =
      integrationFactory ??
      (client ? (user) => new SupabaseIntegrationBackend(client, user.id) : null);
    // Anonymous visitors can open read-only share links.
    this.sharing.backend = this.shareFactory?.(null) ?? null;
    this.account = {
      configured: Boolean(backend) || Boolean(remoteFactory),
      user: null,
      sync: { state: 'disabled', lastSyncedAt: null, error: null, pending: 0 },
    };
  }

  /**
   * Creates and initialises the application: loads local data, seeds a fresh
   * installation, connects tabs and restores the signed-in session.
   */
  static async create(options: AppOptions = {}): Promise<RemCraftApp> {
    const persistence = options.persistence ?? (await openPersistence());
    const backend = options.backend === undefined ? getBackendConfig() : options.backend;
    const app = new RemCraftApp(
      persistence,
      backend,
      options.remoteFactory ?? null,
      options.shareFactory ?? null,
      options.integrationFactory ?? null,
    );
    await app.init(options.seed ?? true);
    return app;
  }

  private async init(seed: boolean): Promise<void> {
    const data = await this.persistence.loadAll();
    this.store.load(data);
    if (seed && this.store.count('rems') === 0 && this.store.count('settings') === 0) {
      seedStore(this.store);
    }
    // Remember that the user edited local data (decides what happens on first sign-in).
    const unsubscribeDirty = this.store.onCommit((e) => {
      if (e.origin === 'local') {
        void this.persistence.setMeta(DIRTY_KEY, true);
        unsubscribeDirty();
      }
    });
    this.tabSync = new TabSync(this.store, LOCAL_NAMESPACE);
    this.persister.onLocalWrite = () => this.sync?.schedulePush();

    if (this.auth) {
      this.auth.onChange((user) => void this.handleUser(user));
      await this.handleUser(await this.auth.currentUser());
    }
  }

  /** Starts or stops synchronisation when the signed-in user changes. */
  async handleUser(user: AuthUser | null): Promise<void> {
    // Sign-in events can arrive twice at once (e.g. the session from an OAuth
    // redirect plus the auth event): handle them one after another so only one
    // sync engine is ever started.
    const run = this.userQueue.then(() => this.switchUser(user));
    this.userQueue = run.catch(() => undefined);
    return run;
  }

  /** Starts or stops synchronisation for one user (serialised by {@link handleUser}). */
  private async switchUser(user: AuthUser | null): Promise<void> {
    if (user?.id === this.account.user?.id && (user === null || this.sync)) return;
    this.stopSync();
    if (!user || !this.remoteFactory) {
      this.setAccount({
        user: null,
        sync: { state: 'disabled', lastSyncedAt: null, error: null, pending: 0 },
      });
      return;
    }
    const previousUser = await this.persistence.getMeta<string>(USER_KEY);
    if (previousUser !== user.id) {
      if (previousUser) {
        // Another account's data is on this device: start from scratch.
        await this.resetLocal(false);
      } else if (await this.persistence.getMeta<boolean>(DIRTY_KEY)) {
        // First sign-in with real local data: upload it.
        await this.persister.flush();
        await this.persistence.enqueueAll();
      }
      await this.persistence.setMeta(USER_KEY, user.id);
    }
    const remote = this.remoteFactory(user);
    this.files.remote = remote;
    this.sharing.backend = this.shareFactory?.(user) ?? null;
    const sync = new SyncEngine(this.store, this.persistence, remote, {
      beforePush: () => this.sharing.reconcile(),
      canPush: (space) => this.sharing.canPush(space),
    });
    this.sync = sync;
    void this.integrations.connect(this.integrationFactory?.(user) ?? null);
    this.sharing.onJoined = async () => {
      await sync.resetCursor();
      await sync.syncNow();
    };
    this.unsubscribeSyncStatus = this.sync.onStatus((sync) => this.setAccount({ sync }));
    this.setAccount({ user, sync: this.sync.getStatus() });
    this.sync.start();
    // Links whose file uploads failed earlier get their files once the app
    // runs signed in (after the first sync has settled).
    this.repairTimer = setTimeout(() => {
      this.repairTimer = null;
      void this.sharing.repairLinks().catch(() => undefined);
    }, RemCraftApp.LINK_REPAIR_DELAY_MS);
  }

  private stopSync(): void {
    if (this.repairTimer) clearTimeout(this.repairTimer);
    this.repairTimer = null;
    this.sync?.stop();
    this.sync = null;
    this.files.remote = null;
    this.sharing.backend = this.shareFactory?.(null) ?? null;
    this.sharing.onJoined = null;
    void this.integrations.connect(null);
    this.unsubscribeSyncStatus?.();
    this.unsubscribeSyncStatus = null;
  }

  /** Triggers an immediate synchronisation. */
  syncNow(): Promise<void> {
    return this.sync?.syncNow() ?? Promise.resolve();
  }

  /**
   * Signs out. With `clearLocal`, all local data is removed from this device
   * (recommended on shared devices).
   */
  async signOut(clearLocal: boolean): Promise<void> {
    await this.syncNow();
    this.stopSync();
    await this.auth?.signOut();
    if (clearLocal) await this.resetLocal(true);
    this.setAccount({
      user: null,
      sync: { state: 'disabled', lastSyncedAt: null, error: null, pending: 0 },
    });
  }

  /**
   * Deletes the account with all server data, then the local copy on this
   * device (re-seeding the welcome content).
   *
   * Pending local changes are not uploaded first: they would be deleted
   * right away anyway.
   */
  async deleteAccount(): Promise<void> {
    if (!this.auth) throw new Error(t('No server configured.'));
    this.stopSync();
    try {
      await this.auth.deleteAccount();
    } catch (e) {
      // Still signed in: resume syncing so nothing is lost, then report.
      await this.handleUser(await this.auth.currentUser());
      throw e;
    }
    await this.resetLocal(true);
    this.setAccount({
      user: null,
      sync: { state: 'disabled', lastSyncedAt: null, error: null, pending: 0 },
    });
  }

  /** Deletes all local data (optionally re-seeding the welcome content). */
  async resetLocal(reseed: boolean): Promise<void> {
    await this.persister.flush();
    this.store.clear();
    await this.persistence.clear();
    if (reseed) seedStore(this.store);
  }

  /** Waits until all pending local writes are stored. */
  flush(): Promise<void> {
    return this.persister.flush();
  }

  // --- account state ---------------------------------------------------------

  /** Current account/sync state. */
  getAccount = (): AccountState => this.account;

  /** Subscribes to account/sync state changes. */
  subscribeAccount = (listener: () => void): (() => void) => {
    this.accountListeners.add(listener);
    return () => this.accountListeners.delete(listener);
  };

  private setAccount(patch: Partial<AccountState>): void {
    this.account = { ...this.account, ...patch };
    for (const l of this.accountListeners) l();
  }

  /** Releases resources (tests). */
  dispose(): void {
    this.stopSync();
    this.tabSync?.dispose();
    this.integrations.dispose();
    this.persister.dispose();
  }

  /** The configured backend (for the settings page). */
  get backendConfig(): BackendConfig | null {
    return this.backend;
  }
}

/** Opens IndexedDB, falling back to memory when unavailable. */
async function openPersistence(): Promise<PersistenceAdapter> {
  try {
    const adapter = new DexieAdapter(LOCAL_NAMESPACE);
    await adapter.getMeta('probe');
    return adapter;
  } catch (err) {
    console.warn('IndexedDB unavailable, data will not persist', err);
    return new MemoryAdapter();
  }
}
