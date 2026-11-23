/**
 * The "⋯" menu of documents and folders (shared by the document page,
 * the documents list and the flashcard home).
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Palette,
  Replace,
  Sparkles,
  ArrowRightLeft,
  Clock3,
  Copy,
  Download,
  FileText,
  Folder,
  GraduationCap,
  Pin,
  PinOff,
  Play,
  Shuffle,
  Trash2,
  Wrench,
  ListOrdered,
  Zap,
} from 'lucide-react';
import type { Priority, RemId } from '@core/model/types';
import { selectSchedulers } from '@data/selectors';
import { useApp } from '../app/context';
import { useModals } from '../app/modals';
import { useDialogs } from '../components/Confirm';
import type { MenuEntry } from '../components/Menu';
import { useToast } from '../components/Toast';
import { PRIORITY_META, PriorityIcon } from '../components/PriorityIcon';
import { downloadText } from '../hooks/useFilePicker';
import { t } from '@core/i18n';

/** Labels of the priorities (RemNote wording). */
export const PRIORITY_LABELS: Record<Priority, string> = {
  active: t('Currently Studying'),
  maintaining: t('Maintaining'),
  none: 'No Priority',
  paused: t('Paused'),
};

/** Builds menu entries for a document/folder. */
export function useRemMenu(): (remId: RemId, options?: { includeOpen?: boolean }) => MenuEntry[] {
  const app = useApp();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const toast = useToast();
  const modals = useModals();

  return (remId, options = {}) => {
    const rem = app.store.get(remId);
    if (!rem) return [];
    const title = app.rems.title(remId) || t('Untitled');
    const entries: MenuEntry[] = [];
    if (options.includeOpen)
      entries.push({
        label: t('Open'),
        icon: <FileText size={15} />,
        onSelect: () => navigate(`/rem/${remId}`),
      });
    entries.push(
      { heading: t('Practice') },
      {
        label: t('Practice with spaced repetition'),
        icon: <Play size={15} />,
        onSelect: () => navigate(`/practice?scope=${remId}&mode=srs`),
      },
      {
        label: t('Practice all flashcards'),
        icon: <Shuffle size={15} />,
        onSelect: () => navigate(`/practice?scope=${remId}&mode=all`),
      },
      {
        label: t('Practice all in order'),
        icon: <ListOrdered size={15} />,
        onSelect: () => navigate(`/practice?scope=${remId}&mode=all-in-order`),
      },
      {
        label: t('Cram (does not affect scheduling)'),
        icon: <Zap size={15} />,
        onSelect: () => navigate(`/practice?scope=${remId}&mode=cram`),
      },
      {
        label: t('Create exam for this…'),
        icon: <GraduationCap size={15} />,
        onSelect: () => modals.open({ kind: 'exam', scope: [remId] }),
      },
      { heading: t('Priority') },
      ...(Object.keys(PRIORITY_LABELS) as Priority[]).map((p): MenuEntry => ({
        label: `${(rem.priority ?? 'none') === p ? '✓ ' : ''}${PRIORITY_LABELS[p]}`,
        icon: <PriorityIcon priority={p} />,
        onSelect: () => app.rems.update(remId, { priority: p === 'none' ? undefined : p }),
      })),
      { heading: t('Scheduler') },
      ...selectSchedulers(app.store).map((s): MenuEntry => ({
        label: `${rem.schedulerId === s.id ? '✓ ' : ''}${s.name}`,
        icon: <Wrench size={15} />,
        onSelect: () =>
          app.rems.update(remId, { schedulerId: rem.schedulerId === s.id ? undefined : s.id }),
      })),
      { separator: true },
      {
        label: rem.pinned ? t('Unpin from sidebar') : t('Pin to sidebar'),
        icon: rem.pinned ? <PinOff size={15} /> : <Pin size={15} />,
        onSelect: () => app.rems.update(remId, { pinned: rem.pinned ? undefined : true }),
      },
      {
        label: rem.editLater ? t('Remove from Edit Later') : t('Edit later'),
        icon: <Clock3 size={15} />,
        onSelect: () => app.rems.update(remId, { editLater: rem.editLater ? undefined : true }),
      },
      ...(rem.isFolder || rem.isDocument
        ? [
            {
              label: t('Icon and colour…'),
              icon: <Palette size={15} />,
              onSelect: () => modals.open({ kind: 'icon', remId }),
            },
            {
              label: t('Revise with AI…'),
              icon: <Sparkles size={15} />,
              onSelect: () => modals.open({ kind: 'ai-edit', rootId: remId }),
            },
            {
              label: t('Find & replace… (⌘⇧H)'),
              icon: <Replace size={15} />,
              onSelect: () => modals.open({ kind: 'replace', rootId: remId }),
            },
          ]
        : []),
      {
        label: t('Move to…'),
        icon: <ArrowRightLeft size={15} />,
        onSelect: () => modals.open({ kind: 'move', remIds: [remId] }),
      },
      {
        label: rem.isFolder ? t('Convert to document') : t('Convert to folder'),
        icon: rem.isFolder ? <FileText size={15} /> : <Folder size={15} />,
        onSelect: () =>
          app.rems.update(remId, {
            isFolder: rem.isFolder ? undefined : true,
            isDocument: true,
          } as never),
      },
      {
        label: t('Duplicate'),
        icon: <Copy size={15} />,
        onSelect: () => {
          const copy = app.rems.duplicate(remId);
          if (copy) navigate(`/rem/${copy}`);
        },
      },
      {
        label: t('Export as Markdown'),
        icon: <Download size={15} />,
        onSelect: () =>
          downloadText(
            `${title.replace(/[\\/:*?"<>|]+/g, '_')}.md`,
            app.io.exportMarkdown([remId], false),
            'text/markdown',
          ),
      },
      { separator: true },
      {
        label: t('Delete'),
        icon: <Trash2 size={15} />,
        danger: true,
        onSelect: async () => {
          const ok = await dialogs.confirm({
            title: t('Delete “{title}”?', { title }),
            message: t('The Rem and everything inside it will be deleted. You can undo with ⌘Z.'),
            confirmLabel: t('Delete'),
            danger: true,
          });
          if (!ok) return;
          const parent = rem.parentId;
          app.rems.delete([remId]);
          toast(t('Deleted'));
          navigate(parent ? `/rem/${parent}` : '/');
        },
      },
    );
    return entries;
  };
}

/** Badge for a priority. */
export function PriorityBadge({ priority }: { priority: Priority | 'exam' }): ReactNode {
  if (priority === 'none') return null;
  const m = PRIORITY_META[priority];
  return (
    <span
      className="badge priority-badge"
      style={{ color: m.color, borderColor: m.color }}
      title={m.hint}
    >
      <PriorityIcon priority={priority} size={12} /> {m.label}
    </span>
  );
}
