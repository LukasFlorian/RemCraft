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
  FolderInput,
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
import { pickFiles, pickFolder } from '../hooks/useFilePicker';
import { archiveFromFiles } from '@data/services/fokusImport';
import { importCardFile } from '../lecture/DeckPanel';
import { SkillDownloadLink } from '../lecture/SkillDownloadLink';
import { t, tn } from '@core/i18n';

/** An import source. */
interface Source {
  id: string;
  label: string;
  icon: ReactNode;
  accept: string;
  format: TextFormat | 'backup' | 'file' | 'paste' | 'deck' | 'fokus' | 'fokus-data' | 'share';
  help: ReactNode;
  csvDefaults?: { delimiterHint: string };
  /** Not shown in the source grid (opened directly, e.g. from Settings). */
  hidden?: boolean;
}

const SOURCES: Source[] = [
  {
    id: 'fokus-data',
    label: t('Fokus: import everything'),
    icon: <FolderInput size={22} color="#2ec4a6" />,
    accept: '',
    format: 'fokus-data',
    hidden: true,
    help: t(
      'Choose the “data” folder of your Fokus installation (it contains decks, sessions and courses). Imported are courses, slide decks with layout, notes, highlights, drawings, text boxes, marks, imported cards and all lectures with analysis. Importing again creates no duplicates.',
    ),
  },
  {
    id: 'deck',
    label: t('Slide deck (PDF)'),
    icon: <Presentation size={22} color="#5b8cff" />,
    accept: '.pdf,application/pdf',
    format: 'deck',
    help: t(
      'Lecture slides: every slide becomes a Rem for your notes. Handouts with several slides per page are split automatically.',
    ),
  },
  {
    id: 'fokus',
    label: t('Cards with slides (.cards.json)'),
    icon: <FileJson size={22} color="#f2a33a" />,
    accept: '.json',
    format: 'fokus',
    help: (
      <>
        {t(
          'Flashcards mapped to slides: every card lands on its slide via PDF page and a verbatim quote; the matching slide deck is recognised by the PDF name. Claude creates such files with the',
        )}{' '}
        <SkillDownloadLink>{t('RemCraft skill (download)')}</SkillDownloadLink>{' '}
        {t('from your slides.')}
      </>
    ),
  },
  {
    id: 'share',
    label: t('Share (.remcraft.json)'),
    icon: <FileJson size={22} color="#3fb37f" />,
    accept: '.json',
    format: 'share',
    help: t(
      "A folder, notes or cards someone shared as a file: inserted as your own copy (with new IDs, without the other person's learning progress).",
    ),
  },
  {
    id: 'remnote',
    label: t('RemNote'),
    icon: <Star size={22} color="#6f7eff" />,
    accept: '.md,.txt',
    format: 'markdown',
    help: t(
      'In RemNote: ⋯ menu of a document → Export → Markdown. Card syntax (>>, ::, {{cloze}}, >>A)) is preserved.',
    ),
  },
  {
    id: 'anki',
    label: t('Anki'),
    icon: <Layers size={22} color="#5aa0ff" />,
    accept: '.txt,.tsv,.csv',
    format: 'csv',
    help: t(
      'In Anki: File → Export → "Notes in Plain Text (.txt)". Front/back become basic cards; {{c1::cloze}} notes become cloze cards.',
    ),
  },
  {
    id: 'notion',
    label: t('Notion'),
    icon: <NotebookPen size={22} />,
    accept: '.md',
    format: 'markdown',
    help: t('In Notion: ⋯ → Export → Markdown & CSV. Select the .md files (unzip first).'),
  },
  {
    id: 'quizlet',
    label: t('Quizlet'),
    icon: <Sparkle size={22} color="#4255ff" />,
    accept: '.txt,.tsv,.csv',
    format: 'csv',
    help: t(
      'In Quizlet: ⋯ → Export, separate term/definition with Tab and rows with new lines; save as .txt.',
    ),
  },
  {
    id: 'opml',
    label: t('Workflowy / Dynalist'),
    icon: <ListTree size={22} color="#4fb3d9" />,
    accept: '.opml,.xml',
    format: 'opml',
    help: t('Export your outline as OPML.'),
  },
  {
    id: 'obsidian',
    label: t('Obsidian'),
    icon: <FileText size={22} color="#a368ff" />,
    accept: '.md',
    format: 'markdown',
    help: t(
      'Select one or more notes (.md). Headings structure the document; [[links]] become references.',
    ),
  },
  {
    id: 'roam',
    label: t('Roam / Logseq'),
    icon: <ListTree size={22} />,
    accept: '.md',
    format: 'markdown',
    help: t('Export pages as Markdown.'),
  },
  {
    id: 'markdown',
    label: t('Markdown files'),
    icon: <FileText size={22} />,
    accept: '.md,.markdown,.txt',
    format: 'markdown',
    help: t('Any Markdown or indented text. Lines containing == or >> become flashcards.'),
  },
  {
    id: 'csv',
    label: t('CSV / Excel'),
    icon: <FileSpreadsheet size={22} color="#3fbf7f" />,
    accept: '.csv,.tsv,.txt',
    format: 'csv',
    help: t('Excel: File → Save as → CSV. Choose which columns hold front and back.'),
  },
  {
    id: 'file',
    label: t('PDF or File'),
    icon: <FileUp size={22} />,
    accept: '*/*',
    format: 'file',
    help: t('The file is stored in a new document (PDFs can be viewed inline).'),
  },
  {
    id: 'backup',
    label: t('RemCraft backup'),
    icon: <Database size={22} />,
    accept: '.json',
    format: 'backup',
    help: t('Restore a full backup (Settings → Import & Export). Newer local records are kept.'),
  },
  {
    id: 'paste',
    label: t('Paste text'),
    icon: <ClipboardPaste size={22} />,
    accept: '',
    format: 'paste',
    help: t('Paste notes in RemNote/Markdown syntax.'),
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
        .map((r) => ({ id: r.id, title: app.rems.title(r.id) || t('Untitled') })),
    ),
  );
}

