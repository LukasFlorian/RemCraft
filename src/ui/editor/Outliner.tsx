/**
 * The outliner: renders the children of a root Rem as an editable tree.
 *
 * Several outliners can be on screen at once (portals, practice edit dialog);
 * each one is an *instance* with its own root, so keyboard navigation stays
 * inside the outliner the user is working in.
 */
import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import type { RemId } from '@core/model/types';
import { isEmpty } from '@core/richtext/ops';
import { useApp, useChildren, useRem } from '../app/context';
import { isEditableTarget, isMod } from '../hooks/useHotkeys';
import { appendRem, copyRems, deleteRems, indent, outdent } from './actions';
import type { EditorEnv } from './actions';
import { useController } from './controller';
import { RemBlock } from './RemBlock';
import type { ChildMode } from './RemBlock';

/** Props of {@link Outliner}. */
export interface OutlinerProps {
  rootId: RemId;
  /** Rendered inside another Rem (portal): compact, no "click to add" area. */
  embedded?: boolean;
}

/** Answer mode the root imposes on its children. */
function childModeOf(
  rem: { direction: string; back: unknown; answerMode: ChildMode } | undefined,
): ChildMode {
  if (!rem || rem.direction === 'none') return 'none';
  return rem.answerMode;
}

/** An editable tree of Rems. */
export function Outliner({ rootId, embedded }: OutlinerProps): ReactNode {
  const app = useApp();
  const controller = useController();
  const instance = useId();
  const root = useRem(rootId);
  const children = useChildren(rootId);

  useEffect(() => controller.register(instance, rootId), [controller, instance, rootId]);

  // Keyboard handling while blocks of this outliner are selected.
  useEffect(() => {
    const env: EditorEnv = { app, controller, instance };
    const onKey = (e: KeyboardEvent): void => {
      const sel = controller.getState().selection;
      if (!sel || sel.instance !== instance || isEditableTarget(e.target)) return;
      const ids = controller.selectedRoots();
      const mod = isMod(e);
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const delta = e.key === 'ArrowUp' ? -1 : 1;
          if (mod && e.shiftKey) {
            if (delta < 0) ids.forEach((id) => app.rems.moveUp(id));
            else [...ids].reverse().forEach((id) => app.rems.moveDown(id));
          } else if (e.shiftKey) controller.extendSelection(delta);
          else {
            const visible = controller.visibleIds(instance);
            const edge = delta < 0 ? sel.ids[0]! : sel.ids[sel.ids.length - 1]!;
            const next = visible[visible.indexOf(edge) + delta];
            if (next) controller.select(instance, [next]);
          }
          return;
        }
        case 'Enter':
          e.preventDefault();
          controller.focus(instance, sel.ids[0]!, 'end');
          return;
        case 'Escape':
          controller.clearSelection();
          return;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          deleteRems(env, ids);
          return;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) outdent(env, ids, null);
          else indent(env, ids, null);
          controller.select(instance, sel.ids, sel.anchor);
          return;
      }
      if (mod && (e.key === 'c' || e.key === 'x')) {
        e.preventDefault();
        void copyRems(env, ids).then(() => e.key === 'x' && deleteRems(env, ids));
      } else if (mod && e.key === 'd') {
        e.preventDefault();
        ids.forEach((id) => app.rems.duplicate(id));
      } else if (mod && e.key === 'a') {
        e.preventDefault();
        controller.select(instance, controller.visibleIds(instance));
      } else if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) app.store.redo();
        else app.store.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app, controller, instance]);

  if (!root) return null;
  const mode = childModeOf({
    direction: root.direction,
    back: root.back,
    answerMode:
      root.back !== null && isEmpty(root.back) && root.answerMode === 'inline'
        ? 'set'
        : root.answerMode,
  });

  return (
    <div className={`outliner${embedded ? ' is-embedded' : ''}`} data-instance={instance}>
      {children.map((child, i) => (
        <RemBlock
          key={child.id}
          remId={child.id}
          instance={instance}
          parentMode={mode}
          index={i}
          depth={0}
        />
      ))}
      {!embedded && (
        <div
          className="outliner-tail"
          onMouseDown={(e) => {
            e.preventDefault();
            appendRem({ app, controller, instance });
          }}
        >
          {children.length === 0 && (
            <span className="faint">Click here or press Enter to start writing…</span>
          )}
        </div>
      )}
      {embedded && children.length === 0 && (
        <div
          className="outliner-tail is-small"
          onMouseDown={(e) => (e.preventDefault(), appendRem({ app, controller, instance }))}
        >
          <span className="faint">Empty - click to add</span>
        </div>
      )}
    </div>
  );
}
