/**
 * Pure operations on {@link RichText} values.
 */
import type { RemId, RichText, Segment, TextMarks } from '../model/types';

/** Resolves a referenced Rem to its display text (used for plain-text conversion). */
export type RefResolver = (remId: RemId) => string | undefined;

/**
 * Creates rich text from a plain string.
 *
 * @param text Plain text.
 * @param marks Optional marks applied to the whole text.
 */
export function rt(text: string, marks?: TextMarks): RichText {
  if (text === '') return [];
  return [marks && Object.keys(marks).length > 0 ? { type: 'text', text, marks } : { type: 'text', text }];
}

/** True when the rich text contains no visible content. */
export function isEmpty(value: RichText | null | undefined): boolean {
  if (!value || value.length === 0) return true;
  return value.every((s) => s.type === 'text' && s.text.trim() === '');
}

/**
 * Converts rich text to plain text.
 *
 * @param value Rich text.
 * @param resolveRef Resolves references to their text; unresolved references
 *   become an empty string.
 */
export function toPlainText(value: RichText | null | undefined, resolveRef?: RefResolver): string {
  if (!value) return '';
  let out = '';
  for (const seg of value) {
    switch (seg.type) {
      case 'text':
        out += seg.text;
        break;
      case 'ref':
        out += resolveRef?.(seg.remId) ?? '';
        break;
      case 'latex':
        out += seg.source;
        break;
    }
  }
  return out;
}

/** Shallow equality of two mark sets (absent and `false` are equivalent). */
export function marksEqual(a: TextMarks | undefined, b: TextMarks | undefined): boolean {
  const ka = a ? (Object.keys(a) as (keyof TextMarks)[]).filter((k) => a[k]) : [];
  const kb = b ? (Object.keys(b) as (keyof TextMarks)[]).filter((k) => b[k]) : [];
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a?.[k] === b?.[k]);
}

/** Removes falsy entries from a mark set; returns `undefined` when empty. */
export function cleanMarks(marks: TextMarks | undefined): TextMarks | undefined {
  if (!marks) return undefined;
  const out: TextMarks = {};
  let any = false;
  for (const [k, v] of Object.entries(marks) as [keyof TextMarks, unknown][]) {
    if (v !== undefined && v !== false && v !== '') {
      (out as Record<string, unknown>)[k] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Normalises rich text: drops empty text runs, merges adjacent text runs with
 * equal marks and removes empty mark objects. Normalised values compare
 * structurally, which keeps change detection and sync cheap.
 */
export function normalize(value: RichText): RichText {
  const out: RichText = [];
  for (const seg of value) {
    const marks = cleanMarks(seg.marks);
    if (seg.type === 'text') {
      if (seg.text === '') continue;
      const prev = out[out.length - 1];
      if (prev && prev.type === 'text' && marksEqual(prev.marks, marks)) {
        out[out.length - 1] = withMarks({ type: 'text', text: prev.text + seg.text }, marks);
        continue;
      }
      out.push(withMarks({ type: 'text', text: seg.text }, marks));
    } else if (seg.type === 'ref') {
      out.push(withMarks({ type: 'ref', remId: seg.remId }, marks));
    } else {
      out.push(withMarks({ type: 'latex', source: seg.source }, marks));
    }
  }
  return out;
}

/** Returns `seg` with `marks` attached only when non-empty. */
function withMarks<T extends Segment>(seg: T, marks: TextMarks | undefined): T {
  return marks ? { ...seg, marks } : seg;
}

/** Structural equality of two rich-text values (after normalisation). */
export function richTextEqual(a: RichText | null, b: RichText | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** Distinct cloze ids in order of first appearance. */
export function clozeIds(value: RichText | null | undefined): string[] {
  const ids: string[] = [];
  for (const seg of value ?? []) {
    const id = seg.marks?.cloze;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Ids of all Rems referenced by the rich text. */
export function referencedRemIds(value: RichText | null | undefined): RemId[] {
  const ids: RemId[] = [];
  for (const seg of value ?? []) {
    if (seg.type === 'ref' && !ids.includes(seg.remId)) ids.push(seg.remId);
  }
  return ids;
}

/**
 * Applies `fn` to the marks of every segment, returning new rich text.
 * Useful for bulk operations like removing a cloze or a highlight.
 */
export function mapMarks(value: RichText, fn: (marks: TextMarks | undefined, seg: Segment) => TextMarks | undefined): RichText {
  return normalize(value.map((seg) => ({ ...seg, marks: fn(seg.marks, seg) }) as Segment));
}

/** Removes the cloze mark with the given id (or all clozes when omitted). */
export function removeCloze(value: RichText, clozeId?: string): RichText {
  return mapMarks(value, (m) => {
    if (!m?.cloze || (clozeId !== undefined && m.cloze !== clozeId)) return m;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cloze, ...rest } = m;
    return rest;
  });
}

/**
 * Merges clozes: every cloze in `ids` is re-labelled with the first id so a
 * single card hides all of them.
 */
export function mergeClozes(value: RichText, ids: string[]): RichText {
  const target = ids[0];
  if (target === undefined) return value;
  return mapMarks(value, (m) => (m?.cloze && ids.includes(m.cloze) ? { ...m, cloze: target } : m));
}

/**
 * Splits a merged cloze: every contiguous run of segments with the given id
 * receives its own id (generated by `makeId`).
 */
export function splitCloze(value: RichText, clozeId: string, makeId: () => string): RichText {
  let runId: string | null = null;
  let first = true;
  const out = value.map((seg) => {
    if (seg.marks?.cloze !== clozeId) {
      runId = null;
      return seg;
    }
    if (runId === null) {
      // The first run keeps the original id so existing review history stays attached.
      runId = first ? clozeId : makeId();
      first = false;
    }
    return { ...seg, marks: { ...seg.marks, cloze: runId } } as Segment;
  });
  return normalize(out);
}

/** Concatenates rich-text values. */
export function concat(...parts: RichText[]): RichText {
  return normalize(parts.flat());
}
