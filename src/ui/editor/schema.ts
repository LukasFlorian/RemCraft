/**
 * ProseMirror schema of a single Rem.
 *
 * A Rem is edited as one paragraph of inline content. Besides text with
 * marks there are three atomic inline nodes: references, LaTeX formulas and
 * the card *separator* (the `>>`, `::`, … delimiter, shown as an arrow).
 */
import { Schema } from 'prosemirror-model';
import type { MarkSpec, NodeSpec } from 'prosemirror-model';

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'paragraph' },
  paragraph: {
    content: 'inline*',
    parseDOM: [{ tag: 'p' }, { tag: 'div' }],
    toDOM: () => ['p', 0],
  },
  text: { group: 'inline' },
  ref: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { remId: {} },
    parseDOM: [{ tag: 'span[data-ref]', getAttrs: (el) => ({ remId: (el as HTMLElement).dataset.ref }) }],
    toDOM: (node) => ['span', { class: 'ref', 'data-ref': node.attrs.remId as string }, `[[${node.attrs.remId as string}]]`],
  },
  latex: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { source: { default: '' } },
    parseDOM: [{ tag: 'span[data-latex]', getAttrs: (el) => ({ source: (el as HTMLElement).dataset.latex }) }],
    toDOM: (node) => ['span', { class: 'latex', 'data-latex': node.attrs.source as string }, node.attrs.source as string],
  },
  separator: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    attrs: { token: { default: '>>' } },
    parseDOM: [{ tag: 'span[data-separator]', getAttrs: (el) => ({ token: (el as HTMLElement).dataset.separator }) }],
    toDOM: (node) => ['span', { class: 'separator', 'data-separator': node.attrs.token as string }, node.attrs.token as string],
  },
};

const marks: Record<string, MarkSpec> = {
  bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
  italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
  underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
  strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
  code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', { class: 'inline-code' }, 0] },
  highlight: {
    attrs: { color: { default: 'yellow' } },
    parseDOM: [{ tag: 'mark', getAttrs: (el) => ({ color: (el as HTMLElement).dataset.color ?? 'yellow' }) }],
    toDOM: (mark) => ['mark', { class: `hl hl-${mark.attrs.color as string}`, 'data-color': mark.attrs.color as string }, 0],
  },
  cloze: {
    attrs: { id: {} },
    // Inclusive so that typing at the end of a cloze extends it; `}}` exits.
    inclusive: true,
    parseDOM: [{ tag: 'span[data-cloze]', getAttrs: (el) => ({ id: (el as HTMLElement).dataset.cloze }) }],
    toDOM: (mark) => ['span', { class: 'cloze', 'data-cloze': mark.attrs.id as string }, 0],
  },
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [{ tag: 'a[href]', getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('href') }) }],
    toDOM: (mark) => ['a', { href: mark.attrs.href as string, rel: 'noreferrer noopener', target: '_blank' }, 0],
  },
};

/** The editor schema. */
export const schema = new Schema({ nodes, marks });

/** Placeholder character for atomic nodes in `textBetween`. */
export const ATOM_CHAR = '￼';
