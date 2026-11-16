/**
 * Typing behaviour of the Rem editor: card delimiters turn into separator
 * nodes (`>>` → →), clozes start with `{{`, Markdown shortcuts format text
 * and block prefixes (`# `, `[] `, `> `) set powerups.
 */
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { DELIMITERS } from '@core/cards/delimiters';
import type { Rem } from '@core/model/types';
import { newId } from '@core/util/ids';
import { ATOM_CHAR, schema } from './schema';

/** Tokens that can be produced by typing, longest first. */
const TOKENS = [...new Set(DELIMITERS.map((d) => d.token))].sort((a, b) => b.length - a.length);

/** Block-level change requested by a typed prefix. */
export type BlockShortcut = Partial<Pick<Rem, 'heading' | 'todo' | 'quote' | 'divider' | 'code' | 'latexBlock'>>;

/** Prefixes typed at the start of a Rem followed by a space. */
const BLOCK_PREFIXES: Record<string, BlockShortcut> = {
  '#': { heading: 1 },
  '##': { heading: 2 },
  '###': { heading: 3 },
  '[]': { todo: 'unfinished' },
  '[ ]': { todo: 'unfinished' },
  '[x]': { todo: 'finished' },
  '>': { quote: true },
};

/** True when the document already contains a separator. */
function hasSeparator(view: EditorView): boolean {
  let found = false;
  view.state.doc.descendants((n) => {
    if (n.type.name === 'separator') found = true;
    return !found;
  });
  return found;
}

/**
 * Handles typed text. Returns true when the input was consumed.
 *
 * @param view Editor view.
 * @param from Start of the replaced range.
 * @param to End of the replaced range.
 * @param text Typed text.
 * @param onBlock Applies a block-level shortcut to the Rem.
 */
export function handleTextInput(view: EditorView, from: number, to: number, text: string, onBlock: (change: BlockShortcut) => void): boolean {
  const { state } = view;
  const $from = state.doc.resolve(from);
  const offset = $from.parentOffset;
  const before = $from.parent.textBetween(Math.max(0, offset - 8), offset, undefined, ATOM_CHAR);
  const activeMarks = state.storedMarks ?? $from.marks();
  const inCode = activeMarks.some((m) => m.type === schema.marks.code);
  const clozeMark = activeMarks.find((m) => m.type === schema.marks.cloze);

  // --- clozes ---------------------------------------------------------------
  if (text === '{' && from < to) {
    // A single brace wraps the selection in a cloze.
    view.dispatch(state.tr.addMark(from, to, schema.marks.cloze!.create({ id: newId(8) })).setSelection(TextSelection.create(state.doc, to)));
    return true;
  }
  if (text === '{' && before.endsWith('{') && !inCode) {
    const tr = state.tr.delete(from - 1, to);
    tr.setStoredMarks([...activeMarks.filter((m) => m.type !== schema.marks.cloze), schema.marks.cloze!.create({ id: newId(8) })]);
    view.dispatch(tr);
    return true;
  }
  if (text === '}' && before.endsWith('}') && clozeMark) {
    const tr = state.tr.delete(from - 1, to);
    tr.removeStoredMark(schema.marks.cloze!);
    tr.setStoredMarks(activeMarks.filter((m) => m.type !== schema.marks.cloze));
    view.dispatch(tr);
    return true;
  }
  if (inCode) return false;

  // --- separator upgrades (">>" + ">" = ">>>", ">>" + "1." = ">>1.") -------
  const sepInfo = separatorBefore(view, from);
  if (sepInfo) {
    const candidate = sepInfo.token + sepInfo.textAfter + text;
    if (TOKENS.includes(candidate)) {
      const tr = state.tr.delete(sepInfo.pos + 1, to);
      tr.setNodeMarkup(sepInfo.pos, undefined, { token: candidate });
      view.dispatch(tr);
      return true;
    }
  }

  // --- new separator ------------------------------------------------------
  if (!hasSeparator(view)) {
    const candidate = before + text;
    for (const token of TOKENS) {
      if (token.length < 2 || !candidate.endsWith(token)) continue;
      const start = candidate.length - token.length;
      if (candidate[start - 1] === '\\' || candidate.slice(start).includes(ATOM_CHAR)) continue;
      // Only the 2-3 character tokens can be typed directly; longer ones are upgrades.
      if (token.length > 3) continue;
      const consumed = token.length - text.length;
      const tr = state.tr.replaceWith(from - consumed, to, schema.nodes.separator!.create({ token }));
      view.dispatch(tr);
      return true;
    }
  }

  // --- Markdown inline shortcuts -------------------------------------------
  if (text === '*') {
    const full = $from.parent.textBetween(Math.max(0, offset - 200), offset, undefined, ATOM_CHAR);
    const m = /\*\*([^*]+)\*$/.exec(full);
    if (m) {
      const start = from - m[0].length;
      const tr = state.tr.delete(start, to);
      tr.insertText(m[1]!, start);
      tr.addMark(start, start + m[1]!.length, schema.marks.bold!.create());
      tr.removeStoredMark(schema.marks.bold!);
      view.dispatch(tr);
      return true;
    }
  }
  if (text === '`') {
    const full = $from.parent.textBetween(Math.max(0, offset - 200), offset, undefined, ATOM_CHAR);
    const m = /`([^`]+)$/.exec(full);
    if (m) {
      const start = from - m[0].length;
      const tr = state.tr.delete(start, to);
      tr.insertText(m[1]!, start);
      tr.addMark(start, start + m[1]!.length, schema.marks.code!.create());
      tr.removeStoredMark(schema.marks.code!);
      view.dispatch(tr);
      return true;
    }
  }
  if (text === '$') {
    const full = $from.parent.textBetween(Math.max(0, offset - 200), offset, undefined, ATOM_CHAR);
    const m = /(^|[^\\$])\$([^\s$][^$]*)$/.exec(full);
    if (m && !/\s$/.test(m[2]!)) {
      const len = m[2]!.length + 1;
      const tr = state.tr.replaceWith(from - len, to, schema.nodes.latex!.create({ source: m[2] }));
      view.dispatch(tr);
      return true;
    }
  }

  // --- block prefixes ("# ", "[] ", "> ", "---", "```") ----------------------
  if (text === ' ' && offset === $from.parent.textContent.length && offset <= 3) {
    const shortcut = BLOCK_PREFIXES[before];
    if (shortcut) {
      view.dispatch(state.tr.delete(from - before.length, to));
      onBlock(shortcut);
      return true;
    }
  }
  if (text === '-' && before === '--' && $from.parent.textContent === '--') {
    view.dispatch(state.tr.delete(from - 2, to));
    onBlock({ divider: true });
    return true;
  }
  if (text === '`' && before === '``' && $from.parent.textContent === '``') {
    view.dispatch(state.tr.delete(from - 2, to));
    onBlock({ code: { language: '' } });
    return true;
  }
  return false;
}

