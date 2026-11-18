/**
 * AI editing of Rems: the scope is shown to a language model as numbered
 * RemNote-syntax lines; the model answers with a list of operations (update a
 * line, add a line, delete a Rem). The operations are validated here and
 * shown as a preview before anything is applied.
 *
 * Pure functions only - prompt building, response parsing and validation.
 */
import { remToLine } from '../io/markdown';
import type { RemGraph } from '../model/graph';
import { walkSubtree } from '../model/graph';
import type { RemId } from '../model/types';

/** A Rem as the model sees it. */
export interface EditEntry {
  /** Short reference used in the prompt (`r1`, `r2`, …) instead of the real id. */
  ref: string;
  remId: RemId;
  /** Ref of the parent (`null` for the scope root). */
  parentRef: string | null;
  depth: number;
  /** The Rem as one RemNote-syntax line. */
  line: string;
  /** Multiple-choice option: whether it is marked correct. */
  correct?: boolean;
}

/** One operation proposed by the model (with refs resolved to ids). */
export type EditOp =
  | { op: 'update'; remId: RemId; line?: string; correct?: boolean; before: string }
  | { op: 'add'; parentId: RemId; afterId: RemId | null; line: string }
  | { op: 'delete'; remId: RemId; before: string };

/** Characters of scope text per request (keeps prompts within model limits). */
export const BATCH_CHARS = 12_000;

/**
 * The scope as entries in document order.
 *
 * @param graph Rem graph.
 * @param rootId Root of the scope (included).
 * @param limit Maximum number of Rems.
 */
export function scopeEntries(graph: RemGraph, rootId: RemId, limit = 5000): EditEntry[] {
  const out: EditEntry[] = [];
  const refOf = new Map<RemId, string>();
  walkSubtree(graph, rootId, (rem, depth) => {
    if (out.length >= limit) return false;
    const ref = `r${out.length + 1}`;
    refOf.set(rem.id, ref);
    const parent = graph.get(rem.parentId ?? '');
    out.push({
      ref,
      remId: rem.id,
      parentRef: rem.id === rootId ? null : (refOf.get(rem.parentId ?? '') ?? null),
      depth,
      line: remToLine(rem, graph),
      ...(parent?.answerMode === 'mc' ? { correct: Boolean(rem.mcCorrect) } : {}),
    });
  });
  return out;
}

/**
 * Splits the entries into batches of whole top-level subtrees (below the
 * root), each at most {@link BATCH_CHARS} long where possible.
 */
