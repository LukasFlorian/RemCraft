/**
 * The rich-text editor of the focused Rem (one ProseMirror view at a time).
 *
 * Unfocused Rems are rendered statically by `RemContent`; clicking one mounts
 * this editor in its place. Every document change is written to the store
 * immediately (coalesced into one undo step per typing burst), and changes
 * coming from the store (undo, sync, commands) are applied back to the view.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { DELIMITERS, separatorGlyph } from '@core/cards/delimiters';
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { newId } from '@core/util/ids';
import type { RemCraftApp } from '@data/app';
import { useApp, useRem } from '../app/context';
import { isMod } from '../hooks/useHotkeys';
import { renderLatex } from '../richtext/Latex';
import { useDialogs } from '../components/Confirm';
import {
  backspaceAtStart,
  deleteRems,
  indent,
  outdent,
  splitRem,
  toggleCollapsed,
} from './actions';
import type { EditorEnv } from './actions';
import type { CaretRequest } from './controller';
import { useController } from './controller';
import { docToPatch, patchEquals, remToDoc } from './convert';
import { detectTrigger, handleTextInput } from './inputRules';
import { schema } from './schema';

/** Props of {@link BlockEditor}. */
export interface BlockEditorProps {
  remId: RemId;
  instance: string;
  caret: CaretRequest;
  /** Changes on every focus request (re-applies the caret). */
  nonce: number;
  placeholder?: string;
}

/** Places the caret according to a request. */
export function applyCaret(view: EditorView, caret: CaretRequest): void {
  const doc = view.state.doc;
  let sel: TextSelection;
  if (caret === 'start') sel = TextSelection.atStart(doc) as TextSelection;
  else if (caret === 'end') sel = TextSelection.atEnd(doc) as TextSelection;
  else if (typeof caret === 'number')
    sel = TextSelection.create(doc, Math.min(Math.max(1, caret + 1), doc.content.size - 1));
  else {
    const rect = view.dom.getBoundingClientRect();
    const top = 'y' in caret ? caret.y : caret.edge === 'top' ? rect.top + 8 : rect.bottom - 8;
    const hit = view.posAtCoords({ left: caret.x, top });
    const pos = hit ? hit.pos : 'y' in caret || caret.edge === 'bottom' ? doc.content.size - 1 : 1;
    sel = TextSelection.create(doc, Math.min(Math.max(1, pos), doc.content.size - 1));
  }
  view.dispatch(view.state.tr.setSelection(sel));
}

/** Character offset of the caret inside the Rem (atoms count as one). */
function caretOffset(view: EditorView): number {
  return view.state.selection.from - 1;
}

/** Node view showing a live reference title. */
export function refNodeView(app: RemCraftApp, navigate: (id: RemId) => void) {
  return (node: PMNode): NodeView => {
    const dom = document.createElement('span');
    dom.className = 'ref';
    dom.contentEditable = 'false';
    const id = node.attrs.remId as string;
    const render = (): void => {
      const rem = app.store.get(id);
      dom.textContent = rem
        ? toPlainText(rem.text, (r) => toPlainText(app.store.get(r)?.text ?? [])) || 'Untitled'
        : 'deleted reference';
      dom.classList.toggle('ref-missing', !rem);
    };
    render();
    const unsubscribe = app.store.subscribe(render);
    dom.addEventListener('mousedown', (e) => {
      if (isMod(e as unknown as KeyboardEvent)) {
        e.preventDefault();
        navigate(id);
      }
    });
    return { dom, destroy: unsubscribe, ignoreMutation: () => true };
  };
}

/** Node view rendering LaTeX; double click edits the source. */
export function latexNodeView(edit: (source: string) => Promise<string | null>) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const dom = document.createElement('span');
    dom.className = 'latex latex-node';
    dom.contentEditable = 'false';
    dom.innerHTML = renderLatex(node.attrs.source as string);
    dom.title = 'Double-click to edit';
    dom.addEventListener('dblclick', (e) => {
      e.preventDefault();
      void edit(node.attrs.source as string).then((source) => {
        const pos = getPos();
        if (source === null || pos === undefined) return;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { source }));
        view.focus();
      });
    });
    return { dom, ignoreMutation: () => true };
  };
}

