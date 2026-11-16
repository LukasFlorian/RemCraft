/**
 * OPML import (Workflowy, Dynalist and most outliners export OPML).
 *
 * A tiny dedicated parser is used instead of DOMParser so the core stays
 * environment-independent.
 */
import type { OutlineNode } from './outline';

/** Decodes the five XML entities and numeric character references. */
export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Parses the attributes of a tag. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]!] = decodeXml(m[3] ?? m[4] ?? '');
  return out;
}

/**
 * Parses OPML into outline nodes. `_note` attributes become a child node.
 *
 * @param xml OPML document.
 */
export function parseOpml(xml: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  const re = /<outline\b([^>]*?)(\/?)>|<\/outline\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('</')) {
      stack.pop();
      continue;
    }
    const attrs = attributes(m[1] ?? '');
    const node: OutlineNode = { text: attrs.text ?? attrs.title ?? '', block: {}, children: [] };
    if (attrs._complete === 'true') node.block.todo = 'finished';
    if (attrs._note) node.children.push({ text: attrs._note, block: {}, children: [] });
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(node);
    if (m[2] !== '/') stack.push(node);
  }
  return roots;
}
