/**
 * What a dropped (or picked) file is, so it can be imported the right way
 * without asking: slide decks, card files, shares, backups, text formats and
 * plain attachments.
 */
import { CARD_FORMAT, LEGACY_CARD_FORMAT } from '../lecture/cardFile';
import { SNAPSHOT_FORMAT } from '../sharing/snapshot';

/** Kinds of importable files. */
export type FileKind =
  | 'pdf' // slide deck
  | 'cards' // RemCraft/Fokus card file (*.cards.json, *.fokus.json)
  | 'share' // shared snapshot (*.remcraft.json)
  | 'backup' // full RemCraft backup
  | 'markdown' // RemNote/Markdown/Obsidian/Notion text
  | 'csv' // CSV/TSV, Anki and Quizlet text exports
  | 'opml' // Workflowy/Dynalist outlines
  | 'image' // stored as an image Rem
  | 'file'; // anything else: stored as an attachment

/** Extension of a file name in lower case, without the dot. */
function extension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * Kind of a file from its name and MIME type. JSON files need their content
 * (`classifyJson`); this returns `'file'` for unknown JSON.
 *
 * Args:
 *   name: File name.
 *   mimeType: MIME type reported by the browser (may be empty).
 */
export function classifyByName(name: string, mimeType = ''): FileKind {
  const ext = extension(name);
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') {
    // Anki/Quizlet exports are tab separated text; the importer detects that.
    return 'markdown';
  }
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'opml') return 'opml';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'image';
  if (/\.cards\.json$/i.test(name) || /\.fokus\.json$/i.test(name)) return 'cards';
  if (/\.remcraft\.json$/i.test(name)) return 'share';
  return 'file';
}

/**
 * Kind of a JSON file from its content.
 *
 * Args:
 *   data: Parsed JSON.
 *
 * Returns:
 *   `cards`, `share` or `backup`, or null for other JSON.
 */
export function classifyJson(data: unknown): FileKind | null {
  const format = (data as { format?: unknown } | null)?.format;
  if (format === CARD_FORMAT || format === LEGACY_CARD_FORMAT) return 'cards';
  if (format === SNAPSHOT_FORMAT) return 'share';
  if (format === 'remcraft-backup') return 'backup';
  return null;
}

/**
 * Whether a tab separated `.txt` (Anki/Quizlet export) should be read as CSV:
 * most non-empty lines contain a tab.
 *
 * Args:
 *   text: File content.
 */
export function looksTabSeparated(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return false;
  return lines.filter((l) => l.includes('\t')).length / lines.length >= 0.8;
}
