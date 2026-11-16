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

/** Start a lecture: name, goal and a short distraction checklist. */
export function StartLectureDialog({ defaultName, onStart, onClose }: { defaultName: string; onStart: (name: string, goal: string) => void; onClose: () => void }): ReactNode {
  const [name, setName] = useState(defaultName);
  const [goal, setGoal] = useState('');
  return (
    <Modal
      title="Vorlesung starten"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={() => onStart(name.trim() || defaultName, goal)}>
            ▶ Starten
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Ziel (optional)" hint="Was willst du aus dieser Vorlesung mitnehmen? Ein Ziel richtet die Aufmerksamkeit aus.">
        <input className="input" value={goal} placeholder="z. B. Backpropagation so verstehen, dass ich sie erklären kann" onChange={(e) => setGoal(e.target.value)} />
      </Field>
      <div className="checklist">
        <strong>Checkliste</strong>
        <label>
          <input type="checkbox" /> Handy weg
        </label>
        <label>
          <input type="checkbox" /> Mitteilungen aus („Nicht stören“)
        </label>
        <label>
          <input type="checkbox" /> Andere Tabs zu
        </label>
      </div>
    </Modal>
  );
}

/** End of a lecture: the three most important points from memory. */
export function SummaryDialog({ initial, onSave, onClose }: { initial: string; onSave: (text: string) => void; onClose: () => void }): ReactNode {
  const [text, setText] = useState(initial || '1. \n2. \n3. ');
  return (
    <Modal
      title="Abschließen: die 3 wichtigsten Punkte"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Später
          </button>
          <button className="btn btn-primary" onClick={() => onSave(text)}>
            Speichern
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Schreib aus dem Gedächtnis auf, was hängen geblieben ist - ohne nachzusehen. Das ist selbst schon Abruf-Übung.
      </p>
      <textarea className="textarea" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}

/** A recall check-in. */
export function CheckinDialog({ checkin, onAnswer }: { checkin: Checkin; onAnswer: (text: string, focus: number | null, skipped: boolean) => void }): ReactNode {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <Modal title="Kurz-Check" onClose={() => onAnswer('', null, true)}>
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
        <span className="muted">Wie fokussiert warst du?</span>
        {[1, 2, 3, 4, 5].map((f) => (
          <button key={f} className={`btn btn-sm${focus === f ? ' btn-primary' : ''}`} onClick={() => setFocus(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => onAnswer('', null, true)}>
          Überspringen
        </button>
        <button className="btn btn-primary" onClick={() => onAnswer(text, focus, false)}>
          Antworten <Kbd>Enter</Kbd>
        </button>
      </div>
    </Modal>
  );
}

/** Grid of all slides to jump to one. */
export function SlideOverview({ deckId, current, onPick, onClose }: { deckId: RemId; current: number; onPick: (i: number) => void; onClose: () => void }): ReactNode {
  const slides = useDeckSlides(deckId);
  return (
    <Modal title="Folienübersicht" onClose={onClose} wide>
      <div className="slide-grid">
        {slides.map((s, i) => (
          <button key={s.id} className={`slide-thumb-btn${i === current ? ' active' : ''}${s.slideFlags?.length ? ' flagged' : ''}`} onClick={() => onPick(i)}>
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
    ['← → / PageUp PageDown', 'Folie zurück / vor (auch Presenter-Clicker)'],
    ['G', 'Folienübersicht'],
    ['W / U', 'Folie als wichtig / unklar markieren'],
    ['F', 'Frage notieren (neue Zeile „? “)'],
    ['A', '„Ich war gerade abgelenkt“'],
    ['B', 'Pause / weiter'],
    ['N / Esc', 'ins Notizfeld / heraus'],
    ['V', 'Fokusmodus (nur Folie und Notizen)'],
    ['P / M / E / T', 'Stift / Marker / Radierer / Textfeld; Esc = Auswählen'],
    ['K', 'Assistent (KI)'],
    ['?', 'Diese Hilfe'],
  ];
  return (
    <Modal title="Tastenkürzel (Vorlesung)" onClose={onClose}>
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
