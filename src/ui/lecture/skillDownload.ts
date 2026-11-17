/**
 * Download of the `remcraft-flashcards` Claude skill.
 *
 * The archive is fetched and checked before it is saved: a plain link can be
 * answered with the app's `index.html` (service-worker or hosting fallback),
 * which then lands on disk as a broken `.zip`.
 */
import { downloadBlob } from '../hooks/useFilePicker';

/** Download URL of the skill (built by `scripts/build-skill.mjs`). */
export const SKILL_URL = `${import.meta.env.BASE_URL}remcraft-flashcards.zip`;

/** File name of the downloaded skill. */
export const SKILL_FILE = 'remcraft-flashcards.zip';

/**
 * True when the bytes start with a ZIP signature ("PK\x03\x04").
 *
 * @param bytes Start of the file.
 */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Fetches the skill archive, checks it and saves it.
 *
 * @throws Error with a user-facing message when the archive is missing or broken.
 */
export async function downloadSkill(): Promise<void> {
  // `no-store`: never reuse a cached (possibly wrong) response.
  const res = await fetch(SKILL_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Skill konnte nicht geladen werden (HTTP ${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!isZip(buf))
    throw new Error('Skill-Download ist kein ZIP – bitte Seite neu laden und erneut versuchen');
  downloadBlob(SKILL_FILE, new Blob([buf], { type: 'application/zip' }));
}
