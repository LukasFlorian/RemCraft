/**
 * Block-level editing actions shared by the text editor key bindings, the
 * block-selection mode, toolbars and the slash menu.
 */
import type { Node as PMNode } from 'prosemirror-model';
import type { RemCraftApp } from '@data/app';
import type { Rem, RemId } from '@core/model/types';
import { isEmpty } from '@core/richtext/ops';
import type { CaretRequest, EditorController } from './controller';
import { docToPatch } from './convert';
import type { RemContentPatch } from './convert';

/** Everything an action needs. */
export interface EditorEnv {
  app: RemCraftApp;
  controller: EditorController;
  /** Outliner instance the action happens in. */
  instance: string;
}

/** True when a Rem has no visible content. */
export function isBlank(rem: Rem): boolean {
  return isEmpty(rem.text) && (rem.back === null || isEmpty(rem.back)) && !rem.image && !rem.divider && !rem.portalOf && !rem.searchQuery && !rem.file && !rem.embed;
}

/**
 * Splits the focused Rem at the caret (Enter).
 *
 * @param env Editor environment.
 * @param remId Focused Rem.
 * @param before Document content before the caret.
 * @param after Document content after the caret.
 */
export function splitRem(env: EditorEnv, remId: RemId, before: PMNode, after: PMNode): void {
  const { app, controller, instance } = env;
  const rem = app.store.get(remId);
  if (!rem) return;
  const head: RemContentPatch = docToPatch(before);
  const tail: RemContentPatch = docToPatch(after);
  const root = controller.rootOf(instance);

  // Enter on an empty nested Rem outdents it (common outliner behaviour).
  if (isBlank(rem) && rem.parentId !== root && rem.parentId !== null && app.store.children(remId).length === 0) {
    app.rems.outdent([remId], root ?? null);
    controller.focus(instance, remId, 'start');
    return;
  }

  const children = app.store.children(remId);
  const asFirstChild = children.length > 0 && !rem.collapsed;
  const newRem = app.store.transact((tx) => {
    tx.update('rems', remId, head);
    return app.rems.createIn(tx, asFirstChild ? { parentId: remId, afterId: null } : { parentId: rem.parentId, afterId: remId }, {
      ...tail,
      ...(rem.todo ? { todo: 'unfinished' as const } : {}),
    });
  });
  controller.focus(instance, newRem.id, 'start');
}

/**
 * Backspace at the start of a Rem: removes block formatting first, then
 * deletes an empty Rem or merges it into the Rem above.
 *
 * @returns True when handled.
 */
export function backspaceAtStart(env: EditorEnv, remId: RemId): boolean {
  const { app, controller, instance } = env;
  const rem = app.store.get(remId);
  if (!rem) return false;
  if (rem.heading || rem.todo || rem.quote) {
    app.rems.update(remId, { heading: undefined, todo: undefined, quote: undefined });
    return true;
  }
  const ids = controller.visibleIds(instance);
  const prevId = ids[ids.indexOf(remId) - 1];
  const hasChildren = app.store.children(remId).length > 0;
  if (isBlank(rem) && !hasChildren) {
    app.rems.delete([remId]);
    if (prevId) controller.focus(instance, prevId, 'end');
    else {
      const next = ids[ids.indexOf(remId) + 1];
      if (next) controller.focus(instance, next, 'start');
    }
    return true;
  }
  if (!prevId) return false;
  const prev = app.store.get(prevId);
  if (!prev) return false;
  // Merge only plain text into plain text; otherwise just move the caret up.
  if (rem.back === null && prev.back === null && !prev.code && !prev.latexBlock && !prev.portalOf) {
    const offset = app.rems.mergeInto(remId, prevId);
    controller.focus(instance, prevId, offset);
  } else {
    controller.focus(instance, prevId, 'end');
  }
  return true;
}

/** Indents the given Rems and keeps the caret. */
export function indent(env: EditorEnv, ids: RemId[], caret: CaretRequest | null): void {
  if (env.app.rems.indent(ids) && caret !== null && ids[0]) env.controller.focus(env.instance, ids[0], caret);
}

/** Outdents the given Rems (never above the outliner root) and keeps the caret. */
export function outdent(env: EditorEnv, ids: RemId[], caret: CaretRequest | null): void {
  const root = env.controller.rootOf(env.instance) ?? null;
  if (env.app.rems.outdent(ids, root) && caret !== null && ids[0]) env.controller.focus(env.instance, ids[0], caret);
}

/** Deletes Rems and focuses the Rem above. */
export function deleteRems(env: EditorEnv, ids: RemId[]): void {
  const visible = env.controller.visibleIds(env.instance);
  const first = visible.indexOf(ids[0] ?? '');
  const prev = visible.slice(0, Math.max(0, first)).reverse().find((id) => !ids.includes(id));
  env.app.rems.delete(ids);
  if (prev) env.controller.focus(env.instance, prev, 'end');
  else env.controller.blur();
}

/** Toggles the collapsed state of a Rem. */
export function toggleCollapsed(env: EditorEnv, remId: RemId, collapsed?: boolean): void {
  const rem = env.app.store.get(remId);
  if (!rem || env.app.store.children(remId).length === 0) return;
  const next = collapsed ?? !rem.collapsed;
  env.app.rems.update(remId, { collapsed: next || undefined });
}

/** Appends a new empty Rem at the end of the outliner (click below the last block). */
export function appendRem(env: EditorEnv): void {
  const root = env.controller.rootOf(env.instance);
  if (!root) return;
  const children = env.app.store.children(root);
  const last = children[children.length - 1];
  if (last && isBlank(last) && env.app.store.children(last.id).length === 0) {
    env.controller.focus(env.instance, last.id, 'end');
    return;
  }
  const rem = env.app.rems.create({ parentId: root });
  env.controller.focus(env.instance, rem.id, 'start');
}

/** Copies Rems as RemNote-compatible Markdown to the clipboard. */
export async function copyRems(env: EditorEnv, ids: RemId[]): Promise<void> {
  const md = env.app.io.exportMarkdown(ids);
  try {
    await navigator.clipboard.writeText(md);
  } catch {
    // Clipboard permission denied - ignore.
  }
}
