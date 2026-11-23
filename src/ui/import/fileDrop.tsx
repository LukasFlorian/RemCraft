/**
 * Drag and drop of files from the computer, anywhere in the app.
 *
 * Elements mark themselves as drop targets with `data-file-drop`:
 *
 *   data-file-drop="root"          top level (sidebar background, documents page)
 *   data-file-drop="rem:<id>"      a folder or document (sidebar rows, tiles, pages)
 *   data-file-drop="deck:<id>"     a slide deck or lecture (cards go onto its slides)
 *
 * One listener on the window finds the innermost target under the pointer,
 * highlights it and shows what happens; on drop every file is imported by its
 * kind (`core/io/fileKinds.ts`): PDFs become slide decks, card files go onto
 * the deck's slides, shares are cloned, text formats become documents, images
 * and other files are stored.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Upload } from 'lucide-react';
import type { RemId } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import { classifyByName, classifyJson, looksTabSeparated } from '@core/io/fileKinds';
import type { FileKind } from '@core/io/fileKinds';
import { useApp } from '../app/context';
import { useDialogs } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { importCardFile } from '../lecture/DeckPanel';

/** Where dropped files go. */
export interface FileDropTarget {
  /** Folder/document that receives new documents and decks (null = top level). */
  parentId: RemId | null;
  /** The target Rem itself, when it is a document: images and files are appended to it. */
  documentId?: RemId;
  /** Slide deck that receives card files. */
  deckId?: RemId;
  /** Name shown while dragging. */
  label: string;
}

/** Value of `data-file-drop` for a Rem (deck or not). */
export function fileDropAttr(remId: RemId | null, isDeck = false): string {
  return remId === null ? 'root' : `${isDeck ? 'deck' : 'rem'}:${remId}`;
}

/** Whether a drag carries files (not Rems or text dragged inside the app). */
function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/** Result of importing dropped files. */
export interface DropResult {
  /** Created documents/decks (to open when only one file was dropped). */
  created: RemId[];
  /** Counts per kind, for the summary. */
  counts: Partial<Record<FileKind, number>>;
  failed: string[];
}

/** German labels of the kinds (singular, plural). */
const KIND_LABELS: Record<FileKind, [string, string]> = {
  pdf: ['Foliensatz', 'Foliensätze'],
  cards: ['Kartendatei', 'Kartendateien'],
  share: ['Freigabe', 'Freigaben'],
  backup: ['Backup', 'Backups'],
  markdown: ['Dokument', 'Dokumente'],
  csv: ['Tabelle', 'Tabellen'],
  opml: ['Gliederung', 'Gliederungen'],
  image: ['Bild', 'Bilder'],
  file: ['Datei', 'Dateien'],
};

/** "2 Foliensätze, 1 Dokument". */
export function summarize(counts: DropResult['counts']): string {
  return (Object.entries(counts) as [FileKind, number][])
    .map(([k, n]) => `${n} ${KIND_LABELS[k][n === 1 ? 0 : 1]}`)
    .join(', ');
}