/** Node view showing the card separator as an arrow. */
export function separatorNodeView(node: PMNode): NodeView {
  const dom = document.createElement('span');
  const spec = DELIMITERS.find((d) => d.token === node.attrs.token);
  dom.className = `separator separator-${spec?.kind ?? 'plain'} separator-${spec?.answerMode ?? 'inline'}`;
  dom.contentEditable = 'false';
  dom.textContent = spec
    ? separatorGlyph(spec.kind, spec.direction) +
      (spec.answerMode === 'inline'
        ? ''
        : spec.answerMode === 'mc'
          ? ' A)'
          : spec.answerMode === 'list'
            ? ' 1.'
            : ' ⋯')
    : '→';
  dom.title = `${spec?.label ?? 'Flashcard'} (${node.attrs.token as string}) - Backspace turns it back into text`;
  return { dom, ignoreMutation: () => true };
}

/** The ProseMirror editor of one Rem. */
export function BlockEditor({
  remId,
  instance,
  caret,
  nonce,
  placeholder,
}: BlockEditorProps): ReactNode {
  const app = useApp();
  const controller = useController();
  const dialogs = useDialogs();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const rem = useRem(remId);
  const env: EditorEnv = { app, controller, instance };
  const envRef = useRef(env);
  envRef.current = env;

  // Mount the view once per Rem.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const initial = app.store.get(remId);
    if (!host || !initial) return;
    const navigate = (id: RemId): void => {
      window.location.hash = `#/rem/${id}`;
    };
    const editLatex = (source: string): Promise<string | null> =>
      dialogs.prompt({ title: 'Edit LaTeX', initial: source, confirmLabel: 'Save' });

    const view: EditorView = new EditorView(host, {
      state: EditorState.create({ doc: remToDoc(initial) }),
      nodeViews: {
        ref: refNodeView(app, navigate),
        latex: latexNodeView(editLatex),
        separator: separatorNodeView,
      },
      attributes: { class: 'pm-editor', spellcheck: 'true', 'data-placeholder': placeholder ?? '' },
      dispatchTransaction(tr: Transaction) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) {
          const patch = docToPatch(next.doc);
          const current = app.store.get(remId);
          if (current && !patchEquals(patch, current))
            app.rems.update(remId, patch, `text:${remId}`);
        }
        updatePopup(view);
        host.classList.toggle(
          'is-empty',
          next.doc.textContent === '' && next.doc.firstChild?.childCount === 0,
        );
      },
      handleTextInput(v, from, to, text) {
        return handleTextInput(v, from, to, text, (change) => app.rems.update(remId, change));
      },
      handleKeyDown(v, event) {
        return onKeyDown(v, event);
      },
      handlePaste(v, event) {
        return onPaste(v, event);
      },
      handleDOMEvents: {
        blur() {
          // Close popups when focus leaves the editor (but not when clicking into a popup).
          setTimeout(() => {
            if (!document.activeElement?.closest('.menu, .slash-menu, .autocomplete'))
              controller.setPopup(null);
          }, 150);
          return false;
        },
      },
    });
    viewRef.current = view;
    controller.activeView = { view, remId, instance };
    host.classList.toggle(
      'is-empty',
      view.state.doc.textContent === '' && view.state.doc.firstChild?.childCount === 0,
    );

    /** Opens/updates/closes the caret popup. */
    function updatePopup(v: EditorView): void {
      const trigger = detectTrigger(v);
      if (!trigger) {
        if (controller.getState().popup?.remId === remId) controller.setPopup(null);
        return;
      }
      const coords = v.coordsAtPos(trigger.from);
      controller.setPopup({
        ...trigger,
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
        remId,
        instance,
      });
    }

    /** Keyboard handling. */
    function onKeyDown(v: EditorView, e: KeyboardEvent): boolean {
      const e2 = envRef.current;
      const popup = controller.getState().popup;
      if (
        popup &&
        popup.remId === remId &&
        controller.popupKeys &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'].includes(
          e.key,
        )
      ) {
        if (controller.popupKeys(e.key)) {
          e.preventDefault();
          return true;
        }
      }
      const { state } = v;
      const sel = state.selection;
      const mod = isMod(e);
      const atStart = sel.empty && sel.from === 1;
      const atEnd = sel.empty && sel.from === state.doc.content.size - 1;

      if (mod && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) app.store.redo();
        else app.store.undo();
        return true;
      }
      switch (e.key) {
        case 'Enter': {
          if (e.shiftKey) {
            v.dispatch(state.tr.insertText('\n'));
            return true;
          }
          if (mod) {
            app.rems.toggleTodo(remId);
            return true;
          }
          e.preventDefault();
          const before = state.doc.cut(0, sel.from);
          const after = state.doc.cut(sel.to);
          splitRem(e2, remId, before, after);
          return true;
        }
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) outdent(e2, [remId], caretOffset(v));
          else indent(e2, [remId], caretOffset(v));
          return true;
        case 'Backspace': {
          // Turn a separator directly before the caret back into text.
          const nodeBefore = sel.empty ? sel.$from.nodeBefore : null;
          if (nodeBefore?.type === schema.nodes.separator) {
            const pos = sel.from - 1;
            v.dispatch(
              state.tr.replaceWith(pos, sel.from, schema.text(nodeBefore!.attrs.token as string)),
            );
            return true;
          }
          if (atStart) return backspaceAtStart(e2, remId);
          return false;
        }
        case 'Delete': {
          if (!atEnd) return false;
          const ids = controller.visibleIds(instance);
          const next = ids[ids.indexOf(remId) + 1];
          const nextRem = next ? app.store.get(next) : undefined;
          if (nextRem && nextRem.back === null && app.store.get(remId)?.back === null) {
            const offset = app.rems.mergeInto(next!, remId);
            controller.focus(instance, remId, offset);
            return true;
          }
          return false;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          const up = e.key === 'ArrowUp';
          if (mod && e.shiftKey) {
            e.preventDefault();
            const offset = caretOffset(v);
            if (up ? app.rems.moveUp(remId) : app.rems.moveDown(remId))
              controller.focus(instance, remId, offset);
            return true;
          }
          if (mod) {
            e.preventDefault();
            toggleCollapsed(e2, remId, up);
            return true;
          }
          if (
            e.shiftKey &&
            (up ? atStart || v.endOfTextblock('up') : atEnd || v.endOfTextblock('down'))
          ) {
            e.preventDefault();
            controller.select(instance, [remId]);
            controller.extendSelection(up ? -1 : 1);
            return true;
          }
          if (!e.shiftKey && v.endOfTextblock(up ? 'up' : 'down')) {
            const x = v.coordsAtPos(sel.head).left;
            if (
              controller.focusSibling(instance, remId, up ? -1 : 1, {
                x,
                edge: up ? 'bottom' : 'top',
              })
            ) {
              e.preventDefault();
              return true;
            }
          }
          return false;
        }
        case 'Escape':
          e.preventDefault();
          controller.select(instance, [remId]);
          return true;
        case 'a':
          if (mod && sel.from <= 1 && sel.to >= state.doc.content.size - 1) {
            e.preventDefault();
            controller.select(instance, controller.visibleIds(instance));
            return true;
          }
          return false;
      }
      if (mod) return onFormatKey(v, e);
      return false;
    }

    /** Formatting shortcuts. */
    function onFormatKey(v: EditorView, e: KeyboardEvent): boolean {
      const key = e.key.toLowerCase();
      const markFor: Record<string, keyof typeof schema.marks> = {
        b: 'bold',
        i: 'italic',
        u: 'underline',
        e: 'code',
      };
      let markName = !e.shiftKey ? markFor[key] : undefined;
      if (e.shiftKey && key === 's') markName = 'strike';
      if (e.shiftKey && key === 'h') markName = 'highlight';
      if (e.shiftKey && key === 'c') markName = 'cloze';
      if (e.shiftKey && key === 'd') {
        e.preventDefault();
        app.rems.duplicate(remId);
        return true;
      }
      if (e.shiftKey && key === 'backspace') {
        e.preventDefault();
        deleteRems(envRef.current, [remId]);
        return true;
      }
      if (!markName) return false;
      e.preventDefault();
      toggleMark(v, markName);
      return true;
    }

    /** Paste: multi-line text (and RemNote syntax) becomes Rems; images are uploaded. */
    function onPaste(v: EditorView, e: ClipboardEvent): boolean {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) {
        e.preventDefault();
        void (async () => {
          let after = remId;
          for (const file of files) {
            const src = await app.files.save(file, file.name);
            const current = app.store.get(remId);
            const parent = current?.parentId ?? null;
            after = app.rems.create({ parentId: parent, afterId: after }, { image: { src } }).id;
          }
        })();
        return true;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.includes('\n')) return false;
      e.preventDefault();
      const current = app.store.get(remId);
      if (!current) return true;
      const blank = v.state.doc.textContent === '' && v.state.doc.firstChild?.childCount === 0;
      const created = app.io.pasteAt({ parentId: current.parentId, afterId: remId }, text);
      if (blank && !app.store.children(remId).length) app.rems.delete([remId]);
      const last = created[created.length - 1];
      if (last) controller.focus(instance, last.id, 'end');
      return true;
    }

    applyCaret(view, caret);
    view.focus();
    return () => {
      if (controller.activeView?.view === view) controller.activeView = null;
      if (controller.getState().popup?.remId === remId) controller.setPopup(null);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remId]);

  // Re-apply the caret when the same Rem is focused again.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    applyCaret(view, caret);
    view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // Apply changes made outside the editor (undo, sync, commands).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !rem) return;
    if (patchEquals(docToPatch(view.state.doc), rem)) return;
    const offset = view.state.selection.from;
    const doc = remToDoc(rem);
    const state = EditorState.create({ doc, plugins: view.state.plugins });
    view.updateState(state);
    const pos = Math.min(Math.max(1, offset), doc.content.size - 1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    hostRef.current?.classList.toggle(
      'is-empty',
      doc.textContent === '' && doc.firstChild?.childCount === 0,
    );
  }, [rem]);

  return <div ref={hostRef} className="block-editor" />;
}

