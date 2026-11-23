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
import { t } from '@core/i18n';

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
        <h2 className="card-title">{t('Import')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t(
            'RemNote/Markdown, Anki, Quizlet, Notion, Obsidian, Roam/Logseq, Workflowy/Dynalist (OPML), CSV, PDFs and RemCraft backups.',
          )}
        </p>
        <div>
          <button className="btn btn-primary" onClick={() => modals.open({ kind: 'import' })}>
            <Upload size={15} /> {t('Import…')}
          </button>{' '}
          <button
            className="btn"
            onClick={() => modals.open({ kind: 'import', source: 'fokus-data' })}
            title={t(
              'Import courses, slide decks, notes and lectures from the data folder of the predecessor app Fokus',
            )}
          >
            {t('Import Fokus data folder…')}
          </button>
        </div>
      </div>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">{t('Export & backup')}</h2>
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
            <HardDriveDownload size={15} /> {t('Download full backup (JSON)')}
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
            <Download size={15} /> {t('Export everything as Markdown')}
          </button>
          <button
            className="btn"
            onClick={async () => {
              const [file] = await pickFiles('.json');
              if (!file) return;
              const replace = await dialogs.confirm({
                title: t('Restore backup'),
                message: t(
                  'Replace all current data with the backup? (Cancel merges instead: newer local records are kept.)',
                ),
                confirmLabel: t('Replace everything'),
                danger: true,
              });
              try {
                const n = app.io.importBackup(await file.text(), replace ? 'replace' : 'merge');
                toast(t('Restored {n} records', { n }));
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), 'error');
              }
            }}
          >
            <Upload size={15} /> {t('Restore backup…')}
          </button>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>
          {t(
            "The Markdown export uses RemNote's text syntax, so you can paste it into RemNote or re-import it here.",
          )}
        </p>
      </div>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">{t('Local data')}</h2>
        <div className="muted">
          {counts[0]} {t('Rems ·')} {counts[1]} {t('reviewed cards ·')} {counts[2]} {t('reviews ·')}{' '}
          {counts[3]} {t('exams')}
        </div>
        <div>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: t('Delete all local data?'),
                  message: t(
                    'Everything stored in this browser is removed. Synced data stays in the cloud and comes back after signing in again. Download a backup first if you are not syncing.',
                  ),
                  confirmLabel: t('Delete everything'),
                  danger: true,
                })
              ) {
                await app.resetLocal(true);
                toast(t('Local data deleted'));
              }
            }}
          >
            <Trash2 size={15} /> {t('Delete local data')}
          </button>
        </div>
      </div>
    </div>
  );
}
