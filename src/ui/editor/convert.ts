/**
 * Conversion between Rem content and ProseMirror documents.
 */
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { canonicalDelimiter, DELIMITERS } from '@core/cards/delimiters';
import type {
  AnswerMode,
  CardDirection,
  Rem,
  RemKind,
  RichText,
  Segment,
  TextMarks,
} from '@core/model/types';
import { normalize } from '@core/richtext/ops';
import { schema } from './schema';

/** PM marks for a set of rich-text marks. */
function toPmMarks(marks: TextMarks | undefined): Mark[] {
  if (!marks) return [];
  const out: Mark[] = [];
  if (marks.bold) out.push(schema.marks.bold!.create());
  if (marks.italic) out.push(schema.marks.italic!.create());
  if (marks.underline) out.push(schema.marks.underline!.create());
  if (marks.strike) out.push(schema.marks.strike!.create());
  if (marks.code) out.push(schema.marks.code!.create());
  if (marks.highlight) out.push(schema.marks.highlight!.create({ color: marks.highlight }));
  if (marks.cloze) out.push(schema.marks.cloze!.create({ id: marks.cloze }));
  if (marks.link) out.push(schema.marks.link!.create({ href: marks.link }));
  return out;
}

/** Rich-text marks for PM marks. */
function fromPmMarks(marks: readonly Mark[]): TextMarks | undefined {
  if (marks.length === 0) return undefined;
  const out: TextMarks = {};
  for (const m of marks) {
    switch (m.type.name) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strike':
      case 'code':
        out[m.type.name] = true;
        break;
      case 'highlight':
        out.highlight = m.attrs.color as TextMarks['highlight'];
        break;
      case 'cloze':
        out.cloze = m.attrs.id as string;
        break;
      case 'link':
        out.link = m.attrs.href as string;
        break;
    }
  }
  return out;
}

/** Converts rich text to inline PM nodes. */
export function richTextToNodes(value: RichText): PMNode[] {
  const out: PMNode[] = [];
  for (const seg of value) {
    const marks = toPmMarks(seg.marks);
    if (seg.type === 'text') {
      if (seg.text) out.push(schema.text(seg.text, marks));
    } else if (seg.type === 'ref') {
      out.push(schema.nodes.ref!.create({ remId: seg.remId }, null, marks));
    } else {
      out.push(schema.nodes.latex!.create({ source: seg.source }, null, marks));
    }
  }
  return out;
}

/** Converts inline PM nodes to rich text. */
export function nodesToRichText(nodes: readonly PMNode[]): RichText {
  const out: Segment[] = [];
  for (const node of nodes) {
    const marks = fromPmMarks(node.marks);
    if (node.isText)
      out.push(
        marks
          ? { type: 'text', text: node.text ?? '', marks }
          : { type: 'text', text: node.text ?? '' },
      );
    else if (node.type.name === 'ref')
      out.push(
        marks
          ? { type: 'ref', remId: node.attrs.remId as string, marks }
          : { type: 'ref', remId: node.attrs.remId as string },
      );
    else if (node.type.name === 'latex')
      out.push(
        marks
          ? { type: 'latex', source: node.attrs.source as string, marks }
          : { type: 'latex', source: node.attrs.source as string },
      );
  }
  return normalize(out);
}

/** The editable content of a Rem. */
export interface RemContentPatch {
  text: RichText;
  back: RichText | null;
  kind: RemKind;
  direction: CardDirection;
  answerMode: AnswerMode;
}

/** Builds the PM document for a Rem. */
export function remToDoc(
  rem: Pick<Rem, 'text' | 'back' | 'kind' | 'direction' | 'answerMode'>,
): PMNode {
  const content = richTextToNodes(rem.text);
  const token =
    rem.back !== null
      ? canonicalDelimiter(
          rem.kind,
          rem.direction === 'none' ? 'forward' : rem.direction,
          rem.answerMode,
        )
      : null;
  if (token) {
    content.push(schema.nodes.separator!.create({ token }));
    content.push(...richTextToNodes(rem.back ?? []));
  }
  return schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, content));
}

/** Extracts Rem content from a PM document. */
export function docToPatch(doc: PMNode): RemContentPatch {
  const para = doc.firstChild;
  const front: PMNode[] = [];
  const back: PMNode[] = [];
  let token: string | null = null;
  para?.forEach((node) => {
    if (node.type.name === 'separator' && token === null) token = node.attrs.token as string;
    else if (token === null) front.push(node);
    else if (node.type.name !== 'separator') back.push(node);
  });
  const spec = token ? DELIMITERS.find((d) => d.token === token) : undefined;
  return {
    text: nodesToRichText(front),
    back: spec ? nodesToRichText(back) : null,
    kind: spec?.kind ?? 'plain',
    direction: spec?.direction ?? 'none',
    answerMode: spec?.answerMode ?? 'inline',
  };
}

/** True when two patches are equal. */
export function patchEquals(a: RemContentPatch, b: RemContentPatch): boolean {
  return (
    a.kind === b.kind &&
    a.direction === b.direction &&
    a.answerMode === b.answerMode &&
    JSON.stringify(a.text) === JSON.stringify(normalize(b.text)) &&
    JSON.stringify(a.back) === JSON.stringify(b.back === null ? null : normalize(b.back))
  );
}