/**
 * Toggles a mark on the selection (or the stored marks when the selection is
 * empty). Clozes get a fresh id; highlights use yellow.
 */
export function toggleMark(
  view: EditorView,
  name: keyof typeof schema.marks,
  attrs?: Record<string, unknown>,
): void {
  const type = schema.marks[name]!;
  const { state } = view;
  const { from, to, empty } = state.selection;
  const markAttrs =
    attrs ??
    (name === 'cloze' ? { id: newId(8) } : name === 'highlight' ? { color: 'yellow' } : undefined);
  if (empty) {
    const active = (state.storedMarks ?? state.selection.$from.marks()).some(
      (m) => m.type === type,
    );
    view.dispatch(
      active ? state.tr.removeStoredMark(type) : state.tr.addStoredMark(type.create(markAttrs)),
    );
    return;
  }
  const has = state.doc.rangeHasMark(from, to, type);
  if (has && !attrs) view.dispatch(state.tr.removeMark(from, to, type));
  else view.dispatch(state.tr.removeMark(from, to, type).addMark(from, to, type.create(markAttrs)));
}

/** Inserts an inline node at the caret, replacing an optional range. */
export function insertInline(view: EditorView, node: PMNode, from?: number, to?: number): void {
  const { state } = view;
  const tr = state.tr.replaceWith(from ?? state.selection.from, to ?? state.selection.to, node);
  view.dispatch(tr);
  view.focus();
}

/** Selects a node (used after inserting LaTeX). */
export function selectNodeAt(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
}
