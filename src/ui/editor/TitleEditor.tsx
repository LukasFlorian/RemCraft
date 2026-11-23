/**
 * Always-editable title of a document or zoomed-in Rem (a ProseMirror view
 * with the same schema as Rems, so titles may contain references, LaTeX or
 * even be flashcards themselves).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { RemId } from '@core/model/types';
import { useApp, useRem } from '../app/context';
import { useDialogs } from '../components/Confirm';
import { isMod } from '../hooks/useHotkeys';
import { latexNodeView, refNodeView, separatorNodeView } from './BlockEditor';
import { useController } from './controller';
import { docToPatch, patchEquals, remToDoc } from './convert';
import { handleTextInput } from './inputRules';
import { t } from '@core/i18n';

/** Props of {@link TitleEditor}. */
export interface TitleEditorProps {
  remId: RemId;
  placeholder?: string;
  /** Called when the user presses Enter / ArrowDown (move into the body). */
  onExit: () => void;
  autoFocus?: boolean;
}

/** Editable page title. */
export function TitleEditor({
  remId,
  placeholder = t('Untitled'),
  onExit,
  autoFocus,
}: TitleEditorProps): ReactNode {
  const app = useApp();
  const controller = useController();
  const dialogs = useDialogs();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const rem = useRem(remId);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const initial = app.store.get(remId);
    if (!host || !initial) return;
    const view: EditorView = new EditorView(host, {
      state: EditorState.create({ doc: remToDoc(initial) }),
      nodeViews: {
        ref: refNodeView(app, (id) => (window.location.hash = `#/rem/${id}`)),
        latex: latexNodeView((source) =>
          dialogs.prompt({ title: t('Edit LaTeX'), initial: source }),
        ),
        separator: separatorNodeView,
      },
      attributes: {
        class: 'pm-editor title-editor',
        'aria-label': t('Title'),
        'data-placeholder': placeholder,
      },
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
        if (tr.docChanged) {
          const patch = docToPatch(view.state.doc);
          const current = app.store.get(remId);
          if (current && !patchEquals(patch, current))
            app.rems.update(remId, patch, `text:${remId}`);
        }
        host.classList.toggle(
          'is-empty',
          view.state.doc.textContent === '' && view.state.doc.firstChild?.childCount === 0,
        );
      },
      handleTextInput: (v, from, to, text) =>
        handleTextInput(v, from, to, text, (change) => app.rems.update(remId, change)),
      handleKeyDown(v, e) {
        if (isMod(e) && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          if (e.shiftKey) app.store.redo();
          else app.store.undo();
          return true;
        }
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && v.endOfTextblock('down'))) {
          e.preventDefault();
          exitRef.current();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        focus() {
          controller.blur();
          controller.clearSelection();
          return false;
        },
      },
    });
    viewRef.current = view;
    host.classList.toggle(
      'is-empty',
      view.state.doc.textContent === '' && view.state.doc.firstChild?.childCount === 0,
    );
    if (autoFocus) {
      view.focus();
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remId]);

  // Apply external changes (undo, sync).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !rem || patchEquals(docToPatch(view.state.doc), rem)) return;
    const doc = remToDoc(rem);
    const pos = Math.min(view.state.selection.from, doc.content.size - 1);
    view.updateState(EditorState.create({ doc }));
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.max(1, pos))),
    );
    hostRef.current?.classList.toggle(
      'is-empty',
      doc.textContent === '' && doc.firstChild?.childCount === 0,
    );
  }, [rem]);

  return <div ref={hostRef} className="title-host block-editor" />;
}
