/**
 * CSV/TSV import (Quizlet, Anki "Notes in Plain Text", Excel exports).
 */
import { createRem } from '../model/factories';
import { ordersBetween } from '../model/ordering';
import type { Rem, RemId, Timestamp } from '../model/types';
import { parseInline } from '../richtext/markup';

/**
 * Guesses the delimiter of delimited text by counting candidates in the first
 * lines (tab, semicolon, comma).
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const candidates = ['\t', ';', ','];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC-4180 compliant CSV parser (quoted fields, escaped quotes, newlines in
 * quotes).
 *
 * @param text Delimited text.
 * @param delimiter Field delimiter (auto-detected when omitted).
 * @returns Rows of fields; empty trailing lines are dropped.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Options for {@link csvToCardRems}. */
export interface CsvImportOptions {
  parentId: RemId;
  frontColumn?: number;
  backColumn?: number;
  hasHeader?: boolean;
  /** Create two-way cards instead of forward cards. */
  bothDirections?: boolean;
  now?: Timestamp;
}

/**
 * Turns rows into basic flashcard Rems (`front >> back`). Inline markup and
 * clozes in the cells are honoured.
 */
export function csvToCardRems(rows: readonly string[][], opts: CsvImportOptions): Rem[] {
  const f = opts.frontColumn ?? 0;
  const b = opts.backColumn ?? 1;
  const data = opts.hasHeader ? rows.slice(1) : rows;
  const orders = ordersBetween(null, null, data.length);
  return data.map((row, i) => {
    const front = parseInline((row[f] ?? '').trim());
    const backText = (row[b] ?? '').trim();
    const back = parseInline(backText);
    const isCloze = backText === '' && front.text.some((s) => s.marks?.cloze);
    return createRem(
      {
        parentId: opts.parentId,
        order: orders[i]!,
        text: front.text,
        back: isCloze ? null : back.text,
        direction: isCloze ? 'none' : opts.bothDirections ? 'both' : 'forward',
        ...(Object.keys(front.clozeHints).length > 0 ? { clozeHints: front.clozeHints } : {}),
      },
      opts.now,
    );
  });
}
