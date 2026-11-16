/**
 * Application service for the knowledge base tree: creating, editing,
 * moving and deleting Rems, documents, folders, tags and daily notes.
 *
 * Every public method is one undoable transaction, so the UI can map user
 * actions 1:1 to service calls.
 */
import { ancestors, walkSubtree } from '@core/model/graph';
import { createRem } from '@core/model/factories';
import { orderBetween, ordersBetween } from '@core/model/ordering';
import type { Rem, RemId, RichText, Timestamp } from '@core/model/types';
import { concat, rt, toPlainText } from '@core/richtext/ops';
import { fold } from '@core/search/search';
import { newId } from '@core/util/ids';
import { formatLongDate, isoDate, parseIsoDate } from '@core/util/time';
import type { Store, Transaction } from '../store/store';

/** Where to insert a new Rem. */
export interface InsertPosition {
  parentId: RemId | null;
  /** Insert after this sibling (`undefined` = append at the end, `null` = first). */
  afterId?: RemId | null;
}

/** Stable id of the folder holding daily documents. */
export const DAILY_FOLDER_ID = 'daily-documents';

/** Stable id of a daily document (identical on every device). */
export function dailyRemId(date: string): RemId {
  return `daily-${date}`;
}

/** Service for tree operations. */
export class RemService {
  constructor(private readonly store: Store) {}

  // =========================================================================
  // Queries
  // =========================================================================

  /** Plain-text title of a Rem (references resolved). */
  title(id: RemId): string {
    const rem = this.store.get(id);
    if (!rem) return '';
    return toPlainText(rem.text, (r) => toPlainText(this.store.get(r)?.text ?? []));
  }

  /** Ancestors from the root to the parent. */
  path(id: RemId): Rem[] {
    return ancestors(this.store, id);
  }

  /**
   * Finds a Rem by exact (case- and accent-insensitive) title or alias.
   * Documents and top-level Rems win over nested ones.
   */
  findByName(name: string): Rem | undefined {
    const target = fold(name.trim());
    if (!target) return undefined;
    let best: Rem | undefined;
    let bestScore = -1;
    for (const rem of this.store.all('rems')) {
      const matches =
        fold(toPlainText(rem.text)) === target || rem.aliases.some((a) => fold(a) === target);
      if (!matches) continue;
      const score = (rem.isDocument || rem.isFolder ? 2 : 0) + (rem.parentId === null ? 1 : 0);
      if (score > bestScore) {
        best = rem;
        bestScore = score;
      }
    }
    return best;
  }

  /** Index of a Rem among its siblings. */
  indexOf(id: RemId): number {
    const rem = this.store.get(id);
    if (!rem) return -1;
    return this.store.children(rem.parentId).findIndex((r) => r.id === id);
  }

  /** Previous sibling or `undefined`. */
  previousSibling(id: RemId): Rem | undefined {
    const rem = this.store.get(id);
    if (!rem) return undefined;
    const siblings = this.store.children(rem.parentId);
    return siblings[siblings.findIndex((r) => r.id === id) - 1];
  }

  /** Next sibling or `undefined`. */
  nextSibling(id: RemId): Rem | undefined {
    const rem = this.store.get(id);
    if (!rem) return undefined;
    const siblings = this.store.children(rem.parentId);
    const i = siblings.findIndex((r) => r.id === id);
    return i === -1 ? undefined : siblings[i + 1];
  }

  /** Order key for inserting at a position. */
  private orderAt(tx: Transaction | null, pos: InsertPosition): string {
    const siblings = this.store.children(pos.parentId);
    if (pos.afterId === undefined)
      return orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
    if (pos.afterId === null) return orderBetween(null, siblings[0]?.order ?? null);
    const i = siblings.findIndex((r) => r.id === pos.afterId);
    const after = tx?.get('rems', pos.afterId) ?? siblings[i];
    return orderBetween(after?.order ?? null, siblings[i + 1]?.order ?? null);
  }

  // =========================================================================
  // Creation
  // =========================================================================

