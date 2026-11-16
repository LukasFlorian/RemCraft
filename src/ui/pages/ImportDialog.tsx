/**
 * "Import to RemCraft": RemNote/Markdown, Anki, Quizlet, Notion, Obsidian,
 * Roam/Logseq, Workflowy/Dynalist (OPML), CSV, backups, PDFs and pasted text.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  ClipboardPaste,
  Database,
  FileJson,
  Presentation,
  FileSpreadsheet,
  FileText,
  FileUp,
  Layers,
  ListTree,
  NotebookPen,
  Sparkle,
  Star,
} from 'lucide-react';
import type { RemId } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import type { TextFormat } from '@data/services/io';
import { useApp, useSelector } from '../app/context';
import { Field, Switch } from '../components/Controls';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { pickFiles } from '../hooks/useFilePicker';
import { importCardFile } from '../lecture/DeckPanel';

/** An import source. */
interface Source {
  id: string;
  label: string;
  icon: ReactNode;
  accept: string;
  format: TextFormat | 'backup' | 'file' | 'paste' | 'deck' | 'fokus' | 'share';
  help: string;
  csvDefaults?: { delimiterHint: string };
}

const SOURCES: Source[] = [
  {
    id: 'deck',
    label: 'Foliensatz (PDF)',
    icon: <Presentation size={22} color="#5b8cff" />,
    accept: '.pdf,application/pdf',
    format: 'deck',
    help: 'Vorlesungsfolien: jede Folie wird ein Rem für deine Notizen. Handouts mit mehreren Folien pro Seite werden automatisch aufgeteilt.',
  },
  {
    id: 'fokus',
    label: 'Fokus-Karten (.fokus.json)',
    icon: <FileJson size={22} color="#f2a33a" />,
    accept: '.json',
    format: 'fokus',
    help: 'Karten aus dem Skill fokus-flashcards: jede Karte wird über PDF-Seite und Zitat ihrer Folie zugeordnet. Der passende Foliensatz wird anhand des PDF-Namens gefunden.',
  },
  {
    id: 'share',
    label: 'Freigabe (.remcraft.json)',
    icon: <FileJson size={22} color="#3fb37f" />,
    accept: '.json',
    format: 'share',
    help: 'Von jemandem als Datei geteilte Mappe, Notizen oder Karten: wird als eigene Kopie (mit neuen IDs, ohne fremden Lernfortschritt) eingefügt.',
  },
  {
    id: 'remnote',
    label: 'RemNote',
    icon: <Star size={22} color="#6f7eff" />,
    accept: '.md,.txt',
    format: 'markdown',
    help: 'In RemNote: ⋯ menu of a document → Export → Markdown. Card syntax (>>, ::, {{cloze}}, >>A)) is preserved.',
  },
  {
    id: 'anki',
    label: 'Anki',
    icon: <Layers size={22} color="#5aa0ff" />,
    accept: '.txt,.tsv,.csv',
    format: 'csv',
    help: 'In Anki: File → Export → "Notes in Plain Text (.txt)". Front/back become basic cards; {{c1::cloze}} notes become cloze cards.',
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: <NotebookPen size={22} />,
    accept: '.md',
    format: 'markdown',
    help: 'In Notion: ⋯ → Export → Markdown & CSV. Select the .md files (unzip first).',
  },
  {
    id: 'quizlet',
    label: 'Quizlet',
    icon: <Sparkle size={22} color="#4255ff" />,
    accept: '.txt,.tsv,.csv',
    format: 'csv',
    help: 'In Quizlet: ⋯ → Export, separate term/definition with Tab and rows with new lines; save as .txt.',
  },
  {
    id: 'opml',
    label: 'Workflowy / Dynalist',
    icon: <ListTree size={22} color="#4fb3d9" />,
    accept: '.opml,.xml',
    format: 'opml',
    help: 'Export your outline as OPML.',
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    icon: <FileText size={22} color="#a368ff" />,
    accept: '.md',
    format: 'markdown',
    help: 'Select one or more notes (.md). Headings structure the document; [[links]] become references.',
  },
  {
    id: 'roam',
    label: 'Roam / Logseq',
    icon: <ListTree size={22} />,
    accept: '.md',
    format: 'markdown',
    help: 'Export pages as Markdown.',
  },
  {
    id: 'markdown',
    label: 'Markdown files',
    icon: <FileText size={22} />,
    accept: '.md,.markdown,.txt',
    format: 'markdown',
    help: 'Any Markdown or indented text. Lines containing == or >> become flashcards.',
  },
  {
    id: 'csv',
    label: 'CSV / Excel',
    icon: <FileSpreadsheet size={22} color="#3fbf7f" />,
    accept: '.csv,.tsv,.txt',
    format: 'csv',
    help: 'Excel: File → Save as → CSV. Choose which columns hold front and back.',
  },
  {
    id: 'file',
    label: 'PDF or File',
    icon: <FileUp size={22} />,
    accept: '*/*',
    format: 'file',
    help: 'The file is stored in a new document (PDFs can be viewed inline).',
  },
  {
    id: 'backup',
    label: 'RemCraft backup',
    icon: <Database size={22} />,
    accept: '.json',
    format: 'backup',
    help: 'Restore a full backup (Settings → Import & Export). Newer local records are kept.',
  },
  {
    id: 'paste',
    label: 'Paste text',
    icon: <ClipboardPaste size={22} />,
    accept: '',
    format: 'paste',
    help: 'Paste notes in RemNote/Markdown syntax.',
  },
];

