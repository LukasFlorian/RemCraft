/**
 * Dialogs of lecture mode: start, summary, check-in, slide overview, help.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Checkin } from '@core/lecture/session';
import type { RemId } from '@core/model/types';
import { Field, Kbd } from '../components/Controls';
import { Modal } from '../components/Modal';
import { SlideView } from './SlideView';
import { useDeckSlides } from './useSlides';
import { t } from '@core/i18n';

/** Start a lecture: name, goal and a short distraction checklist. */
export function StartLectureDialog({
  defaultName,
  onStart,
  onClose,
}: {
  defaultName: string;
  onStart: (name: string, goal: string) => void;
  onClose: () => void;
}): ReactNode {
  const [name, setName] = useState(defaultName);
  const [goal, setGoal] = useState('');
  return (
    <Modal
      title={t('Start lecture')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onStart(name.trim() || defaultName, goal)}
          >
            {t('▶ Start')}
          </button>
        </>
      }
    >
      <Field label={t('Name')}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label={t('Goal (optional)')}
        hint={t('What do you want to take away from this lecture? A goal focuses your attention.')}
      >
        <input
          className="input"
          value={goal}
          placeholder={t('e.g. understand backpropagation well enough to explain it')}
          onChange={(e) => setGoal(e.target.value)}
        />
      </Field>
      <div className="checklist">
        <strong>{t('Checklist')}</strong>
        <label>
          <input type="checkbox" /> {t('Phone away')}
        </label>
        <label>
          <input type="checkbox" /> {t('Notifications off (“Do not disturb”)')}
        </label>
        <label>
          <input type="checkbox" /> {t('Other tabs closed')}
        </label>
      </div>
    </Modal>
  );
}

/** End of a lecture: the three most important points from memory. */
export function SummaryDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}): ReactNode {
  const [text, setText] = useState(initial || '1. \n2. \n3. ');
  return (
    <Modal
      title={t('Wrap up: the 3 most important points')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Later')}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(text)}>
            {t('Save')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {t(
          'Write down from memory what stuck – without looking. That alone is retrieval practice.',
        )}
      </p>
      <textarea
        className="textarea"
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}

/** A recall check-in. */
export function CheckinDialog({
  checkin,
  onAnswer,
}: {
  checkin: Checkin;
  onAnswer: (text: string, focus: number | null, skipped: boolean) => void;
}): ReactNode {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <Modal title={t('Quick check')} onClose={() => onAnswer('', null, true)}>
      <p style={{ margin: 0, fontSize: 17 }}>{checkin.prompt}</p>
      <textarea
        className="textarea"
        rows={4}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAnswer(text, focus, false);
          }
        }}
      />
      <div className="row">
        <span className="muted">{t('How focused were you?')}</span>
        {[1, 2, 3, 4, 5].map((f) => (
          <button
            key={f}
            className={`btn btn-sm${focus === f ? ' btn-primary' : ''}`}
            onClick={() => setFocus(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => onAnswer('', null, true)}>
          {t('Skip')}
        </button>
        <button className="btn btn-primary" onClick={() => onAnswer(text, focus, false)}>
          {t('Answer')} <Kbd>{t('Enter')}</Kbd>
        </button>
      </div>
    </Modal>
  );
}

/** Grid of all slides to jump to one. */
export function SlideOverview({
  deckId,
  current,
  onPick,
  onClose,
}: {
  deckId: RemId;
  current: number;
  onPick: (i: number) => void;
  onClose: () => void;
}): ReactNode {
  const slides = useDeckSlides(deckId);
  return (
    <Modal title={t('Slide overview')} onClose={onClose} wide>
      <div className="slide-grid">
        {slides.map((s, i) => (
          <button
            key={s.id}
            className={`slide-thumb-btn${i === current ? ' active' : ''}${s.slideFlags?.length ? ' flagged' : ''}`}
            onClick={() => onPick(i)}
          >
            <SlideView deckId={deckId} slide={s} width={240} />
            <span>
              {i + 1}
              {s.slideFlags?.includes('important') && ' ★'}
              {s.slideFlags?.includes('unclear') && ' ?'}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Keyboard help. */
export function LectureHelp({ onClose }: { onClose: () => void }): ReactNode {
  const rows: [string, string][] = [
    ['← → / PageUp PageDown', t('Previous / next slide (also presenter clicker)')],
    ['G', t('Slide overview')],
    ['W / U', t('Mark slide as important / unclear')],
    ['F', t('Note a question (new line “? ”)')],
    ['A', t('“I was just distracted”')],
    ['B', 'Pause / weiter'],
    ['N / Esc', t('into the notes field / out')],
    ['V', t('Focus mode (only slide and notes)')],
    ['P / M / E / T', t('Pen / marker / eraser / text box; Esc = select')],
    ['K', 'Assistent (KI)'],
    ['?', t('This help')],
  ];
  return (
    <Modal title={t('Keyboard shortcuts (lecture)')} onClose={onClose}>
      <table className="table compact">
        <tbody>
          {rows.map(([k, d]) => (
            <tr key={k}>
              <td style={{ width: 200 }}>
                <Kbd>{k}</Kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