  /**
   * Creates a Rem.
   *
   * @param pos Insert position.
   * @param partial Initial fields.
   */
  create(pos: InsertPosition, partial: Partial<Rem> = {}): Rem {
    return this.store.transact((tx) => this.createIn(tx, pos, partial));
  }

  /** Creates a Rem inside an existing transaction. */
  createIn(tx: Transaction, pos: InsertPosition, partial: Partial<Rem> = {}): Rem {
    const now = this.store.clock.now();
    const rem = createRem(
      { ...partial, parentId: pos.parentId, order: this.orderAt(tx, pos) },
      now,
    );
    return tx.put('rems', rem);
  }

  /** Creates a document (optionally inside a folder or document). */
  createDocument(parentId: RemId | null, title = 'Untitled'): Rem {
    return this.create({ parentId }, { text: rt(title), isDocument: true });
  }

  /** Creates a folder. */
  createFolder(parentId: RemId | null, title = 'New Folder'): Rem {
    return this.create({ parentId }, { text: rt(title), isFolder: true, isDocument: true });
  }

  /**
   * Returns the id of the Rem with the given name, creating a new top-level
   * document when none exists (used by `[[references]]` and `#tags`).
   */
  ensureByName(name: string, tx?: Transaction): RemId {
    const existing = this.findByName(name);
    if (existing) return existing.id;
    const create = (t: Transaction): RemId =>
      this.createIn(t, { parentId: null }, { text: rt(name.trim()), isDocument: true }).id;
    return tx ? create(tx) : this.store.transact(create);
  }

  /**
   * Returns today's (or another day's) daily document, creating it and the
   * "Daily Documents" folder on first use. Ids are deterministic, so two
   * offline devices create the very same records.
   */
  ensureDaily(date: string = isoDate(Date.now())): RemId {
    const id = dailyRemId(date);
    if (this.store.get(id)) return id;
    this.store.transact((tx) => {
      if (!tx.get('rems', DAILY_FOLDER_ID)) {
        tx.put(
          'rems',
          createRem(
            {
              id: DAILY_FOLDER_ID,
              parentId: null,
              order: this.orderAt(tx, { parentId: null }),
              text: rt('Daily Documents'),
              isFolder: true,
              isDocument: true,
            },
            this.store.clock.now(),
          ),
        );
      }
      // Daily documents are ordered newest first.
      const order = `z${String(99999999 - Number(date.replace(/-/g, ''))).padStart(8, '0')}`;
      tx.put(
        'rems',
        createRem(
          {
            id,
            parentId: DAILY_FOLDER_ID,
            order,
            text: rt(formatLongDate(parseIsoDate(date))),
            isDocument: true,
            dailyDate: date,
          },
          this.store.clock.now(),
        ),
      );
    });
    return id;
  }

  // =========================================================================
  // Editing
  // =========================================================================

  /**
   * Updates fields of a Rem.
   *
   * @param id Rem id.
   * @param patch Fields to change (`undefined` removes a field).
   * @param coalesceKey Merge consecutive edits into one undo step.
   */
  update(id: RemId, patch: Partial<Rem>, coalesceKey?: string): void {
    this.store.transact(
      (tx) => void tx.update('rems', id, patch),
      coalesceKey ? { coalesceKey } : {},
    );
  }

  /** Updates many Rems in one undo step. */
  updateMany(ids: readonly RemId[], patch: Partial<Rem> | ((rem: Rem) => Partial<Rem>)): void {
    this.store.transact((tx) => {
      for (const id of ids) {
        const rem = tx.get('rems', id);
        if (rem) tx.update('rems', id, typeof patch === 'function' ? patch(rem) : patch);
      }
    });
  }

  /** Cycles a todo: none -> unfinished -> finished -> unfinished. */
  toggleTodo(id: RemId): void {
    const rem = this.store.get(id);
    if (!rem) return;
    this.update(id, { todo: rem.todo === 'unfinished' ? 'finished' : 'unfinished' });
  }

  // =========================================================================
  // Structure
  // =========================================================================

