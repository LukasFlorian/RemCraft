/**
 * The practice queue: shows cards one by one, records ratings and supports
 * skip, undo and editing the card in place.
 *
 * URL parameters: `scope` = `global` | `<remId>` | `exam:<examId>`,
 * `mode` = `srs` | `all` | `all-in-order` | `cram`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Pencil, SkipForward, Undo2, X } from 'lucide-react';
import type { PracticeMode, Rating } from '@core/model/types';
import type { DocumentPracticeMode, QueuedCard } from '@core/scheduling/queue';
import { RATING_LABELS, RATINGS } from '@core/scheduling/scheduler';
import { PracticeSession } from '@core/scheduling/session';
import { formatInterval } from '@core/util/time';
import { selectCardView, selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Kbd } from '../../components/Controls';
import { Modal } from '../../components/Modal';
import { ProgressBar } from '../../components/Controls';
import { Outliner } from '../../editor/Outliner';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useRemTitle } from '../../hooks/useRemTitle';
import { CardFace } from './CardFace';

const MODE_LABELS: Record<string, string> = {
  srs: 'Spaced repetition',
  all: 'Practice all',
  'all-in-order': 'All in order',
  cram: 'Cram (not scheduled)',
  global: 'Daily queue',
  exam: 'Exam',
};

/** The practice page. */
export function PracticePage(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scopeParam = params.get('scope') ?? 'global';
  const modeParam = (params.get('mode') ?? 'srs') as DocumentPracticeMode;
  const settings = useSelector(selectSettings);

  // Build the queue once per session.
  const initial = useMemo<QueuedCard[]>(() => {
    const now = Date.now();
    if (scopeParam === 'global') return app.practice.buildQueue({ kind: 'global' }, now);
    if (scopeParam.startsWith('exam:')) {
      const examId = scopeParam.slice(5);
      return app.practice.buildQueue({ kind: 'global' }, now).filter((q) => q.examId === examId);
    }
    return app.practice.buildQueue({ kind: 'rem', remId: scopeParam, mode: modeParam }, now);
  }, [app, scopeParam, modeParam]);
  const session = useMemo(() => new PracticeSession(initial.map((q) => q.cardId)), [initial]);

  const mode: PracticeMode = scopeParam === 'global' || scopeParam.startsWith('exam:') ? 'srs' : modeParam;
  const [tick, setTick] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [suggested, setSuggested] = useState<Rating | null>(null);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0, startedAt: Date.now() });
  const shownAt = useRef(Date.now());
  const logIds = useRef<(string | null)[]>([]);

  const cardId = session.current(Date.now());
  // Re-render when the card's Rem changes (e.g. edited during practice).
  const view = useSelector((s) => (cardId ? s.memo(`view:${cardId}`, [s.collectionVersion('rems')], () => selectCardView(s, cardId)) : undefined));
  const previews = useMemo(() => (cardId && revealed ? app.practice.previews(cardId, Date.now()) : undefined), [app, cardId, revealed, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = session.progress();
  void tick;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [cardId, tick]);

  /** Moves on to the next card (state is reset synchronously to avoid key races). */
  const advance = (): void => {
    setRevealed(false);
    setSuggested(null);
    setTick((t) => t + 1);
  };

  // A card that no longer exists (deleted while practicing) is dropped.
  useEffect(() => {
    if (cardId && !view) {
      session.drop(cardId);
      setTick((t) => t + 1);
    }
  }, [cardId, view, session]);

  const answer = (rating: Rating): void => {
    if (!cardId || !revealed) return;
    const now = Date.now();
    const result = app.practice.answer(cardId, rating, { now, durationMs: now - shownAt.current, mode });
    if (!result) return;
    logIds.current.push(result.log?.id ?? null);
    // In cram mode, forgotten cards come back; everything else is done.
    const nextDue = mode === 'cram' ? (rating === 1 ? now + 60_000 : null) : result.state.due;
    session.answer(cardId, nextDue, now);
    setStats((s) => ({ ...s, answered: s.answered + 1, correct: s.correct + (rating > 1 ? 1 : 0) }));
    advance();
  };

  const undo = (): void => {
    const logId = logIds.current.pop();
    if (logId === undefined) return;
    if (logId) app.practice.undoAnswer(logId);
    session.undo();
    setStats((s) => ({ ...s, answered: Math.max(0, s.answered - 1) }));
    advance();
  };

  const skip = (): void => {
    if (!cardId) return;
    session.skip(cardId);
    advance();
  };

  useHotkeys(
    {
      ' ': (e) => {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else answer(suggested ?? 3);
      },
      enter: (e) => {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else answer(suggested ?? 3);
      },
      '1': () => answer(1),
      '2': () => answer(2),
      '3': () => answer(3),
      '4': () => answer(4),
      s: () => skip(),
      u: () => undo(),
      'mod+z': (e) => {
        e.preventDefault();
        undo();
      },
      e: () => cardId && setEditing(true),
      escape: () => (editing ? setEditing(false) : navigate(-1)),
    },
    { enabled: !editing },
  );

  const title = useRemTitle(scopeParam !== 'global' && !scopeParam.startsWith('exam:') ? scopeParam : null, '');
  const examName = useSelector((s) => (scopeParam.startsWith('exam:') ? s.getRecord('exams', scopeParam.slice(5))?.name : undefined));

  return (
    <div className="practice">
      <div className="practice-top">
        <button className="icon-btn" aria-label="Exit practice" onClick={() => navigate(-1)}>
          <X size={20} />
        </button>
        <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 600 }}>
            {examName ?? (title || 'Daily queue')}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {MODE_LABELS[scopeParam === 'global' ? 'global' : scopeParam.startsWith('exam:') ? 'exam' : modeParam]} · {progress.done} / {progress.total}
          </div>
        </div>
        <button className="icon-btn" aria-label="Undo last answer" title="Undo (U)" disabled={logIds.current.length === 0} onClick={undo}>
          <Undo2 size={18} />
        </button>
        <button className="icon-btn" aria-label="Edit card" title="Edit (E)" disabled={!cardId} onClick={() => setEditing(true)}>
          <Pencil size={18} />
        </button>
      </div>
      <ProgressBar value={progress.total ? progress.done / progress.total : 1} />

      <div className="practice-body">
        {!cardId || !view ? (
          <Finished answered={stats.answered} correct={stats.correct} startedAt={stats.startedAt} onDone={() => navigate('/flashcards')} />
        ) : (
          <>
            <CardFace view={view} revealed={revealed} onReveal={() => setRevealed(true)} onSuggest={setSuggested} grading={settings.typeInAnswerGrading} />
            <div className="practice-actions">
              {!revealed ? (
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={skip} title="Skip (S)">
                    <SkipForward size={16} /> Skip
                  </button>
                  <button className="btn btn-primary btn-lg show-answer" onClick={() => setRevealed(true)}>
                    Show answer <Kbd>Space</Kbd>
                  </button>
                </div>
              ) : (
                <div className="rating-bar">
                  {RATINGS.map((r) => (
                    <button key={r} className={`rating rating-${r}${suggested === r ? ' is-suggested' : ''}`} onClick={() => answer(r)}>
                      <span className="rating-label">{RATING_LABELS[r]}</span>
                      <span className="rating-interval">{previews ? formatInterval(previews[r]) : ''}</span>
                      <Kbd>{r}</Kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {editing && cardId && view && (
        <Modal title="Edit card" onClose={() => setEditing(false)} wide>
          <EditCard remId={view.remId} />
        </Modal>
      )}
    </div>
  );
}

/** Outliner around the card's Rem for quick edits. */
function EditCard({ remId }: { remId: string }): ReactNode {
  const parentId = useSelector((s) => s.get(remId)?.parentId ?? null);
  if (!parentId) return <div className="muted">This card is a top-level Rem; open it from the sidebar to edit.</div>;
  return <Outliner rootId={parentId} embedded />;
}

/** Session summary. */
function Finished({ answered, correct, startedAt, onDone }: { answered: number; correct: number; startedAt: number; onDone: () => void }): ReactNode {
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  return (
    <div className="practice-done">
      <div style={{ fontSize: 48 }}>🎉</div>
      <h2>{answered === 0 ? 'Nothing to practice right now' : 'Session complete'}</h2>
      {answered > 0 && (
        <p className="muted">
          {answered} cards · {Math.round((correct / answered) * 100)} % recalled · {minutes} min
        </p>
      )}
      <button className="btn btn-primary btn-lg" onClick={onDone}>
        Back to Flashcards
      </button>
    </div>
  );
}
