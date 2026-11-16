/**
 * One Rem in the outliner: bullet, content (static or editor), tags, card
 * badge and - recursively - its children.
 */
import { memo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, FileText, Folder, Layers, X } from 'lucide-react';
import { separatorGlyph } from '@core/cards/delimiters';
import { generateCards } from '@core/cards/generate';
import type { AnswerMode, Rem, RemId } from '@core/model/types';
import { isEmpty } from '@core/richtext/ops';
import { formatInterval } from '@core/util/time';
import { useApp, useChildren, useRem, useSelector } from '../app/context';
import { isMod } from '../hooks/useHotkeys';
import { useRemTitle } from '../hooks/useRemTitle';
import { RichTextView } from '../richtext/RichTextView';
import { Latex } from '../richtext/Latex';
import { BlockEditor } from './BlockEditor';
import { EmbedView, FileView, ImageView, PortalView, SearchPortalView, TagTableView } from './blocks';
import { useController, useControllerState } from './controller';
import { PlainBlockEditor } from './PlainBlockEditor';
import { CardPopover } from './CardPopover';

/** How the parent presents its children. */
export type ChildMode = AnswerMode | 'none';

/** Props of {@link RemBlock}. */
export interface RemBlockProps {
  remId: RemId;
  instance: string;
  /** Answer mode of the parent (MC letters, list numbers). */
  parentMode: ChildMode;
  index: number;
  depth: number;
}

