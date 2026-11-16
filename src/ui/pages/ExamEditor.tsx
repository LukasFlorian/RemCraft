/**
 * Create or edit an exam: name, date, scope (documents/folders) and the
 * exam scheduler options.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import type { Exam, NewCardMode, RemId } from '@core/model/types';
import { DAY } from '@core/util/time';
import { useApp, useChildren } from '../app/context';
import { Field, Switch } from '../components/Controls';
import { Modal } from '../components/Modal';
import { useRemTitle } from '../hooks/useRemTitle';

/** Formats a timestamp for `<input type="datetime-local">`. */
function toLocalInput(t: number): string {
  const d = new Date(t);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The exam editor dialog. */
export function ExamEditor({ examId, scope: initialScope, onClose }: { examId?: string | undefined; scope?: RemId[] | undefined; onClose: () => void }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const existing = examId ? app.store.getRecord('exams', examId) : undefined;
  const [name, setName] = useState(existing?.name ?? (initialScope?.[0] ? `${app.rems.title(initialScope[0])} exam` : 'Exam'));
  const [date, setDate] = useState(toLocalInput(existing?.date ?? new Date(new Date().setHours(9, 0, 0, 0) + 14 * DAY).getTime()));
  const [scope, setScope] = useState<RemId[]>(existing?.scope ?? initialScope ?? []);
  const [newCardMode, setNewCardMode] = useState<NewCardMode>(existing?.newCardMode ?? 'spread');
  const [finalReview, setFinalReview] = useState(existing?.finalReview ?? true);
  const [finalReviewDays, setFinalReviewDays] = useState(existing?.finalReviewDays ?? 2);
  const [extraPractice, setExtraPractice] = useState(existing?.extraPractice ?? true);

  const toggle = (id: RemId): void => setScope((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = (): void => {
    const data: Partial<Exam> = { name: name.trim() || 'Exam', date: new Date(date).getTime(), scope, newCardMode, finalReview, finalReviewDays, extraPractice };
    if (existing) app.exams.update(existing.id, data);
    else {
      const exam = app.exams.create(data);
      navigate(`/flashcards/exams/${exam.id}`);
    }
    onClose();
  };

  return (
    <Modal
      title={existing ? 'Edit exam' : 'New exam'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={scope.length === 0 || !date} onClick={save}>
            {existing ? 'Save' : 'Create exam'}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Exam date and time">
          <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field group label="Material" hint="Choose the folders and documents the exam covers. Their cards get the Exam priority.">
        <div className="scope-tree">
          <ScopeLevel parentId={null} depth={0} scope={scope} toggle={toggle} />
        </div>
      </Field>
      <Field group label="Cards you have never practiced">
        <div className="segmented">
          <button className={newCardMode === 'spread' ? 'active' : ''} onClick={() => setNewCardMode('spread')}>
            Spread them out until the exam (recommended)
          </button>
          <button className={newCardMode === 'due-now' ? 'active' : ''} onClick={() => setNewCardMode('due-now')}>
            Make them all due now
          </button>
        </div>
      </Field>
      <div className="grid-2">
        <div className="col">
          <Switch checked={finalReview} onChange={setFinalReview} label="Final review before the exam" />
          {finalReview && (
            <Field label="Final review length (days)">
              <input className="input" type="number" min={1} max={14} value={finalReviewDays} onChange={(e) => setFinalReviewDays(Math.max(1, Math.min(14, Number(e.target.value))))} />
            </Field>
          )}
        </div>
        <Switch checked={extraPractice} onChange={setExtraPractice} label="Extra practice: missed cards need two correct answers in a row" />
      </div>
    </Modal>
  );
}

/** One level of the scope tree (documents and folders only). */
function ScopeLevel({ parentId, depth, scope, toggle }: { parentId: RemId | null; depth: number; scope: RemId[]; toggle: (id: RemId) => void }): ReactNode {
  const children = useChildren(parentId).filter((c) => (c.isDocument || c.isFolder) && !c.dailyDate);
  return (
    <>
      {children.map((c) => (
        <ScopeItem key={c.id} remId={c.id} isFolder={Boolean(c.isFolder)} depth={depth} scope={scope} toggle={toggle} />
      ))}
    </>
  );
}

function ScopeItem({ remId, isFolder, depth, scope, toggle }: { remId: RemId; isFolder: boolean; depth: number; scope: RemId[]; toggle: (id: RemId) => void }): ReactNode {
  const title = useRemTitle(remId);
  const [open, setOpen] = useState(false);
  const hasKids = useChildren(remId).some((c) => c.isDocument || c.isFolder);
  return (
    <>
      <label className="scope-item" style={{ paddingLeft: depth * 18 }}>
        {hasKids ? (
          <button type="button" className={`tree-toggle${open ? ' open' : ''}`} onClick={(e) => (e.preventDefault(), setOpen(!open))} aria-label="Expand">
            <ChevronRight size={13} />
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <input type="checkbox" checked={scope.includes(remId)} onChange={() => toggle(remId)} />
        {isFolder ? <Folder size={15} className="icon-folder" /> : <FileText size={15} className="icon-doc" />}
        <span className="ellipsis">{title}</span>
      </label>
      {open && <ScopeLevel parentId={remId} depth={depth + 1} scope={scope} toggle={toggle} />}
    </>
  );
}
