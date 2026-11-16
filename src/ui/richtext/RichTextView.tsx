/**
 * Read-only rendering of rich text (notes, card faces, previews).
 */
import { Fragment, memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { RemId, RichText, Segment, TextMarks } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { useSelector } from '../app/context';
import { Latex } from './Latex';

/** How clozes are displayed. */
export type ClozeMode =
  | { kind: 'show' }
  /** Hide the given cloze (practice front side). */
  | { kind: 'hide'; clozeId: string; hint?: string }
  /** Highlight the given cloze as the answer (practice back side). */
  | { kind: 'reveal'; clozeId: string };

/** Props of {@link RichTextView}. */
export interface RichTextViewProps {
  value: RichText;
  cloze?: ClozeMode;
  /** Disable navigation on references (e.g. inside buttons). */
  inertRefs?: boolean;
  className?: string;
}

/** Live title of a referenced Rem. */
export function RefTitle({ remId }: { remId: RemId }): ReactNode {
  const title = useSelector((s) => {
    const rem = s.get(remId);
    return rem ? toPlainText(rem.text, (r) => toPlainText(s.get(r)?.text ?? [])) : null;
  });
  return title ?? <span className="ref-missing">deleted reference</span>;
}

/** A reference chip. */
function RefSpan({ remId, inert }: { remId: RemId; inert: boolean | undefined }): ReactNode {
  const navigate = useNavigate();
  return (
    <span
      className="ref"
      role={inert ? undefined : 'link'}
      tabIndex={inert ? undefined : -1}
      onMouseDown={(e) => !inert && e.preventDefault()}
      onClick={(e) => {
        if (inert) return;
        e.stopPropagation();
        navigate(`/rem/${remId}`);
      }}
    >
      <RefTitle remId={remId} />
    </span>
  );
}

/** Wraps content in elements for its marks. */
function withMarks(content: ReactNode, marks: TextMarks | undefined, key: number): ReactNode {
  if (!marks) return <Fragment key={key}>{content}</Fragment>;
  let node = content;
  if (marks.code) node = <code className="inline-code">{node}</code>;
  if (marks.bold) node = <strong>{node}</strong>;
  if (marks.italic) node = <em>{node}</em>;
  if (marks.underline) node = <u>{node}</u>;
  if (marks.strike) node = <s>{node}</s>;
  if (marks.link) {
    node = (
      <a href={marks.link} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
        {node}
      </a>
    );
  }
  if (marks.highlight) node = <mark className={`hl hl-${marks.highlight}`}>{node}</mark>;
  return <span key={key}>{node}</span>;
}

/** Renders one segment. */
function renderSegment(seg: Segment, key: number, inert: boolean | undefined): ReactNode {
  const marks = seg.marks ? { ...seg.marks, cloze: undefined } : undefined;
  switch (seg.type) {
    case 'text':
      return withMarks(seg.text, marks, key);
    case 'ref':
      return withMarks(<RefSpan remId={seg.remId} inert={inert} />, marks, key);
    case 'latex':
      return withMarks(<Latex source={seg.source} />, marks, key);
  }
}

/** Renders rich text, grouping cloze runs so they can be hidden or highlighted. */
export const RichTextView = memo(function RichTextView({ value, cloze = { kind: 'show' }, inertRefs, className }: RichTextViewProps): ReactNode {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < value.length) {
    const seg = value[i]!;
    const id = seg.marks?.cloze;
    if (!id) {
      out.push(renderSegment(seg, i, inertRefs));
      i++;
      continue;
    }
    // Collect the contiguous run of this cloze.
    const run: ReactNode[] = [];
    const start = i;
    while (i < value.length && value[i]!.marks?.cloze === id) {
      run.push(renderSegment(value[i]!, i, inertRefs));
      i++;
    }
    if (cloze.kind === 'hide' && cloze.clozeId === id) {
      out.push(
        <span key={`c${start}`} className="cloze-hidden">
          {cloze.hint ? cloze.hint : '[…]'}
        </span>,
      );
    } else {
      const style: CSSProperties | undefined = undefined;
      const cls = cloze.kind === 'reveal' && cloze.clozeId === id ? 'cloze cloze-answer' : cloze.kind === 'show' ? 'cloze' : 'cloze-other';
      out.push(
        <span key={`c${start}`} className={cls} style={style}>
          {run}
        </span>,
      );
    }
  }
  return <span className={`rich-text${className ? ` ${className}` : ''}`}>{out}</span>;
});
