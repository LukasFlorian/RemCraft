/**
 * Moves Rems into another document or folder.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { FileText, Folder } from 'lucide-react';
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { fold } from '@core/search/search';
import { useApp, useSelector } from '../app/context';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

/** The move dialog. */
export function MoveDialog({ remIds, onClose }: { remIds: RemId[]; onClose: () => void }): ReactNode {
  const app = useApp();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const targets = useSelector((s) => s.memo('moveTargets', [s.collectionVersion('rems')], () => s.all('rems').filter((r) => r.isDocument || r.isFolder)));
  const q = fold(query);
  const list = targets.filter((t) => !remIds.includes(t.id) && fold(toPlainText(t.text)).includes(q)).slice(0, 50);
  const move = (parentId: RemId | null): void => {
    if (app.rems.move(remIds, { parentId })) {
      toast('Moved');
      onClose();
    } else toast('Cannot move a Rem into itself', 'error');
  };
  return (
    <Modal title="Move to…" onClose={onClose}>
      <input className="input" autoFocus placeholder="Search documents and folders" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="search-results">
        <button className="menu-item" onClick={() => move(null)}>
          <Folder size={16} /> Top level
        </button>
        {list.map((t) => (
          <button key={t.id} className="menu-item" onClick={() => move(t.id)}>
            {t.isFolder ? <Folder size={16} className="icon-folder" /> : <FileText size={16} className="icon-doc" />}
            <span className="ellipsis">{app.rems.title(t.id) || 'Untitled'}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
