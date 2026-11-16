/**
 * RemNote-compatible Markdown import and export.
 *
 * Import turns an outline (see `outline.ts`) into Rems, interpreting card
 * delimiters (`>>`, `::`, `>>A)`, …) and inline markup. Export is the inverse,
 * so a document can round-trip through text and be pasted into RemNote.
 *
 * Extension over RemNote: a `{CORRECT: A, C}` marker before a multiple-choice
 * delimiter marks options A and C as correct (RemNote only supports "first
 * option correct" on import).
 */
import { canonicalDelimiter, splitCardLine } from '../cards/delimiters';
import { answerChildren } from '../cards/generate';
import { mcOptions } from '../cards/content';
import { createRem } from '../model/factories';
import type { RemGraph } from '../model/graph';
import { ordersBetween } from '../model/ordering';
import type { Rem, RemId, Timestamp } from '../model/types';
import { parseInline, serializeInline } from '../richtext/markup';
import { rt, toPlainText } from '../richtext/ops';
import { newId } from '../util/ids';
import type { OutlineNode } from './outline';
import { parseOutline } from './outline';

/** Name of the special tag marking extra card details. */
export const EXTRA_CARD_DETAIL_TAG = 'Extra Card Detail';

/** Callbacks that connect the importer to the knowledge base. */
export interface ImportContext {
  /** Returns the id of the Rem named `name`, creating it if necessary. */
  resolveRef: (name: string) => RemId;
  /** Returns the id of the tag Rem named `name`, creating it if necessary. */
  resolveTag: (name: string) => RemId;
  now?: Timestamp;
  /** Keep empty bullets (RemNote decks often use them as visual spacers). */
  keepEmpty?: boolean;
}

/** Matches the `{CORRECT: A, B}` marker. */
const CORRECT_MARKER = /\s*\{CORRECT:\s*([A-Za-z](?:\s*,\s*[A-Za-z])*)\s*\}\s*/;

/**
 * Converts outline nodes to Rems.
 *
 * @param nodes Parsed outline.
 * @param parentId Parent of the top-level nodes.
 * @param ctx Reference/tag resolution.
 * @param after Order key after which the top-level Rems are inserted.
 * @param before Order key before which they are inserted.
 * @returns The created Rems (parents before children).
 */
export function outlineToRems(
  nodes: readonly OutlineNode[],
  parentId: RemId | null,
  ctx: ImportContext,
  after: string | null = null,
  before: string | null = null,
): Rem[] {
  const now = ctx.now ?? Date.now();
  const out: Rem[] = [];

  const convert = (
    list: readonly OutlineNode[],
    parent: RemId | null,
    lo: string | null,
    hi: string | null,
    mcParent: string[] | null,
  ): void => {
    const kept = ctx.keepEmpty
      ? list
      : list.filter(
          (n) => n.text.trim() !== '' || n.children.length > 0 || n.block.divider || n.block.image,
        );
    const orders = ordersBetween(lo, hi, kept.length);
    kept.forEach((node, index) => {
      const rem = nodeToRem(node, parent, orders[index]!, ctx, now);
      // Multiple-choice options: mark correct ones.
      if (mcParent) {
        const letter = String.fromCharCode(65 + index);
        rem.mcCorrect = mcParent.length > 0 ? mcParent.includes(letter) : index === 0;
      }
      out.push(rem);
      const correct = rem.answerMode === 'mc' ? correctLettersOf(node.text) : null;
      convert(node.children, rem.id, null, null, correct);
    });
  };
  convert(nodes, parentId, after, before, null);
  return out;
}

/** Letters from a `{CORRECT: …}` marker (empty array when absent). */
function correctLettersOf(line: string): string[] {
  const m = CORRECT_MARKER.exec(line);
  return m ? m[1]!.split(',').map((s) => s.trim().toUpperCase()) : [];
}

/** Converts one outline node (without its children). */
function nodeToRem(
  node: OutlineNode,
  parentId: RemId | null,
  order: string,
  ctx: ImportContext,
  now: Timestamp,
): Rem {
  const id = newId();
  const block = node.block;
  if (block.code) {
    return createRem({ id, parentId, order, text: rt(node.text), code: block.code }, now);
  }
  if (block.latexBlock) {
    return createRem(
      { id, parentId, order, text: [{ type: 'latex', source: node.text }], latexBlock: true },
      now,
    );
  }

  const line = node.text.replace(CORRECT_MARKER, ' ').trim();
  const { front, back, spec } = splitCardLine(line);
  const tags: string[] = [];
  const clozeHints: Record<string, string> = {};
  const parse = (s: string): Rem['text'] => {
    const parsed = parseInline(s, { resolveRef: ctx.resolveRef });
    tags.push(...parsed.tags);
    Object.assign(clozeHints, parsed.clozeHints);
    return parsed.text;
  };
  const text = parse(front);
  const backText = back === null ? null : parse(back);

  const rem = createRem(
    {
      id,
      parentId,
      order,
      text,
      back: backText,
      kind: spec?.kind ?? 'plain',
      direction: spec?.direction ?? 'none',
      answerMode: spec?.answerMode ?? 'inline',
    },
    now,
  );
  if (Object.keys(clozeHints).length > 0) rem.clozeHints = clozeHints;
  if (block.heading) rem.heading = block.heading;
  if (block.todo) rem.todo = block.todo;
  if (block.quote) rem.quote = true;
  if (block.divider) rem.divider = true;
  if (block.image) rem.image = { src: block.image.src };
  for (const tag of tags) {
    if (tag.toLowerCase() === EXTRA_CARD_DETAIL_TAG.toLowerCase()) rem.extraCardDetail = true;
    else {
      const tagId = ctx.resolveTag(tag);
      if (!rem.tags.includes(tagId)) rem.tags.push(tagId);
    }
  }
  return rem;
}