/** Folder picker options (all folders). */
function useFolders(): { id: RemId; title: string }[] {
  const app = useApp();
  return useSelector((s) =>
    s.memo('folders', [s.collectionVersion('rems')], () =>
      s
        .all('rems')
        .filter((r) => r.isFolder)
        .map((r) => ({ id: r.id, title: app.rems.title(r.id) || 'Untitled' })),
    ),
  );
}

/** The import dialog. */
export function ImportDialog({
  onClose,
  parentId = null,
}: {
  onClose: () => void;
  parentId?: RemId | null;
}): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const folders = useFolders();
  const [source, setSource] = useState<Source | null>(null);
  const [target, setTarget] = useState<RemId | ''>(parentId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [paste, setPaste] = useState('');
  const [title, setTitle] = useState('Imported notes');
  const [csv, setCsv] = useState({
    hasHeader: false,
    frontColumn: 0,
    backColumn: 1,
    bothDirections: false,
  });
  const [busy, setBusy] = useState(false);

  /** Runs the import. */
  const run = async (): Promise<void> => {
    if (!source) return;
    setBusy(true);
    try {
      const parent = target || null;
      if (source.format === 'backup') {
        const n = app.io.importBackup(await files[0]!.text(), 'merge');
        toast(`Restored ${n} records`);
        onClose();
        return;
      }
      if (source.format === 'deck') {
        let last: RemId | null = null;
        for (const f of files) last = await app.lectures.importPdf(f, parent);
        if (last) navigate(`/rem/${last}`);
        onClose();
        return;
      }
      if (source.format === 'share') {
        let root: RemId | undefined;
        for (const f of files) root = await app.sharing.clone(await app.sharing.readFile(f), parent);
        if (root) navigate(`/rem/${root}`);
        onClose();
        return;
      }
      if (source.format === 'fokus') {
        let target: RemId | undefined;
        for (const f of files) target = await importCardFile(app, f, undefined, toast);
        if (target) navigate(`/rem/${target}`);
        onClose();
        return;
      }
      if (source.format === 'file') {
        let last: RemId | null = null;
        for (const f of files) {
          const src = await app.files.save(f, f.name);
          const doc = app.rems.create(
            { parentId: parent },
            {
              text: rt(f.name.replace(/\.[^.]+$/, '')),
              isDocument: true,
              file: { src, name: f.name, mimeType: f.type, size: f.size },
            },
          );
          last = doc.id;
        }
        if (last) navigate(`/rem/${last}`);
        onClose();
        return;
      }
      if (source.format === 'paste') {
        const { docId, count } = app.io.importAsDocument(
          title || 'Imported notes',
          paste,
          'markdown',
          parent,
        );
        toast(`Imported ${count} Rems`);
        navigate(`/rem/${docId}`);
        onClose();
        return;
      }
      let last: RemId | null = null;
      let total = 0;
      for (const f of files) {
        const name = f.name.replace(/\.[^.]+$/, '');
        const { docId, count } = app.io.importAsDocument(
          name,
          await f.text(),
          source.format,
          parent,
          csv,
        );
        last = docId;
        total += count;
      }
      toast(`Imported ${total} Rems from ${files.length} file${files.length > 1 ? 's' : ''}`);
      if (last) navigate(`/rem/${last}`);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!source) {
    return (
      <Modal title="Import to RemCraft" onClose={onClose} wide>
        <div className="import-grid">
          {SOURCES.map((s) => (
            <button key={s.id} className="import-source" onClick={() => setSource(s)}>
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="import-tip">
          <div>
            <strong>Not finding your app? No worries!</strong>
            <ol>
              <li>Select the text you want to import in your other app.</li>
              <li>Copy it with ⌘C.</li>
              <li>Paste it into any document with ⌘V.</li>
            </ol>
          </div>
          <div>
            <strong>💡 Import tip</strong>
            <p>
              Lines containing <span className="kbd">==</span> or{' '}
              <span className="kbd">&gt;&gt;</span> become flashcards, e.g.{' '}
              <span className="mono">What is the mitochondria? == The powerhouse of the cell.</span>{' '}
              See the flashcard syntax guide in the docs.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  const ready = source.format === 'paste' ? paste.trim() !== '' : files.length > 0;
  return (
    <Modal
      title={`Import from ${source.label}`}
      onClose={onClose}
      headerExtra={
        <button className="btn btn-sm btn-ghost" onClick={() => setSource(null)}>
          <ArrowLeft size={14} /> Sources
        </button>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {source.help}
      </p>
      {source.format === 'paste' ? (
        <>
          <Field label="Document title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Text">
            <textarea
              className="textarea mono"
              rows={10}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'- Question >> Answer\n- Term :: Definition\n    - attribute ;; value'}
            />
          </Field>
        </>
      ) : (
        <Field group label="Files">
          <div className="row">
            <button
              className="btn"
              onClick={() =>
                void pickFiles(source.accept, source.format !== 'backup').then(
                  (f) => f.length && setFiles(f),
                )
              }
            >
              <FileUp size={15} /> Choose file{source.format !== 'backup' ? 's' : ''}
            </button>
            <span className="muted ellipsis">
              {files.length ? files.map((f) => f.name).join(', ') : 'No file selected'}
            </span>
          </div>
        </Field>
      )}
      {source.format === 'csv' && (
        <div className="grid-2">
          <Field label="Front column">
            <input
              className="input"
              type="number"
              min={1}
              value={csv.frontColumn + 1}
              onChange={(e) =>
                setCsv({ ...csv, frontColumn: Math.max(0, Number(e.target.value) - 1) })
              }
            />
          </Field>
          <Field label="Back column">
            <input
              className="input"
              type="number"
              min={1}
              value={csv.backColumn + 1}
              onChange={(e) =>
                setCsv({ ...csv, backColumn: Math.max(0, Number(e.target.value) - 1) })
              }
            />
          </Field>
          <Switch
            checked={csv.hasHeader}
            onChange={(v) => setCsv({ ...csv, hasHeader: v })}
            label="First row is a header"
          />
          <Switch
            checked={csv.bothDirections}
            onChange={(v) => setCsv({ ...csv, bothDirections: v })}
            label="Practice both directions"
          />
        </div>
      )}
      {source.format !== 'backup' && (
        <Field label="Import into">
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Top level</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}
