/**
 * Plain-text outline parsing (Markdown / RemNote text format).
 *
 * Converts indented text into a tree of {@link OutlineNode}s. Understands
 * bullets (`-`, `*`, `+`, `1.`), Markdown headings (structural, i.e. content
 * below a heading becomes its children), todos (`[ ]`/`[x]`), quotes (`> `),
 * fenced code blocks, display math (`$$…$$` on its own line), dividers and
 * standalone images. Inline markup is *not* interpreted here.
 */
import type { TodoStatus } from '../model/types';

/** Block-level information detected on a line. */
export interface BlockMeta {
  heading?: 1 | 2 | 3;
  todo?: TodoStatus;
  quote?: boolean;
  code?: { language: string };
  latexBlock?: boolean;
  divider?: boolean;
  image?: { src: string; alt: string };
}

/** One node of a parsed outline. */
export interface OutlineNode {
  /** Inline text of the line (markup still unparsed). */
  text: string;
  block: BlockMeta;
  children: OutlineNode[];
}

/** Columns a tab counts as. */
const TAB_WIDTH = 4;

/** Measures leading indentation in columns. */
function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += TAB_WIDTH;
    else break;
  }
  return n;
}

/** Removes a list marker; returns the remaining text and whether a marker existed. */
function stripBullet(text: string): { text: string; bullet: boolean } {
  const m = /^(?:[-*+]|\d+[.)])(?:\s+|$)/.exec(text);
  if (!m) return { text, bullet: false };
  // "1. " at the start is a numbered list marker.
  return { text: text.slice(m[0].length), bullet: true };
}

/** Detects block-level syntax on an already de-bulleted line. */
function detectBlock(text: string): { text: string; block: BlockMeta } {
  const block: BlockMeta = {};
  let t = text;
  const heading = /^(#{1,6})\s+(.*)$/.exec(t);
  if (heading) {
    block.heading = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
    t = heading[2]!;
  }
  const todo = /^\[([ xX])\]\s+(.*)$/.exec(t);
  if (todo) {
    block.todo = todo[1] === ' ' ? 'unfinished' : 'finished';
    t = todo[2]!;
  }
  // "> quote" (but not card delimiters like ">>" or ">-").
  const quote = /^>\s+(.*)$/.exec(t);
  if (quote && !/^>[>\-<]/.test(t)) {
    block.quote = true;
    t = quote[1]!;
  }
  if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t.trim())) {
    block.divider = true;
    t = '';
  }
  const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(t.trim());
  if (image) {
    block.image = { alt: image[1]!, src: image[2]! };
    t = image[1]!;
  }
  const math = /^\$\$(.+)\$\$$/.exec(t.trim());
  if (math && !/[^$]\$\$[^$]/.test(math[1]!)) {
    block.latexBlock = true;
    t = math[1]!.trim();
  }
  return { text: t, block };
}

/** Stack frame used while building the tree. */
interface Frame {
  indent: number;
  node: OutlineNode;
  /** Structural heading level (0 for normal lines). */
  headingLevel: number;
}

/**
 * Parses an outline.
 *
 * @param source Markdown or RemNote-formatted text.
 * @returns Top-level nodes.
 */
export function parseOutline(source: string): OutlineNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const roots: OutlineNode[] = [];
  const stack: Frame[] = [];

  /** Attaches a node to the right parent and pushes it. */
  const attach = (node: OutlineNode, indent: number, headingLevel: number): void => {
    if (headingLevel > 0) {
      // Structural heading: close everything except headings of a lower level.
      while (stack.length > 0 && !(stack[stack.length - 1]!.headingLevel > 0 && stack[stack.length - 1]!.headingLevel < headingLevel)) {
        stack.pop();
      }
    } else {
      while (stack.length > 0 && stack[stack.length - 1]!.headingLevel === 0 && stack[stack.length - 1]!.indent >= indent) {
        stack.pop();
      }
    }
    const parent = stack[stack.length - 1]?.node;
    (parent ? parent.children : roots).push(node);
    stack.push({ indent: headingLevel > 0 ? -1 : indent, node, headingLevel });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const indent = indentOf(raw);
    const { text: afterBullet, bullet } = stripBullet(raw.trim());

    // Fenced code block (possibly behind a bullet).
    const fence = /^(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(afterBullet);
    if (fence) {
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j]!.trim().startsWith(fence[1]!)) break;
        body.push(lines[j]!);
      }
      // Remove the common indentation of the code lines.
      const common = Math.min(...body.filter((l) => l.trim() !== '').map(indentOf), Infinity);
      const code = body.map((l) => l.slice(Number.isFinite(common) ? common : 0)).join('\n');
      attach({ text: code, block: { code: { language: fence[2] ?? '' } }, children: [] }, indent, 0);
      i = j;
      continue;
    }

    const { text, block } = detectBlock(afterBullet);
    // A Markdown heading that is not a bullet structures the document.
    const structural = !bullet && block.heading !== undefined && indent === 0 ? block.heading : 0;
    attach({ text, block, children: [] }, indent, structural);
  }
  return roots;
}

/** Counts nodes of an outline (all levels). */
export function countNodes(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}