/** Static content of a Rem (used when it is not being edited). */
export function RemContent({ rem }: { rem: Rem }): ReactNode {
  if (rem.code) {
    return (
      <pre className="code-block">
        {rem.code.language && <span className="code-lang">{rem.code.language}</span>}
        <code>{rem.text.map((s) => (s.type === 'text' ? s.text : '')).join('')}</code>
      </pre>
    );
  }
  if (rem.latexBlock) {
    const src = rem.text.map((s) => (s.type === 'latex' ? s.source : s.type === 'text' ? s.text : '')).join('');
    return src ? <Latex source={src} display /> : <span className="placeholder">Empty LaTeX block</span>;
  }
  const empty = isEmpty(rem.text) && rem.back === null;
  return (
    <span className={`rem-text kind-${rem.kind}`}>
      {empty ? <span className="placeholder-space">&#8203;</span> : <RichTextView value={rem.text} />}
      {rem.back !== null && rem.direction !== 'none' && (
        <>
          <span className={`separator separator-${rem.kind} separator-${rem.answerMode}`} title="Flashcard">
            {separatorGlyph(rem.kind, rem.direction)}
            {rem.answerMode === 'mc' ? ' A)' : rem.answerMode === 'list' ? ' 1.' : rem.answerMode === 'set' ? ' ⋯' : ''}
          </span>
          <RichTextView value={rem.back} className="rem-back" />
        </>
      )}
    </span>
  );
}

/** Chips for the tags of a Rem. */
function TagChips({ rem }: { rem: Rem }): ReactNode {
  const app = useApp();
  if (rem.tags.length === 0 && rem.aliases.length === 0) return null;
  return (
    <span className="tag-chips">
      {rem.tags.map((t) => (
        <TagChip key={t} tagId={t} onRemove={() => app.rems.removeTag(rem.id, t)} />
      ))}
      {rem.aliases.map((a) => (
        <span key={a} className="alias-chip" title="Alias">
          ≡ {a}
        </span>
      ))}
    </span>
  );
}

function TagChip({ tagId, onRemove }: { tagId: RemId; onRemove: () => void }): ReactNode {
  const navigate = useNavigate();
  const title = useRemTitle(tagId);
  return (
    <span className="tag-chip">
      <button className="tag-chip-name" onClick={() => navigate(`/rem/${tagId}`)}>
        #{title}
      </button>
      <button className="tag-chip-x" onClick={onRemove} aria-label={`Remove tag ${title}`}>
        <X size={11} />
      </button>
    </span>
  );
}

/** Small badge showing that a Rem generates flashcards. */
function CardBadge({ rem }: { rem: Rem }): ReactNode {
  const children = useChildren(rem.id);
  const cards = generateCards(rem, children);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const due = useSelector((s) => {
    let min = Infinity;
    for (const c of cards) {
      const st = s.getRecord('cards', c.id);
      if (st && st.phase !== 'new') min = Math.min(min, st.due);
    }
    return min;
  });
  if (cards.length === 0) return null;
  const label = due === Infinity ? 'new' : due <= Date.now() ? 'due' : formatInterval(due - Date.now());
  return (
    <>
      <button
        ref={ref}
        className="card-badge"
        title={`${cards.length} flashcard${cards.length > 1 ? 's' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Layers size={12} />
        {cards.length > 1 && <span>{cards.length}</span>}
        <span className="card-badge-due">{label}</span>
      </button>
      {open && ref.current && <CardPopover rem={rem} anchor={ref.current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A Rem with its children. */
export const RemBlock = memo(function RemBlock({ remId, instance, parentMode, index, depth }: RemBlockProps): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const controller = useController();
  const rem = useRem(remId);
  const children = useChildren(remId);
  const focus = useControllerState((s) => (s.focus?.instance === instance && s.focus.remId === remId ? s.focus : null));
  const selected = useControllerState((s) => s.selection?.instance === instance && s.selection.ids.includes(remId));
  const drop = useControllerState((s) => (s.drop?.remId === remId ? s.drop.zone : null));
  const rowRef = useRef<HTMLDivElement>(null);
  if (!rem) return null;

  const hasChildren = children.length > 0;
  const collapsed = Boolean(rem.collapsed) && hasChildren;
  const plainEditor = Boolean(rem.code || rem.latexBlock);
  const special = Boolean(rem.divider || rem.portalOf);

  /** Focuses the editor at the clicked position. */
  const onContentMouseDown = (e: React.MouseEvent): void => {
    if (focus || special) return;
    if ((e.target as HTMLElement).closest('a, button, input, .ref, .portal, .tag-table, .file-block, iframe, audio, video')) return;
    if (e.shiftKey) {
      e.preventDefault();
      const sel = controller.getState().selection;
      if (sel?.instance === instance) {
        const ids = controller.visibleIds(instance);
        const [a, b] = [ids.indexOf(sel.anchor), ids.indexOf(remId)].sort((x, y) => x - y);
        controller.select(instance, ids.slice(a, (b ?? a ?? 0) + 1), sel.anchor);
      } else controller.select(instance, [remId]);
      return;
    }
    e.preventDefault();
    controller.focus(instance, remId, { x: e.clientX, y: e.clientY });
  };

  // --- drag & drop ---------------------------------------------------------
  const onDragOver = (e: React.DragEvent): void => {
    const dragging = controller.getState().dragging;
    if (!dragging || dragging.includes(remId)) return;
    e.preventDefault();
    const rect = rowRef.current!.getBoundingClientRect();
    const below = e.clientY > rect.top + rect.height / 2;
    const zone = below && e.clientX > rect.left + 56 ? 'child' : below ? 'after' : 'before';
    controller.setDrop({ remId, zone });
  };
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    const dragging = controller.getState().dragging;
    const target = controller.getState().drop;
    controller.setDragging(null);
    if (!dragging || !target) return;
    if (target.zone === 'child') app.rems.move(dragging, { parentId: remId, afterId: null });
    else if (target.zone === 'after') app.rems.move(dragging, { parentId: rem.parentId, afterId: remId });
    else {
      const prev = app.rems.previousSibling(remId);
      app.rems.move(dragging, { parentId: rem.parentId, afterId: prev?.id ?? null });
    }
  };

  const marker =
    parentMode === 'mc' ? (
      <McMarker rem={rem} index={index} />
    ) : parentMode === 'list' ? (
      <span className="list-marker">{index + 1}.</span>
    ) : null;

  const rowClass = [
    'rem-row',
    rem.heading ? `heading-${rem.heading}` : '',
    rem.highlight ? `block-hl hl-${rem.highlight}` : '',
    rem.quote ? 'is-quote' : '',
    rem.todo === 'finished' ? 'is-done' : '',
    selected ? 'is-selected' : '',
    focus ? 'is-focused' : '',
    drop ? `drop-${drop}` : '',
    rem.extraCardDetail ? 'is-extra' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="rem" data-rem-id={remId} data-depth={depth}>
      <div ref={rowRef} className={rowClass} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => drop && controller.setDrop(null)}>
        <div className="rem-gutter">
          {hasChildren && (
            <button
              className={`collapse-btn${collapsed ? ' is-collapsed' : ''}`}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => app.rems.update(remId, { collapsed: collapsed ? undefined : true })}
            >
              <ChevronRight size={14} />
            </button>
          )}
          <span
            className={`bullet${collapsed ? ' is-collapsed' : ''}${rem.isDocument ? ' is-doc' : ''}`}
            draggable
            title="Drag to move · click to zoom in"
            onDragStart={(e) => {
              const sel = controller.getState().selection;
              const ids = sel?.instance === instance && sel.ids.includes(remId) ? controller.selectedRoots() : [remId];
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', app.io.exportMarkdown(ids));
              controller.setDragging(ids);
            }}
            onDragEnd={() => controller.setDragging(null)}
            onClick={(e) => (isMod(e as unknown as KeyboardEvent) ? controller.select(instance, [remId]) : navigate(`/rem/${remId}`))}
          >
            {rem.isFolder ? <Folder size={13} /> : rem.isDocument ? <FileText size={13} /> : <span className="dot" />}
          </span>
        </div>
        <div className="rem-main" onMouseDown={onContentMouseDown}>
          {rem.todo && (
            <input
              type="checkbox"
              className="todo-box"
              checked={rem.todo === 'finished'}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={() => app.rems.toggleTodo(remId)}
              aria-label="Done"
            />
          )}
          {marker}
          <div className="rem-content">
            {rem.image && (
              <ImageView src={rem.image.src} width={rem.image.width} occlusions={rem.image.occlusions} onResize={(w) => app.rems.update(remId, { image: { ...rem.image!, width: w } }, `img:${remId}`)} />
            )}
            {rem.divider ? (
              <hr className="divider" onClick={() => controller.select(instance, [remId])} />
            ) : rem.portalOf ? (
              <PortalView targetId={rem.portalOf} />
            ) : focus ? (
              plainEditor ? (
                <PlainBlockEditor remId={remId} instance={instance} nonce={focus.nonce} />
              ) : (
                <BlockEditor remId={remId} instance={instance} caret={focus.caret} nonce={focus.nonce} placeholder={depth === 0 && index === 0 ? "Type '/' for commands" : ''} />
              )
            ) : (
              <RemContent rem={rem} />
            )}
            {rem.searchQuery && <SearchPortalView query={rem.searchQuery} />}
            {rem.tableView && <TagTableView tagId={remId} />}
            {rem.file && <FileView rem={rem} />}
            {rem.embed && <EmbedView url={rem.embed.url} />}
          </div>
          <TagChips rem={rem} />
          {rem.editLater && <span className="badge badge-warning">edit later</span>}
          <CardBadge rem={rem} />
        </div>
      </div>
      {hasChildren && !collapsed && (
        <div className="rem-children">
          {children.map((child, i) => (
            <RemBlock key={child.id} remId={child.id} instance={instance} parentMode={rem.direction !== 'none' ? (rem.back !== null && isEmpty(rem.back) && rem.answerMode === 'inline' ? 'set' : rem.answerMode) : 'none'} index={i} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

/** Letter badge of a multiple-choice option; click toggles correctness. */
function McMarker({ rem, index }: { rem: Rem; index: number }): ReactNode {
  const app = useApp();
  const siblings = useChildren(rem.parentId);
  const options = siblings.filter((s) => !s.extraCardDetail);
  const anyMarked = options.some((o) => o.mcCorrect !== undefined);
  const correct = anyMarked ? rem.mcCorrect === true : options[0]?.id === rem.id;
  const letter = String.fromCharCode(65 + Math.max(0, options.findIndex((o) => o.id === rem.id) === -1 ? index : options.findIndex((o) => o.id === rem.id)));
  return (
    <button
      className={`mc-marker ${correct ? 'is-correct' : 'is-wrong'}`}
      title={correct ? 'Correct answer (click to mark wrong)' : 'Wrong answer (click to mark correct)'}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        app.rems.updateMany(
          options.map((o) => o.id),
          (o) => {
            const implicit = anyMarked ? o.mcCorrect === true : o.id === options[0]?.id;
            return { mcCorrect: o.id === rem.id ? !correct : implicit };
          },
        );
      }}
    >
      {letter}
    </button>
  );
}