  /**
   * Moves Rems to a new position (keeping their relative order).
   *
   * @returns False when the move would create a cycle.
   */
  move(ids: readonly RemId[], pos: InsertPosition): boolean {
    // A Rem cannot be moved into its own subtree.
    for (const id of ids) {
      if (
        pos.parentId === id ||
        (pos.parentId && ancestors(this.store, pos.parentId).some((a) => a.id === id))
      )
        return false;
    }
    this.store.transact((tx) => {
      const moving = ids.filter((id) => tx.get('rems', id));
      // Siblings at the destination, excluding the moved Rems themselves.
      const siblings = this.store.children(pos.parentId).filter((r) => !moving.includes(r.id));
      let lo: string | null;
      let hi: string | null;
      if (pos.afterId === undefined) {
        lo = siblings[siblings.length - 1]?.order ?? null;
        hi = null;
      } else if (pos.afterId === null) {
        lo = null;
        hi = siblings[0]?.order ?? null;
      } else {
        const i = siblings.findIndex((r) => r.id === pos.afterId);
        lo = siblings[i]?.order ?? null;
        hi = siblings[i + 1]?.order ?? null;
      }
      const orders = ordersBetween(lo, hi, moving.length);
      moving.forEach((id, k) =>
        tx.update('rems', id, { parentId: pos.parentId, order: orders[k]! }),
      );
    });
    return true;
  }

  /** Indents Rems: they become the last children of their previous sibling. */
  indent(ids: readonly RemId[]): boolean {
    const first = ids[0];
    if (!first) return false;
    const prev = this.previousSibling(first);
    if (!prev) return false;
    const children = this.store.children(prev.id);
    const ok = this.move(ids, {
      parentId: prev.id,
      afterId: children[children.length - 1]?.id ?? null,
    });
    if (ok && prev.collapsed) this.update(prev.id, { collapsed: undefined });
    return ok;
  }

  /** Outdents Rems: they become siblings right after their parent. */
  outdent(ids: readonly RemId[], stopAt: RemId | null = null): boolean {
    const first = this.store.get(ids[0] ?? '');
    if (!first || first.parentId === null || first.parentId === stopAt) return false;
    const parent = this.store.get(first.parentId);
    if (!parent) return false;
    return this.move(ids, { parentId: parent.parentId, afterId: parent.id });
  }

  /** Moves a Rem one position up among its siblings. */
  moveUp(id: RemId): boolean {
    const rem = this.store.get(id);
    const prev = this.previousSibling(id);
    if (!rem || !prev) return false;
    const before = this.previousSibling(prev.id);
    return this.move([id], { parentId: rem.parentId, afterId: before?.id ?? null });
  }

  /** Moves a Rem one position down among its siblings. */
  moveDown(id: RemId): boolean {
    const rem = this.store.get(id);
    const next = this.nextSibling(id);
    if (!rem || !next) return false;
    return this.move([id], { parentId: rem.parentId, afterId: next.id });
  }

  /**
   * Splits a Rem at the caret (Enter key). The text after the caret moves to
   * a new Rem below; if the Rem has visible children, the new Rem becomes the
   * first child (like RemNote).
   *
   * @returns The new Rem.
   */
  split(id: RemId, before: RichText, after: RichText, inherit: Partial<Rem> = {}): Rem | undefined {
    const rem = this.store.get(id);
    if (!rem) return undefined;
    const children = this.store.children(id);
    return this.store.transact((tx) => {
      tx.update('rems', id, { text: before });
      const asChild = children.length > 0 && !rem.collapsed;
      const pos: InsertPosition = asChild
        ? { parentId: id, afterId: null }
        : { parentId: rem.parentId, afterId: id };
      return this.createIn(tx, pos, { text: after, ...inherit });
    });
  }

