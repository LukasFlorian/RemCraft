/**
 * Renders the globally opened modal (see `app/modals.tsx`).
 */
import type { ReactNode } from 'react';
import { useModals } from '../app/modals';
import { IconPicker } from '../components/IconPicker';
import { AudioRecorder } from './AudioRecorder';
import { ExamEditor } from './ExamEditor';
import { ImportDialog } from './ImportDialog';
import { MoveDialog } from './MoveDialog';
import { OcclusionEditor } from './OcclusionEditor';
import { AiEditDialog } from './AiEditDialog';
import { ReplaceDialog } from './ReplaceDialog';
import { SearchDialog } from './SearchDialog';

/** The active global modal. */
export function GlobalModals(): ReactNode {
  const { modal, close } = useModals();
  if (!modal) return null;
  switch (modal.kind) {
    case 'search':
      return <SearchDialog onClose={close} />;
    case 'ai-edit':
      return <AiEditDialog rootId={modal.rootId} onClose={close} />;
    case 'replace':
      return <ReplaceDialog rootId={modal.rootId} initialQuery={modal.query} onClose={close} />;
    case 'import':
      return (
        <ImportDialog
          onClose={close}
          parentId={modal.parentId ?? null}
          initialSource={modal.source}
        />
      );
    case 'occlusion':
      return <OcclusionEditor remId={modal.remId} onClose={close} />;
    case 'recorder':
      return <AudioRecorder remId={modal.remId} onClose={close} />;
    case 'move':
      return <MoveDialog remIds={modal.remIds} onClose={close} />;
    case 'icon':
      return <IconPicker remId={modal.remId} onClose={close} />;
    case 'exam':
      return <ExamEditor examId={modal.examId} scope={modal.scope} onClose={close} />;
  }
}