/** Imports files into a target; returns what was created. */
export function useImportFiles(): (files: File[], target: FileDropTarget) => Promise<DropResult> {
  const app = useApp();
  const toast = useToast();
  const dialogs = useDialogs();
  return async (files, target) => {
    const result: DropResult = { created: [], counts: {}, failed: [] };
    for (const file of files) {
      try {
        let kind = classifyByName(file.name, file.type);
        let text: string | null = null;
        if (/\.json$/i.test(file.name)) {
          text = await file.text();
          kind = classifyJson(JSON.parse(text)) ?? 'file';
        }
        const parent = target.parentId;
        const name = file.name.replace(/\.(cards|fokus|remcraft)?\.?[^.]+$/i, '') || file.name;
        switch (kind) {
          case 'pdf': {
            toast(`„${file.name}“ wird als Foliensatz analysiert …`);
            result.created.push(await app.lectures.importPdf(file, parent));
            break;
          }
          case 'cards': {
            const deck = await importCardFile(app, file, target.deckId, toast, parent);
            if (!deck) throw new Error('kein passender Foliensatz');
            if (!target.deckId) result.created.push(deck);
            break;
          }
          case 'share': {
            const snap = await app.sharing.readFile(file);
            result.created.push(await app.sharing.clone(snap, parent));
            break;
          }
          case 'backup': {
            const ok = await dialogs.confirm({
              title: 'Backup wiederherstellen?',
              message: `„${file.name}“ ist ein vollständiges RemCraft-Backup. Seine Einträge werden mit deinen zusammengeführt (neuere lokale Einträge bleiben).`,
              confirmLabel: 'Wiederherstellen',
            });
            if (!ok) continue;
            const n = app.io.importBackup(text ?? (await file.text()), 'merge');
            toast(`${n} Einträge wiederhergestellt`);
            break;
          }
          case 'markdown':
          case 'csv':
          case 'opml': {
            const content = text ?? (await file.text());
            // Anki/Quizlet exports are tab separated .txt files.
            const format =
              kind === 'opml'
                ? 'opml'
                : kind === 'csv' || looksTabSeparated(content)
                  ? 'csv'
                  : 'markdown';
            const { docId } = app.io.importAsDocument(name, content, format, parent);
            result.created.push(docId);
            break;
          }
          case 'image':
          case 'file': {
            const src = await app.files.save(file, file.name);
            const content =
              kind === 'image'
                ? { image: { src } }
                : { file: { src, name: file.name, mimeType: file.type, size: file.size } };
            if (target.documentId) {
              // Into the open/target document, at its end.
              app.rems.create({ parentId: target.documentId }, { text: rt(''), ...content });
            } else {
              const doc = app.rems.create(
                { parentId: parent },
                { text: rt(name), isDocument: true, ...(kind === 'file' ? content : {}) },
              );
              if (kind === 'image')
                app.rems.create({ parentId: doc.id }, { text: rt(''), ...content });
              result.created.push(doc.id);
            }
            break;
          }
        }
        result.counts[kind] = (result.counts[kind] ?? 0) + 1;
      } catch (e) {
        result.failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return result;
  };
}

/** Resolves a `data-file-drop` value into a target. */
function useResolveTarget(): (attr: string) => FileDropTarget | null {
  const app = useApp();
  return (attr) => {
    if (attr === 'root') return { parentId: null, label: 'oberste Ebene' };
    const [kind, id] = attr.split(':') as [string, RemId];
    const rem = app.store.get(id);
    if (!rem) return null;
    const label = app.rems.title(id) || 'Ohne Titel';
    if (kind === 'deck' || rem.deck)
      // Cards go onto the deck; PDFs and documents next to it.
      return { parentId: rem.parentId, deckId: id, label };
    if (rem.isFolder) return { parentId: id, label };
    return { parentId: id, documentId: id, label };
  };
}

/** Hint shown on the overlay for a target. */
function hintFor(target: FileDropTarget): string {
  if (target.deckId)
    return `Karten (.cards.json) kommen auf die Folien von „${target.label}“; PDFs und Dokumente daneben.`;
  if (target.documentId)
    return `Bilder und Dateien werden an „${target.label}“ angehängt; PDFs und Texte werden Unterdokumente.`;
  return target.parentId
    ? `PDFs werden Foliensätze, Texte Dokumente – in „${target.label}“.`
    : 'PDFs werden Foliensätze, Texte Dokumente – auf oberster Ebene.';
}

/**
 * Listens for files dragged over the window, highlights the target under the
 * pointer and imports the files on drop. Rendered once in the layout.
 */
export function FileDropLayer(): ReactNode {
  const navigate = useNavigate();
  const toast = useToast();
  const importFiles = useImportFiles();
  const resolve = useResolveTarget();
  const [active, setActive] = useState<FileDropTarget | null>(null);
  const highlighted = useRef<Element | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest helpers for the window listeners (registered once).
  const api = useRef({ importFiles, resolve, navigate, toast });
  api.current = { importFiles, resolve, navigate, toast };

  useEffect(() => {
    /** Innermost marked element under the event, and its target. */
    const targetAt = (e: DragEvent): { el: Element | null; target: FileDropTarget } => {
      const el = (e.target as Element | null)?.closest?.('[data-file-drop]') ?? null;
      const page = document.querySelector('[data-file-drop-page]');
      const attr =
        el?.getAttribute('data-file-drop') ?? page?.getAttribute('data-file-drop-page') ?? 'root';
      return {
        el: el ?? page,
        target: api.current.resolve(attr) ?? { parentId: null, label: 'oberste Ebene' },
      };
    };
    const highlight = (el: Element | null): void => {
      if (highlighted.current === el) return;
      highlighted.current?.classList.remove('file-drop-over');
      el?.classList.add('file-drop-over');
      highlighted.current = el;
    };
    const clear = (): void => {
      highlight(null);
      setActive(null);
    };
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      // Without this the browser would open the file instead of dropping it.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      const { el, target } = targetAt(e);
      highlight(el);
      setActive((prev) =>
        prev && prev.label === target.label && prev.deckId === target.deckId ? prev : target,
      );
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      // dragleave fires between child elements: wait for the next dragover.
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(clear, 80);
    };
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      const { target } = targetAt(e);
      clear();
      if (files.length === 0) return;
      void api.current.importFiles(files, target).then((res) => {
        const done = summarize(res.counts);
        if (done) api.current.toast(`Importiert: ${done}`);
        for (const f of res.failed.slice(0, 3)) api.current.toast(f, 'error');
        if (files.length === 1 && res.created.length === 1)
          api.current.navigate(`/rem/${res.created[0]}`);
      });
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="file-drop-hint" role="status" data-testid="file-drop-hint">
      <Upload size={18} />
      <span className="col" style={{ gap: 2, minWidth: 0 }}>
        <strong>Ablegen in „{active.label}“</strong>
        <span className="muted">{hintFor(active)}</span>
      </span>
    </div>
  );
}