  /**
   * Merges a Rem into the previous visible Rem (Backspace at the start).
   *
   * @param id Rem to merge.
   * @param previousId The Rem visually above it.
   * @returns Caret offset (length of the previous text) or -1 if not merged.
   */
  mergeInto(id: RemId, previousId: RemId): number {
    const rem = this.store.get(id);
    const prev = this.store.get(previousId);
    if (!rem || !prev) return -1;
    const offset = toPlainText(prev.text).length;
    this.store.transact((tx) => {
      tx.update('rems', previousId, { text: concat(prev.text, rem.text) });
      // Re-parent the merged Rem's children to the previous Rem.
      const kids = this.store.children(id);
      const existing = this.store.children(previousId);
      let last = existing[existing.length - 1]?.order ?? null;
      for (const kid of kids) {
        const order = orderBetween(last, null);
        tx.update('rems', kid.id, { parentId: previousId, order });
        last = order;
      }
      this.deleteIn(tx, [id], false);
    });
    return offset;
  }

  /** Deletes Rems with their subtrees (and their card states). */
  delete(ids: readonly RemId[]): void {
    this.store.transact((tx) => this.deleteIn(tx, ids, true));
  }

  /** Deletion inside a transaction. */
  private deleteIn(tx: Transaction, ids: readonly RemId[], withSubtree: boolean): void {
    for (const id of ids) {
      const victims: RemId[] = [];
      if (withSubtree) walkSubtree(this.store, id, (r) => void victims.push(r.id));
      else victims.push(id);
      for (const v of victims) {
        for (const cardId of this.store.cardStateIds(v)) tx.delete('cards', cardId);
        tx.delete('rems', v);
      }
    }
  }

  /**
   * Deep-copies a subtree to a new position (duplicate, templates).
   *
   * @returns The id of the copy's root.
   */
  copySubtree(rootId: RemId, pos: InsertPosition, overrides: Partial<Rem> = {}): RemId | undefined {
    const root = this.store.get(rootId);
    if (!root) return undefined;
    return this.store.transact((tx) => this.copyIn(tx, rootId, pos, overrides));
  }

  private copyIn(
    tx: Transaction,
    rootId: RemId,
    pos: InsertPosition,
    overrides: Partial<Rem>,
    now: Timestamp = this.store.clock.now(),
  ): RemId {
    const root = this.store.get(rootId)!;
    const {
      id: _id,
      parentId: _p,
      order: _o,
      createdAt: _c,
      updatedAt: _u,
      pinned: _pin,
      dailyDate: _d,
      ...content
    } = root;
    const copy = this.createIn(tx, pos, {
      ...structuredClone(content),
      ...overrides,
      createdAt: now,
    });
    let after: RemId | null = null;
    for (const child of this.store.children(rootId)) {
      after = this.copyIn(tx, child.id, { parentId: copy.id, afterId: after }, {}, now);
    }
    return copy.id;
  }

  /** Duplicates a Rem below itself. */
  duplicate(id: RemId): RemId | undefined {
    const rem = this.store.get(id);
    if (!rem) return undefined;
    return this.copySubtree(id, { parentId: rem.parentId, afterId: id });
  }

  /**
   * Applies a template: copies the template's children below `targetId`.
   */
  applyTemplate(templateId: RemId, targetId: RemId): void {
    this.store.transact((tx) => {
      let after: RemId | null | undefined = this.store.children(targetId).at(-1)?.id;
      for (const child of this.store.children(templateId)) {
        after = this.copyIn(tx, child.id, { parentId: targetId, afterId: after ?? undefined }, {});
      }
    });
  }

  /** Adds a tag (by Rem id) to a Rem. */
  addTag(id: RemId, tagId: RemId): void {
    const rem = this.store.get(id);
    if (!rem || rem.tags.includes(tagId) || id === tagId) return;
    this.update(id, { tags: [...rem.tags, tagId] });
  }

  /** Removes a tag from a Rem. */
  removeTag(id: RemId, tagId: RemId): void {
    const rem = this.store.get(id);
    if (!rem) return;
    this.update(id, { tags: rem.tags.filter((t) => t !== tagId) });
  }

  /** Creates a new Rem id without inserting anything (for optimistic UI). */
  static newId(): RemId {
    return newId();
  }
}