export function batchEntries(entries: readonly EditEntry[]): EditEntry[][] {
  const batches: EditEntry[][] = [];
  let current: EditEntry[] = [];
  let size = 0;
  for (const e of entries) {
    // A new top-level subtree may start a new batch.
    if (e.depth <= 1 && size > BATCH_CHARS && current.length > 0) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(e);
    size += e.line.length + 16;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The scope as prompt text: one indented line per Rem with its ref. */
export function entriesToText(entries: readonly EditEntry[]): string {
  return entries
    .map(
      (e) =>
        `${'  '.repeat(e.depth)}[${e.ref}] ${e.line}${e.correct === undefined ? '' : e.correct ? '   (option: correct)' : '   (option: wrong)'}`,
    )
    .join('\n');
}

/** System prompt: the syntax and the answer format. */
export const EDIT_SYSTEM_PROMPT = `You edit notes and flashcards of RemCraft, a RemNote-like outliner.
Each Rem is shown as one line in RemNote syntax, prefixed with its reference like [r12]; indentation shows nesting.

Syntax of a line:
- Basic card: "Front >> Back" (forward), "Front << Back" (backward), "Front <> Back" (both), "Front >- Back" (disabled).
- Concept / descriptor: "Term :: Definition", "Attribute ;; Value" (also ":>", ":<", ";>", ";<").
- Cloze: "{{hidden text}}" inside the line; with a hint: "{{text}}{({hint})}".
- Multi-line answer (the children are the answer): "Question >>>" (set), "Question >>1." (ordered list), "Term :::" (concept).
- Multiple choice: "Question >>A)" - the children are the options. Correctness of an option is NOT written in the line; use the "correct" field on the option's update.
- Formatting: **bold**, *italic*, \`code\`, $latex$, ==highlight==, [[reference]], #[[tag]].
- Headings "# ", todos "[ ] " / "[x] ".

Answer ONLY with JSON of this shape:
{"summary": "one sentence in German", "ops": [
  {"op": "update", "ref": "r12", "line": "new line"},
  {"op": "update", "ref": "r13", "correct": true},
  {"op": "add", "parent": "r10", "after": "r12", "line": "new line"},
  {"op": "delete", "ref": "r14"}
]}
Rules:
- Change only what the instruction asks for. Keep the wording, language, references and tags otherwise.
- "update" with "line" replaces the whole line of that Rem; its children stay unless you change them too.
- "add": "parent" is the ref of the new Rem's parent, "after" the ref of the sibling it follows (or null for the first position).
- "delete" removes the Rem with its children - use it only when asked.
- If nothing needs to change, answer {"summary": "...", "ops": []}.`;

/** The user message of one batch. */
export function editUserPrompt(instruction: string, entries: readonly EditEntry[]): string {
  return `Instruction: ${instruction}\n\nRems:\n${entriesToText(entries)}`;
}

/** Result of parsing a model answer. */
export interface ParsedEdit {
  summary: string;
  ops: EditOp[];
  /** Problems with single operations (they are dropped). */
  warnings: string[];
}

/** Extracts the JSON object from an answer (tolerates code fences and prose). */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Die KI hat kein JSON geantwortet.');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Parses and validates a model answer against the entries it was given.
 *
 * @param answer Raw model output.
 * @param entries The batch the answer refers to.
 */
export function parseEditAnswer(answer: string, entries: readonly EditEntry[]): ParsedEdit {
  const data = extractJson(answer) as { summary?: unknown; ops?: unknown };
  const byRef = new Map(entries.map((e) => [e.ref, e] as const));
  const ops: EditOp[] = [];
  const warnings: string[] = [];
  const raw = Array.isArray(data.ops) ? (data.ops as Record<string, unknown>[]) : [];
  for (const o of raw) {
    const str = (k: string): string | undefined =>
      typeof o[k] === 'string' ? (o[k] as string) : undefined;
    const entry = byRef.get(str('ref') ?? '');
    if (o.op === 'update') {
      if (!entry) {
        warnings.push(`Unbekannte Referenz ${str('ref') ?? '?'}`);
        continue;
      }
      const line = str('line')?.replace(/\n/g, ' ').trim();
      const correct = typeof o.correct === 'boolean' ? o.correct : undefined;
      const lineChanged = line !== undefined && line !== '' && line !== entry.line;
      const correctChanged =
        correct !== undefined && entry.correct !== undefined && correct !== entry.correct;
      if (!lineChanged && !correctChanged) continue;
      ops.push({
        op: 'update',
        remId: entry.remId,
        before: entry.line,
        ...(lineChanged ? { line } : {}),
        ...(correctChanged ? { correct } : {}),
      });
    } else if (o.op === 'add') {
      const parent = byRef.get(str('parent') ?? '');
      const line = str('line')?.replace(/\n/g, ' ').trim();
      if (!parent || !line) {
        warnings.push('Neue Zeile ohne gültiges Elternelement übersprungen');
        continue;
      }
      const after = o.after === null ? null : byRef.get(str('after') ?? '');
      ops.push({
        op: 'add',
        parentId: parent.remId,
        afterId:
          after === null ? null : after && after.parentRef === parent.ref ? after.remId : null,
        line,
      });
    } else if (o.op === 'delete') {
      if (!entry || entry.parentRef === null) {
        warnings.push('Löschen übersprungen (unbekannt oder Wurzel des Bereichs)');
        continue;
      }
      ops.push({ op: 'delete', remId: entry.remId, before: entry.line });
    } else warnings.push(`Unbekannte Operation ${String(o.op)}`);
  }
  return { summary: typeof data.summary === 'string' ? data.summary : '', ops, warnings };
}