/** The import dialog. */
export function ImportDialog({
  onClose,
  parentId = null,
  initialSource,
}: {
  onClose: () => void;
  parentId?: RemId | null;
  /** Id of a source to open directly. */
  initialSource?: string;
}): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const folders = useFolders();
  const [source, setSource] = useState<Source | null>(
    SOURCES.find((s) => s.id === initialSource) ?? null,
  );
  const [target, setTarget] = useState<RemId | ''>(parentId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [paste, setPaste] = useState('');
  const [title, setTitle] = useState(t('Imported notes'));
  const [csv, setCsv] = useState({
    hasHeader: false,
    frontColumn: 0,
    backColumn: 1,
    bothDirections: false,
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  /** Runs the import. */
  const run = async (): Promise<void> => {
    if (!source) return;
    setBusy(true);
    try {
      const parent = target || null;
      if (source.format === 'backup') {
        const n = app.io.importBackup(await files[0]!.text(), 'merge');
        toast(t('Restored {n} records', { n }));
        onClose();
        return;
      }
      if (source.format === 'fokus-data') {
        const s = await app.fokusImport.run(archiveFromFiles(files), (msg, done, total) =>
          setProgress(`${msg} (${done}/${total})`),
        );
        const parts = [
          `${s.courses} Kurse`,
          `${s.decks} Foliensätze`,
          `${s.lectures} Vorlesungen`,
          `${s.slidesWithNotes} Folien mit Notizen`,
          `${s.cards} Karten`,
          `${s.files} Dateien`,
        ];
        toast(
          t('Fokus imported: {0}{1}', {
            '0': parts.join(', '),
            '1': s.skipped ? ` (${s.skipped} schon vorhanden)` : '',
          }),
        );
        for (const w of s.warnings.slice(0, 3)) toast(w, 'error');
        navigate('/lectures');
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
        for (const f of files)
          root = await app.sharing.clone(await app.sharing.readFile(f), parent);
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
          title || t('Imported notes'),
          paste,
          'markdown',
          parent,
        );
        toast(t('Imported {count} Rems', { count }));
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
      toast(
        tn(
          'Imported {total} Rems from {n} file',
          'Imported {total} Rems from {n} files',
          files.length,
          { total },
        ),
      );
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
      <Modal title={t('Import to RemCraft')} onClose={onClose} wide>
        <div className="import-grid">
          {SOURCES.filter((s) => !s.hidden).map((s) => (
            <button key={s.id} className="import-source" onClick={() => setSource(s)}>
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="import-tip">
          <div>
            <strong>{t('Not finding your app? No worries!')}</strong>
            <ol>
              <li>{t('Select the text you want to import in your other app.')}</li>
              <li>{t('Copy it with ⌘C.')}</li>
              <li>{t('Paste it into any document with ⌘V.')}</li>
            </ol>
          </div>
          <div>
            <strong>{t('💡 Import tip')}</strong>
            <p>
              {t('Lines containing')} <span className="kbd">==</span> {t('or')}{' '}
              <span className="kbd">&gt;&gt;</span> {t('become flashcards, e.g.')}{' '}
              <span className="mono">
                {t('What is the mitochondria? == The powerhouse of the cell.')}
              </span>{' '}
              {t('See the flashcard syntax guide in the docs.')}
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  const ready = source.format === 'paste' ? paste.trim() !== '' : files.length > 0;
  return (
    <Modal
      title={t('Import from {label}', { label: source.label })}
      onClose={onClose}
      headerExtra={
        <button className="btn btn-sm btn-ghost" onClick={() => setSource(null)}>
          <ArrowLeft size={14} /> {t('Sources')}
        </button>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()}>
            {busy ? t('Importing…') : t('Import')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {source.help}
      </p>
      {source.format === 'paste' ? (
        <>
          <Field label={t('Document title')}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('Text')}>
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
        <Field group label={t('Files')}>
          <div className="row">
            {source.format === 'fokus-data' ? (
              <button
                className="btn"
                onClick={() => {
                  setProgress(t('Reading folder …'));
                  void pickFolder().then((f) => {
                    setProgress('');
                    if (f.length) setFiles(f);
                  });
                }}
              >
                <FolderInput size={15} /> {t('Choose the “data” folder')}
              </button>
            ) : (
              <button
                className="btn"
                onClick={() =>
                  void pickFiles(source.accept, source.format !== 'backup').then(
                    (f) => f.length && setFiles(f),
                  )
                }
              >
                <FileUp size={15} />{' '}
                {source.format !== 'backup' ? t('Choose files') : t('Choose file')}
              </button>
            )}
            <span className="muted ellipsis">
              {progress
                ? progress
                : files.length
                  ? source.format === 'fokus-data'
                    ? t('{length} files', { length: files.length })
                    : files.map((f) => f.name).join(', ')
                  : t('No file selected')}
            </span>
          </div>
        </Field>
      )}
      {source.format === 'csv' && (
        <div className="grid-2">
          <Field label={t('Front column')}>
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
          <Field label={t('Back column')}>
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
            label={t('First row is a header')}
          />
          <Switch
            checked={csv.bothDirections}
            onChange={(v) => setCsv({ ...csv, bothDirections: v })}
            label={t('Practice both directions')}
          />
        </div>
      )}
      {source.format !== 'backup' && source.format !== 'fokus-data' && (
        <Field label={t('Import into')}>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('Top level')}</option>
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
