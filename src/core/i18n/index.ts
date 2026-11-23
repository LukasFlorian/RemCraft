/**
 * Interface language (English or German).
 *
 * Texts are written in English in the code and passed through `t()`, which
 * returns the German translation from `de.ts` when German is active. Values
 * are filled into `{name}` placeholders.
 *
 * The language is read once at startup (synchronously, from localStorage,
 * else from the browser language), so texts defined at module level are
 * translated too. Changing it reloads the app; the choice is also stored in
 * the synced settings so other devices follow.
 */
import { DE } from './de';

/** Supported languages. */
export type Lang = 'en' | 'de';

/** localStorage key of the language of this device. */
export const LANG_KEY = 'remcraft.lang';

/**
 * Language from a stored value or the browser language.
 *
 * Args:
 *   stored: Value from localStorage (may be null).
 *   browser: `navigator.language` (e.g. "de-DE").
 */
export function detectLang(stored: string | null, browser: string | undefined): Lang {
  if (stored === 'en' || stored === 'de') return stored;
  return (browser ?? '').toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Reads localStorage defensively (private mode, tests). */
function readStored(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

let current: Lang = detectLang(
  readStored(),
  typeof navigator === 'undefined' ? undefined : navigator.language,
);

/** The active language. */
export function lang(): Lang {
  return current;
}

/**
 * Sets the language for this device (takes full effect after a reload).
 *
 * Args:
 *   next: The language.
 */
export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Private mode: only for this session.
  }
}

/**
 * Translates a text.
 *
 * Args:
 *   text: English text (the key).
 *   vars: Values for `{name}` placeholders.
 *
 * Returns:
 *   The text in the active language with the values filled in.
 */
export function t(text: string, vars?: Record<string, unknown>): string {
  const s = current === 'de' ? (DE[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Locale for dates and numbers of the active language. */
export function locale(): string {
  return current === 'de' ? 'de-DE' : 'en-GB';
}

/**
 * Translates a text with a count, choosing singular or plural.
 *
 * Args:
 *   one: English text for exactly one, e.g. "{n} card".
 *   other: English text otherwise, e.g. "{n} cards".
 *   n: The count (available as `{n}`).
 *   vars: Further values.
 */
export function tn(one: string, other: string, n: number, vars?: Record<string, unknown>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}
