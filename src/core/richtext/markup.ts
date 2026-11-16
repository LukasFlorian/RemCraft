/**
 * Inline markup <-> rich text conversion.
 *
 * The markup is a small Markdown dialect compatible with RemNote's text
 * import/export:
 *
 * | Markup                        | Meaning                         |
 * |-------------------------------|---------------------------------|
 * | `**bold**`, `*italic*`        | bold / italic                   |
 * | `<u>underline</u>`            | underline                       |
 * | `~~strike~~`                  | strikethrough                   |
 * | `` `code` ``                  | inline code                     |
 * | `<mark class="red">x</mark>`  | highlight                       |
 * | `$x^2$`, `$$x^2$$`            | LaTeX                           |
 * | `{{cloze}}{({hint})}`         | cloze deletion with hint        |
 * | `{{c1::a}} … {{c1::b}}`       | merged cloze (Anki style)       |
 * | `[[Rem name]]`                | reference                       |
 * | `#[[Tag name]]`               | tag (returned separately)       |
 * | `[label](https://…)`          | hyperlink                       |
 * | `\x`                          | literal character `x`           |
 */
import { DELIMITER_PATTERN } from '../cards/delimiters';
import { HIGHLIGHT_COLORS } from '../model/types';
import type { HighlightColor, RemId, RichText, Segment, TextMarks } from '../model/types';
import { newId } from '../util/ids';
import { cleanMarks, normalize } from './ops';
import { findInlineMathEnd } from './scan';

/** Options for {@link parseInline}. */
export interface ParseInlineOptions {
  /**
   * Resolves `[[Name]]` to a Rem id (creating the Rem if desired). When it
   * returns `undefined` the reference is kept as literal text.
   */
  resolveRef?: (name: string) => RemId | undefined;
  /** Generates ids for new clozes (default: random). */
  newClozeId?: () => string;
}

/** Result of {@link parseInline}. */
export interface ParsedInline {
  text: RichText;
  /** Names of tags found as `#[[Tag]]`. */
  tags: string[];
  /** Hints keyed by cloze id. */
  clozeHints: Record<string, string>;
}

/** Mutable state shared by the recursive parser. */
interface ParseContext {
  opts: ParseInlineOptions;
  tags: string[];
  clozeHints: Record<string, string>;
  /** Maps Anki-style group names (`c1`) to cloze ids. */
  groups: Map<string, string>;
}

/**
 * Parses inline markup into rich text.
 *
 * @param src Markup source (single line).
 * @param opts Reference resolution and id generation.
 */
export function parseInline(src: string, opts: ParseInlineOptions = {}): ParsedInline {
  const ctx: ParseContext = { opts, tags: [], clozeHints: {}, groups: new Map() };
  const text = trimRichText(normalize(parseRun(src, {}, ctx)));
  return { text, tags: ctx.tags, clozeHints: ctx.clozeHints };
}

/** Narrows an arbitrary string to a highlight colour. */
function asColor(value: string | undefined): HighlightColor {
  return (HIGHLIGHT_COLORS as readonly string[]).includes(value ?? '') ? (value as HighlightColor) : 'yellow';
}

/**
 * Parses a run of markup with the given base marks. Recursion handles nested
 * constructs (clozes and links may contain formatting).
 */