/**
 * Parses RemNote/Markdown text into Rems (convenience wrapper).
 */
export function importMarkdown(
  source: string,
  parentId: RemId | null,
  ctx: ImportContext,
  after: string | null = null,
  before: string | null = null,
): Rem[] {
  return outlineToRems(parseOutline(source), parentId, ctx, after, before);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Options for {@link exportMarkdown}. */
export interface ExportOptions {
  /** Spaces per indentation level (RemNote uses 4). */
  indent?: number;
  /** Include the root Rems themselves (otherwise only their children). */
  includeRoot?: boolean;
}

/**
 * Serialises a single Rem to one line of RemNote markup (without bullet).
 *
 * @param rem The Rem.
 * @param graph Graph used for reference names and MC options.
 */
export function remToLine(rem: Rem, graph: RemGraph): string {
  const refName = (id: RemId): string =>
    toPlainText(graph.get(id)?.text ?? [], (r) => toPlainText(graph.get(r)?.text ?? [])) || id;
  const opts = { refName, ...(rem.clozeHints ? { clozeHints: rem.clozeHints } : {}) };
  if (rem.code) return '```' + rem.code.language + '\n' + toPlainText(rem.text) + '\n```';
  if (rem.latexBlock) return `$$${toPlainText(rem.text)}$$`;
  if (rem.divider) return '---';

  let line = serializeInline(rem.text, opts);
  if (rem.image) line = `![${line}](${rem.image.src})`;
  const delim = canonicalDelimiter(rem.kind, rem.direction, rem.answerMode);
  if (delim) {
    if (rem.answerMode === 'mc') {
      const options = mcOptions(graph.children(rem.id));
      const correct = options
        .map((o, i) => (o.correct ? String.fromCharCode(65 + i) : null))
        .filter(Boolean);
      const onlyFirst = correct.length === 1 && correct[0] === 'A';
      if (!onlyFirst && correct.length > 0) line += ` {CORRECT: ${correct.join(', ')}}`;
      line += ` ${delim}`;
    } else if (rem.answerMode !== 'inline') {
      line += ` ${delim}`;
    } else {
      const back = serializeInline(rem.back ?? [], opts);
      line += back === '' ? ` ${delim}` : ` ${delim} ${back}`;
    }
  }
  if (rem.heading) line = `${'#'.repeat(rem.heading)} ${line}`;
  if (rem.todo) line = `[${rem.todo === 'finished' ? 'x' : ' '}] ${line}`;
  if (rem.quote) line = `> ${line}`;
  for (const tagId of rem.tags) line += ` #[[${refName(tagId)}]]`;
  if (rem.extraCardDetail) line += ` #[[${EXTRA_CARD_DETAIL_TAG}]]`;
  return line;
}

/**
 * Exports subtrees as an indented RemNote/Markdown outline.
 *
 * @param graph Rem graph.
 * @param rootIds Rems to export.
 * @param options Formatting options.
 */
export function exportMarkdown(
  graph: RemGraph,
  rootIds: readonly RemId[],
  options: ExportOptions = {},
): string {
  const width = options.indent ?? 4;
  const lines: string[] = [];
  const emit = (rem: Rem, depth: number): void => {
    const pad = ' '.repeat(depth * width);
    const line = remToLine(rem, graph);
    const [first, ...rest] = line.split('\n');
    lines.push(`${pad}- ${first}`);
    // Multi-line blocks (code) keep their lines aligned under the bullet.
    for (const l of rest) lines.push(`${pad}  ${l}`);
    for (const child of graph.children(rem.id)) emit(child, depth + 1);
  };
  for (const id of rootIds) {
    const root = graph.get(id);
    if (!root) continue;
    if (options.includeRoot === false) graph.children(id).forEach((c) => emit(c, 0));
    else emit(root, 0);
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/** Exports the answer options of a multiple-choice Rem in order (helper for tests/UI). */
export function optionTexts(graph: RemGraph, remId: RemId): string[] {
  return answerChildren(graph.children(remId)).map((c) => toPlainText(c.text));
}
