/**
 * Operator details for the legal notice (Impressum) and privacy policy.
 *
 * They come from build-time environment variables so personal data of the
 * operator never has to be committed to the repository. The deploy workflow
 * fills them from repository variables (`LEGAL_NAME`, `LEGAL_ADDRESS`,
 * `LEGAL_EMAIL`, `LEGAL_DATA_REGION`).
 */

/** Operator details shown on the legal page. */
export interface LegalInfo {
  /** Full name of the person responsible. */
  name: string;
  /** Postal address (lines separated by `\n` or `|`). */
  address: string[];
  /** Contact email address. */
  email: string;
  /** Where the Supabase project stores its data, e.g. "EU (Frankfurt)". */
  dataRegion: string;
}

/** Environment variables as Vite exposes them. */
type Env = Record<string, string | undefined>;

/**
 * Reads the operator details.
 *
 * Args:
 *   env: Environment variables (defaults to `import.meta.env`).
 *
 * Returns:
 *   The details; missing values are empty strings / an empty address.
 */
export function legalInfo(env: Env = import.meta.env as Env): LegalInfo {
  const address = (env.VITE_LEGAL_ADDRESS ?? '')
    .split(/\\n|\n|\|/) // "\n" typed literally in a repository variable, a real newline or "|"
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    name: (env.VITE_LEGAL_NAME ?? '').trim(),
    address,
    email: (env.VITE_LEGAL_EMAIL ?? '').trim(),
    dataRegion: (env.VITE_LEGAL_DATA_REGION ?? '').trim(),
  };
}

/**
 * True when the details required for an Impressum are present.
 *
 * Args:
 *   info: Operator details.
 */
export function isLegalInfoComplete(info: LegalInfo): boolean {
  return Boolean(info.name && info.address.length > 0 && info.email);
}

/** Date the privacy policy was last changed (shown as "Stand"). */
export const PRIVACY_VERSION = '18.11.2026';