/**
 * If the caret follows a separator (optionally with a few typed characters
 * after it), returns the separator's position, token and that text.
 */
function separatorBefore(view: EditorView, pos: number): { pos: number; token: string; textAfter: string } | null {
  const $pos = view.state.doc.resolve(pos);
  const parent = $pos.parent;
  const offset = $pos.parentOffset;
  let found: { pos: number; token: string; textAfter: string } | null = null;
  parent.forEach((node, nodeOffset) => {
    if (node.type.name === 'separator' && nodeOffset < offset) {
      found = { pos: $pos.start() + nodeOffset, token: node.attrs.token as string, textAfter: parent.textBetween(nodeOffset + 1, offset, undefined, ATOM_CHAR) };
    }
  });
  const match = found as { pos: number; token: string; textAfter: string } | null;
  // Only a separator directly before the caret (at most one typed character after it) can be upgraded.
  if (!match || match.textAfter.length > 1 || match.textAfter.includes(ATOM_CHAR)) return null;
  return match;
}

/** Trigger patterns for caret popups. */
const TRIGGERS: { kind: 'slash' | 'ref' | 'tag' | 'portal'; re: RegExp }[] = [
  { kind: 'ref', re: /\[\[([^\]\n]*)$/ },
  { kind: 'portal', re: /\(\(([^)\n]*)$/ },
  { kind: 'slash', re: /(?:^|\s)\/([^\s/]*)$/ },
  { kind: 'tag', re: /(?:^|\s)#([^\s#[\]]*)$/u },
];

/** Popup trigger found before the caret. */
export interface TriggerMatch {
  kind: 'slash' | 'ref' | 'tag' | 'portal';
  query: string;
  from: number;
  to: number;
}

/**
 * Detects an open trigger (`/`, `[[`, `#`, `((`) directly before the caret.
 */
export function detectTrigger(view: EditorView): TriggerMatch | null {
  const { selection } = view.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  const inCode = (view.state.storedMarks ?? $from.marks()).some((m) => m.type === schema.marks.code);
  if (inCode) return null;
  const text = $from.parent.textBetween(Math.max(0, $from.parentOffset - 60), $from.parentOffset, undefined, ATOM_CHAR);
  for (const { kind, re } of TRIGGERS) {
    const m = re.exec(text);
    if (!m) continue;
    const query = m[1] ?? '';
    const triggerLength = kind === 'ref' || kind === 'portal' ? 2 : 1;
    return { kind, query, from: selection.from - query.length - triggerLength, to: selection.from };
  }
  return null;
}
