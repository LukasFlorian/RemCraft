/**
 * Import, export, backups and local data management.
 */
import type { ReactNode } from 'react';
import { Download, HardDriveDownload, Trash2, Upload } from 'lucide-react';
import { isoDate } from '@core/util/time';
import { useApp, useSelector } from '../../app/context';
import { useModals } from '../../app/modals';
import { useDialogs } from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import { downloadText, pickFiles } from '../../hooks/useFilePicker';

/** Data settings. */
export function DataSection(): ReactNode {
  const app = useApp();
  const modals = useModals();
  const toast = useToast();
  const dialogs = useDialogs();
  const counts = useSelector(
    (s) => `${s.count('rems')}|${s.count('cards')}|${s.count('logs')}|${s.count('exams')}`,
  ).split('|');
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">Import</h2>
        <p className="muted" style={{ margin: 0 }}>
          RemNote/Markdown, Anki, Quizlet, Notion, Obsidian, Roam/Logseq, Workflowy/Dynalist (OPML),
          CSV, PDFs and RemCraft backups.
        </p>
        <div>
          <button className="btn btn-primary" onClick={() => modals.open({ kind: 'import' })}>
            <Upload size={15} /> Import…
          </button>
        </div>
      </div>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">Export &amp; backup</h2>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() =>
              downloadText(
                `remcraft-backup-${isoDate(Date.now())}.json`,
                JSON.stringify(app.io.exportBackup()),
                'application/json',
              )
            }
          >
            <HardDriveDownload size={15} /> Download full backup (JSON)
          </button>
          <button
            className="btn"
            onClick={() => {
              const roots = app.store.children(null).map((r) => r.id);
              downloadText(
                `remcraft-${isoDate(Date.now())}.md`,
                app.io.exportMarkdown(roots),
                'text/markdown',
              );
            }}
          >
            <Download size={15} /> Export everything as Markdown
          </button>
          <button
            className="btn"
            onClick={async () => {
              const [file] = await pickFiles('.json');
              if (!file) return;
              const replace = await dialogs.confirm({
                title: 'Restore backup',
                message:
                  'Replace all current data with the backup? (Cancel merges instead: newer local records are kept.)',
                confirmLabel: 'Replace everything',
                danger: true,
              });
              try {
                const n = app.io.importBackup(await file.text(), replace ? 'replace' : 'merge');
                toast(`Restored ${n} records`);
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error');
              }
            }}
          >
            <Upload size={15} /> Restore backup…
          </button>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>
          The Markdown export uses RemNote&apos;s text syntax, so you can paste it into RemNote or
          re-import it here.
        </p>
      </div>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">Local data</h2>
        <div className="muted">
          {counts[0]} Rems · {counts[1]} reviewed cards · {counts[2]} reviews · {counts[3]} exams
        </div>
        <div>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: 'Delete all local data?',
                  message:
                    'Everything stored in this browser is removed. Synced data stays in the cloud and comes back after signing in again. Download a backup first if you are not syncing.',
                  confirmLabel: 'Delete everything',
                  danger: true,
                })
              ) {
                await app.resetLocal(true);
                toast('Local data deleted');
              }
            }}
          >
            <Trash2 size={15} /> Delete local data
          </button>
        </div>
      </div>
    </div>
  );
}