function parseRun(src: string, base: TextMarks, ctx: ParseContext): Segment[] {
  const out: Segment[] = [];
  const marks: TextMarks = { ...base };
  let buf = '';

  /** Emits the buffered text with the currently active marks. */
  const flush = (): void => {
    if (buf === '') return;
    const m = cleanMarks({ ...marks });
    out.push(m ? { type: 'text', text: buf, marks: m } : { type: 'text', text: buf });
    buf = '';
  };
  /** Pushes a non-text segment carrying the active marks. */
  const pushSeg = (seg: Segment, extra: TextMarks = {}): void => {
    flush();
    const m = cleanMarks({ ...marks, ...extra });
    out.push(m ? { ...seg, marks: m } : seg);
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    // Escapes: the next character is literal.
    if (c === '\\' && i + 1 < src.length) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    // Bold (checked before italic because `**` starts with `*`).
    if (src.startsWith('**', i)) {
      if (marks.bold) {
        flush();
        marks.bold = false;
        i += 2;
        continue;
      }
      if (src.indexOf('**', i + 2) > i + 2) {
        flush();
        marks.bold = true;
        i += 2;
        continue;
      }
    }
    if (src.startsWith('~~', i)) {
      if (marks.strike) {
        flush();
        marks.strike = false;
        i += 2;
        continue;
      }
      if (src.indexOf('~~', i + 2) > i + 2) {
        flush();
        marks.strike = true;
        i += 2;
        continue;
      }
    }
    if (src.startsWith('<u>', i)) {
      flush();
      marks.underline = true;
      i += 3;
      continue;
    }
    if (src.startsWith('</u>', i)) {
      flush();
      marks.underline = false;
      i += 4;
      continue;
    }
    if (src.startsWith('<mark', i)) {
      const end = src.indexOf('>', i);
      if (end !== -1) {
        flush();
        const color = /(?:class|data-color)="([a-z]+)"/.exec(src.slice(i, end))?.[1];
        marks.highlight = asColor(color);
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('</mark>', i)) {
      flush();
      delete marks.highlight;
      i += 7;
      continue;
    }
    // Inline code.
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        const m = cleanMarks({ ...marks, code: true });
        out.push({ type: 'text', text: src.slice(i + 1, end), ...(m ? { marks: m } : {}) });
        i = end + 1;
        continue;
      }
    }
    // LaTeX.
    if (src.startsWith('$$', i)) {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 2) {
        pushSeg({ type: 'latex', source: src.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }
    if (c === '$') {
      const end = findInlineMathEnd(src, i);
      if (end !== -1) {
        pushSeg({ type: 'latex', source: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Clozes.
    if (src.startsWith('{{', i)) {
      const end = src.indexOf('}}', i + 2);
      if (end > i + 1) {
        let inner = src.slice(i + 2, end);
        let hint: string | undefined;
        let id: string;
        const group = /^c(\d+)::/.exec(inner);
        if (group) {
          // Anki style: {{c1::text}} or {{c1::text::hint}}.
          inner = inner.slice(group[0].length);
          const hintAt = inner.lastIndexOf('::');
          if (hintAt !== -1) {
            hint = inner.slice(hintAt + 2);
            inner = inner.slice(0, hintAt);
          }
          const key = `c${group[1]}`;
          id = ctx.groups.get(key) ?? (ctx.opts.newClozeId ?? (() => newId(8)))();
          ctx.groups.set(key, id);
        } else {
          id = (ctx.opts.newClozeId ?? (() => newId(8)))();
        }
        flush();
        out.push(...parseRun(inner, { ...marks, cloze: id }, ctx));
        i = end + 2;
        // RemNote style hint directly after the cloze.
        if (src.startsWith('{({', i)) {
          const hintEnd = src.indexOf('})}', i + 3);
          if (hintEnd !== -1) {
            hint = src.slice(i + 3, hintEnd);
            i = hintEnd + 3;
          }
        }
        if (hint) ctx.clozeHints[id] = hint;
        continue;
      }
    }
    // Tags.
    if (src.startsWith('#[[', i)) {
      const end = src.indexOf(']]', i + 3);
      if (end !== -1) {
        flush();
        ctx.tags.push(src.slice(i + 3, end).trim());
        i = end + 2;
        continue;
      }
    }
    // References.
    if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i + 2);
      if (end !== -1) {
        const name = src.slice(i + 2, end);
        const remId = ctx.opts.resolveRef?.(name.trim());
        if (remId) pushSeg({ type: 'ref', remId });
        else buf += `[[${name}]]`;
        i = end + 2;
        continue;
      }
    }
    // Links.
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push(...parseRun(m[1]!, { ...marks, link: m[2]! }, ctx));
        i += m[0].length;
        continue;
      }
    }
    // Italic: `*text*` with non-space after the opening star.
    if (c === '*') {
      if (marks.italic) {
        flush();
        marks.italic = false;
        i += 1;
        continue;
      }
      const next = src[i + 1];
      const close = src.indexOf('*', i + 1);
      if (next !== undefined && !/\s/.test(next) && close > i + 1) {
        flush();
        marks.italic = true;
        i += 1;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Removes leading whitespace of the first and trailing whitespace of the last text segment. */
function trimRichText(value: RichText): RichText {
  const out = [...value];
  const first = out[0];
  if (first?.type === 'text') {
    const t = first.text.replace(/^\s+/, '');
    if (t === '') out.shift();
    else out[0] = { ...first, text: t };
  }
  const last = out[out.length - 1];
  if (last?.type === 'text') {
    const t = last.text.replace(/\s+$/, '');
    if (t === '') out.pop();
    else out[out.length - 1] = { ...last, text: t };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** Options for {@link serializeInline}. */
export interface SerializeInlineOptions {
  /** Returns the display name of a referenced Rem. */
  refName?: (remId: RemId) => string;
  /** Cloze hints of the Rem being serialised. */
  clozeHints?: Record<string, string>;
}

/**
 * Escapes text so that re-parsing yields the same characters: markup
 * characters and card delimiters get a backslash.
 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*`$])/g, '\\$1')
    .replace(/~~/g, '\\~\\~')
    .replace(/\{\{/g, '\\{\\{')
    .replace(/\[\[/g, '\\[\\[')
    .replace(/<(\/?(?:u|mark))/g, '\\<$1')
    .replace(DELIMITER_PATTERN, (m) => m.split('').map((ch) => `\\${ch}`).join(''));
}

/** Serialises one segment (without its cloze mark). */
function serializeSegment(seg: Segment, opts: SerializeInlineOptions): string {
  let body: string;
  if (seg.type === 'text') {
    body = seg.marks?.code ? `\`${seg.text}\`` : escapeText(seg.text);
  } else if (seg.type === 'ref') {
    body = `[[${opts.refName?.(seg.remId) ?? seg.remId}]]`;
  } else {
    body = `$${seg.source}$`;
  }
  const m = seg.marks ?? {};
  if (m.link) body = `[${body}](${m.link})`;
  if (m.bold) body = `**${body}**`;
  if (m.italic) body = `*${body}*`;
  if (m.strike) body = `~~${body}~~`;
  if (m.underline) body = `<u>${body}</u>`;
  if (m.highlight) body = `<mark class="${m.highlight}">${body}</mark>`;
  return body;
}

/**
 * Serialises rich text to inline markup (the inverse of {@link parseInline}).
 *
 * @param value Rich text to serialise.
 * @param opts Reference names and cloze hints.
 */
export function serializeInline(value: RichText, opts: SerializeInlineOptions = {}): string {
  // Count contiguous runs per cloze id: ids with several runs are merged
  // clozes and need the Anki-style `cN::` group prefix.
  const runs = new Map<string, number>();
  let prev: string | undefined;
  for (const seg of value) {
    const id = seg.marks?.cloze;
    if (id && id !== prev) runs.set(id, (runs.get(id) ?? 0) + 1);
    prev = id;
  }
  const groupNumbers = new Map<string, number>();
  const remainingRuns = new Map(runs);

  let out = '';
  let i = 0;
  while (i < value.length) {
    const seg = value[i]!;
    const clozeId = seg.marks?.cloze;
    if (!clozeId) {
      out += serializeSegment(seg, opts);
      i++;
      continue;
    }
    let j = i;
    let inner = '';
    while (j < value.length && value[j]!.marks?.cloze === clozeId) {
      const s = value[j]!;
      const { cloze: _cloze, ...rest } = s.marks ?? {};
      const m = cleanMarks(rest);
      inner += serializeSegment(m ? { ...s, marks: m } : ({ ...s, marks: undefined } as Segment), opts);
      j++;
    }
    const merged = (runs.get(clozeId) ?? 0) > 1;
    let prefix = '';
    if (merged) {
      if (!groupNumbers.has(clozeId)) groupNumbers.set(clozeId, groupNumbers.size + 1);
      prefix = `c${groupNumbers.get(clozeId)}::`;
    }
    out += `{{${prefix}${inner}}}`;
    const left = (remainingRuns.get(clozeId) ?? 1) - 1;
    remainingRuns.set(clozeId, left);
    const hint = opts.clozeHints?.[clozeId];
    if (hint && left === 0) out += `{({${hint}})}`;
    i = j;
  }
  return out;
}
