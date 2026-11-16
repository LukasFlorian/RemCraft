/**
 * Application service for import and export.
 */
import { createBackup, parseBackup } from '@core/io/backup';
import type { Backup } from '@core/io/backup';
import { csvToCardRems, parseCsv } from '@core/io/csv';
import { exportMarkdown, outlineToRems } from '@core/io/markdown';
import { parseOpml } from '@core/io/opml';
import type { OutlineNode } from '@core/io/outline';
import { parseOutline } from '@core/io/outline';
import type { CollectionName, Rem, RemId } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import type { RecordOf, Store, Transaction } from '../store/store';
import type { InsertPosition, RemService } from './rems';

/** Supported text import formats. */
export type TextFormat = 'markdown' | 'opml' | 'csv';

/** Options for CSV imports. */
export interface CsvOptions {
  hasHeader: boolean;
  frontColumn: number;
  backColumn: number;
  bothDirections: boolean;
}

/** Import/export operations. */
export class ImportExportService {
  constructor(
    private readonly store: Store,
    private readonly rems: RemService,
  ) {}

  /**
   * Imports text as a new document.
   *
   * @param title Title of the new document.
   * @param text File contents.
   * @param format Text format.
   * @param parentId Folder to create the document in.
   * @returns Id of the created document and number of imported Rems.
   */
  importAsDocument(title: string, text: string, format: TextFormat, parentId: RemId | null = null, csv?: Partial<CsvOptions>): { docId: RemId; count: number } {
    return this.store.transact((tx) => {
      const doc = this.rems.createIn(tx, { parentId }, { text: rt(title), isDocument: true });
      const count = this.importInto(tx, text, format, { parentId: doc.id }, csv);
      return { docId: doc.id, count };
    });
  }

  /**
   * Inserts text (e.g. pasted) at a position. Lines with card delimiters
   * become flashcards, exactly like RemNote's paste import.
   *
   * @returns The created top-level Rems.
   */
  pasteAt(pos: InsertPosition, text: string): Rem[] {
    return this.store.transact((tx) => this.insertOutline(tx, parseOutline(text), pos));
  }

  /** Imports into an existing parent inside a transaction. */
  private importInto(tx: Transaction, text: string, format: TextFormat, pos: InsertPosition, csv?: Partial<CsvOptions>): number {
    if (format === 'csv') {
      const rems = csvToCardRems(parseCsv(text), {
        parentId: pos.parentId!,
        hasHeader: csv?.hasHeader ?? false,
        frontColumn: csv?.frontColumn ?? 0,
        backColumn: csv?.backColumn ?? 1,
        bothDirections: csv?.bothDirections ?? false,
        now: this.store.clock.now(),
      });
      for (const r of rems) tx.put('rems', r);
      return rems.length;
    }
    const nodes = format === 'opml' ? parseOpml(text) : parseOutline(text);
    return this.insertOutline(tx, nodes, pos).length === 0 ? 0 : countRems(nodes);
  }

  /** Converts outline nodes and writes the Rems. */
  private insertOutline(tx: Transaction, nodes: readonly OutlineNode[], pos: InsertPosition): Rem[] {
    const siblings = this.store.children(pos.parentId);
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
    if (lo !== null && hi !== null && lo >= hi) hi = null;
    const created = outlineToRems(nodes, pos.parentId, {
      resolveRef: (name) => this.rems.ensureByName(name, tx),
      resolveTag: (name) => this.rems.ensureByName(name, tx),
      now: this.store.clock.now(),
    }, lo, hi);
    for (const r of created) tx.put('rems', r);
    return created.filter((r) => r.parentId === pos.parentId);
  }

  /** Exports subtrees as RemNote-compatible Markdown. */
  exportMarkdown(rootIds: readonly RemId[], includeRoot = true): string {
    return exportMarkdown(this.store, rootIds, { includeRoot });
  }

  /** Creates a full JSON backup. */
  exportBackup(): Backup {
    return createBackup({
      settings: [...this.store.all('settings')],
      schedulers: [...this.store.all('schedulers')],
      rems: [...this.store.all('rems')],
      cards: [...this.store.all('cards')],
      logs: [...this.store.all('logs')],
      exams: [...this.store.all('exams')],
    });
  }

  /**
   * Restores a backup.
   *
   * @param json Backup file contents.
   * @param mode `merge` keeps newer local records, `replace` deletes everything first.
   * @returns Number of restored records.
   */
  importBackup(json: string, mode: 'merge' | 'replace'): number {
    const backup = parseBackup(json);
    let count = 0;
    this.store.transact(
      (tx) => {
        const names = Object.keys(backup.collections) as CollectionName[];
        if (mode === 'replace') {
          for (const name of names) for (const r of this.store.all(name)) tx.delete(name, r.id);
        }
        for (const name of names) {
          for (const record of backup.collections[name] as RecordOf<CollectionName>[]) {
            const local = tx.get(name, record.id);
            if (mode === 'merge' && local && local.updatedAt >= record.updatedAt) continue;
            tx.put(name, record);
            count++;
          }
        }
      },
      { keepTimestamps: mode === 'merge' },
    );
    return count;
  }
}

/** Counts nodes recursively. */
function countRems(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countRems(node.children), 0);
}
