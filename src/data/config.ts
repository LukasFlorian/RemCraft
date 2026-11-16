/**
 * Runtime configuration of the backend.
 *
 * Supabase credentials come from build-time environment variables
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) or - so a static build can
 * be pointed at any project without rebuilding - from values the user enters
 * in Settings, stored in `localStorage`. Build-time values win.
 */

/** Supabase connection settings. */
export interface BackendConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const STORAGE_KEY = 'remcraft.backend';

/** Reads `localStorage` defensively (private mode, SSR). */
function readStored(): Partial<BackendConfig> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<BackendConfig>;
  } catch {
    return {};
  }
}

/** Returns the backend configuration, or `null` for offline-only mode. */
export function getBackendConfig(): BackendConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const stored = readStored();
  const supabaseUrl = env.VITE_SUPABASE_URL || stored.supabaseUrl || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || stored.supabaseAnonKey || '';
  return supabaseUrl && supabaseAnonKey ? { supabaseUrl, supabaseAnonKey } : null;
}

/** True when the configuration was baked into the build. */
export function isBuildTimeConfig(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
}

/** Stores (or clears, with `null`) a user-provided configuration. */
export function setStoredBackendConfig(config: BackendConfig | null): void {
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: configuration simply does not persist.
  }
}
