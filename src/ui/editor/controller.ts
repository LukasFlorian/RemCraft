/**
 * Editor controller: global UI state of the outliner.
 *
 * Holds which Rem is being edited (focus), which Rems are block-selected,
 * the open popup (slash menu / autocomplete) and the active ProseMirror view.
 * Components subscribe with fine-grained selectors, so moving the focus only
 * re-renders the two affected blocks.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { RemId } from '@core/model/types';
import type { Store } from '@data/store/store';

/**
 * Where to put the caret when a block gains focus: start/end, a character
 * offset, a viewport point (mouse click) or a horizontal position on the
 * block's first/last line (arrow-key navigation).
 */
export type CaretRequest = 'start' | 'end' | number | { x: number; y: number } | { x: number; edge: 'top' | 'bottom' };

/** Focus target: a Rem inside a specific outliner instance. */
export interface FocusState {
  instance: string;
  remId: RemId;
  caret: CaretRequest;
  /** Increments on every focus request so the same target can be re-focused. */
  nonce: number;
}

/** Kinds of popups attached to the caret. */
export type PopupKind = 'slash' | 'ref' | 'tag' | 'portal';

/** An open popup. */
export interface PopupState {
  kind: PopupKind;
  query: string;
  /** Document range of the trigger + query (replaced on selection). */
  from: number;
  to: number;
  /** Viewport coordinates of the caret. */
  left: number;
  top: number;
  bottom: number;
  remId: RemId;
  instance: string;
}

/** Block selection. */
export interface SelectionState {
  instance: string;
  ids: RemId[];
  anchor: RemId;
}

/** Drop target while dragging. */
export interface DropState {
  remId: RemId;
  zone: 'before' | 'after' | 'child';
}

/** Snapshot of the controller state. */
export interface ControllerState {
  focus: FocusState | null;
  selection: SelectionState | null;
  popup: PopupState | null;
  dragging: RemId[] | null;
  drop: DropState | null;
}

/** Key handler registered by an open popup. */
type PopupKeyHandler = (key: string) => boolean;

/** Global editor state container. */
export class EditorController {
  private state: ControllerState = { focus: null, selection: null, popup: null, dragging: null, drop: null };
  private readonly listeners = new Set<() => void>();
  private nonce = 0;
  /** Root Rem per outliner instance (for visible-order navigation). */
  private readonly roots = new Map<string, RemId>();
  /** The mounted ProseMirror view and its Rem. */
  activeView: { view: EditorView; remId: RemId; instance: string } | null = null;
  /** Key handler of the open popup. */
  popupKeys: PopupKeyHandler | null = null;

  constructor(private readonly store: Store) {}

  // --- subscription ----------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ControllerState => this.state;

  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // --- outliner instances ----------------------------------------------------

  /** Registers an outliner instance with its root Rem. */
  register(instance: string, rootId: RemId): () => void {
    this.roots.set(instance, rootId);
    return () => this.roots.delete(instance);
  }

  /** Root of an outliner instance. */
  rootOf(instance: string): RemId | undefined {
    return this.roots.get(instance);
  }

  /**
   * Rems of an outliner in display order (collapsed subtrees skipped).
   *
   * @param instance Outliner instance.
   */
  visibleIds(instance: string): RemId[] {
    const root = this.roots.get(instance);
    if (!root) return [];
    const out: RemId[] = [];
    const visit = (id: RemId): void => {
      for (const child of this.store.children(id)) {
        out.push(child.id);
        if (!child.collapsed && !child.portalOf) visit(child.id);
      }
    };
    visit(root);
    return out;
  }

  // --- focus -------------------------------------------------------------------

  /** Focuses a Rem for editing. */
  focus(instance: string, remId: RemId, caret: CaretRequest = 'end'): void {
    this.set({ focus: { instance, remId, caret, nonce: ++this.nonce }, selection: null, popup: null });
  }

  /** Clears the focus (keeps the block selection). */
  blur(): void {
    if (this.state.focus || this.state.popup) this.set({ focus: null, popup: null });
  }

  /** Moves the focus to the previous/next visible Rem. */
  focusSibling(instance: string, remId: RemId, delta: -1 | 1, caret: CaretRequest): boolean {
    const ids = this.visibleIds(instance);
    const i = ids.indexOf(remId);
    const target = ids[i + delta];
    if (i === -1 || !target) return false;
    this.focus(instance, target, caret);
    return true;
  }

  // --- selection --------------------------------------------------------------

  /** Selects blocks (exits text editing). */
  select(instance: string, ids: RemId[], anchor: RemId = ids[0]!): void {
    this.set({ selection: ids.length ? { instance, ids, anchor } : null, focus: null, popup: null });
  }

  /** Extends the block selection by one visible Rem. */
  extendSelection(delta: -1 | 1): void {
    const sel = this.state.selection;
    if (!sel) return;
    const ids = this.visibleIds(sel.instance);
    const anchorIdx = ids.indexOf(sel.anchor);
    const edgeId = sel.ids[0] === sel.anchor ? sel.ids[sel.ids.length - 1]! : sel.ids[0]!;
    const edge = Math.min(Math.max(ids.indexOf(edgeId) + delta, 0), ids.length - 1);
    const [a, b] = anchorIdx <= edge ? [anchorIdx, edge] : [edge, anchorIdx];
    this.set({ selection: { ...sel, ids: ids.slice(a, b + 1) } });
  }

  /** Clears the block selection. */
  clearSelection(): void {
    if (this.state.selection) this.set({ selection: null });
  }

  /**
   * Top-level Rems of the selection (children of selected Rems are implied).
   */
  selectedRoots(): RemId[] {
    const sel = this.state.selection;
    if (!sel) return [];
    const set = new Set(sel.ids);
    return sel.ids.filter((id) => {
      let p = this.store.get(id)?.parentId ?? null;
      while (p) {
        if (set.has(p)) return false;
        p = this.store.get(p)?.parentId ?? null;
      }
      return true;
    });
  }

  // --- popups -----------------------------------------------------------------

  /** Opens or updates the caret popup. */
  setPopup(popup: PopupState | null): void {
    const cur = this.state.popup;
    if (cur === popup) return;
    if (cur && popup && cur.kind === popup.kind && cur.query === popup.query && cur.from === popup.from && cur.to === popup.to) return;
    this.set({ popup });
  }

  // --- drag & drop --------------------------------------------------------------

  setDragging(ids: RemId[] | null): void {
    this.set({ dragging: ids, drop: null });
  }

  setDrop(drop: DropState | null): void {
    const cur = this.state.drop;
    if (cur?.remId === drop?.remId && cur?.zone === drop?.zone) return;
    this.set({ drop });
  }
}

/** React context of the controller. */
export const ControllerContext = createContext<EditorController | null>(null);

/** Returns the controller. */
export function useController(): EditorController {
  const c = useContext(ControllerContext);
  if (!c) throw new Error('useController outside ControllerContext');
  return c;
}

/** Subscribes to a slice of the controller state. */
export function useControllerState<T>(selector: (s: ControllerState) => T): T {
  const c = useController();
  return useSyncExternalStore(
    c.subscribe,
    () => selector(c.getState()),
    () => selector(c.getState()),
  );
}
