/**
 * Renders the question and (after revealing) the answer of any card type.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CardView } from '@core/cards/content';
import { gradeTypedAnswer } from '@core/cards/typein';
import type { TypeInResult } from '@core/cards/typein';
import type { Rating, RemId } from '@core/model/types';
import { shuffle } from '@core/scheduling/queue';
import { selectSettings } from '@data/selectors';
import { useSelector } from '../../app/context';
import { ImageView } from '../../editor/blocks';
import { RemContent } from '../../editor/RemBlock';
import { useRemTitle } from '../../hooks/useRemTitle';
import { SlideView } from '../../lecture/SlideView';
import { useNavigate } from 'react-router';
import { RichTextView } from '../../richtext/RichTextView';

/** Props of {@link CardFace}. */
export interface CardFaceProps {
  view: CardView;
  revealed: boolean;
  onReveal: () => void;
  /** Suggests a rating (MC choice, typed answer, items marked as not known). */
  onSuggest: (rating: Rating) => void;
  grading: 'exact' | 'lenient';
  /**
   * Registers what the main "Show answer" button does for this card (check
   * the MC selection, grade the typed answer); without it, it just reveals.
   */
  registerReveal?: (reveal: (() => void) | null) => void;
}

/** Suggested rating from the share of answer items that were known. */
export function ratingFromItems(total: number, missed: number): Rating {
  if (total === 0 || missed === 0) return 3;
  const known = (total - missed) / total;
  return known >= 0.5 ? 2 : 1;
}

/** A Rem rendered read-only (answer items, options). */
function RemInline({ remId }: { remId: RemId }): ReactNode {
  const rem = useSelector((s) => s.get(remId));
  return rem ? <RemContent rem={rem} /> : null;
}

/** Breadcrumb context of a card. */
function Context({ ids }: { ids: RemId[] }): ReactNode {
  if (ids.length === 0) return null;
  return (
    <div className="card-context">
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ' › '}
          <ContextTitle id={id} />
        </span>
      ))}
    </div>
  );
}

function ContextTitle({ id }: { id: RemId }): ReactNode {
  return <>{useRemTitle(id)}</>;
}

/**
 * The slide a card was written on (closing the loop slides → notes → cards):
 * a link to the slide, with a thumbnail once the answer is revealed.
 */
function SlideOrigin({ ids, revealed }: { ids: RemId[]; revealed: boolean }): ReactNode {
  const navigate = useNavigate();
  const slide = useSelector((s) =>
    [...ids]
      .reverse()
      .map((id) => s.get(id))
      .find((r) => r?.slide),
  );
  if (!slide?.parentId || !slide.slide) return null;
  const n = slide.slide.index + 1;
  return (
    <div className="slide-origin">
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => navigate(`/lecture/${slide.parentId}?slide=${n}`)}
      >
        📄 Folie {n}
      </button>
      {revealed && (
        <div className="slide-origin-thumb">
          <SlideView deckId={slide.parentId} slide={slide} width={360} />
        </div>
      )}
    </div>
  );
}

/** The card face. */
export function CardFace({
  view,
  revealed,
  onReveal,
  onSuggest,
  grading,
  registerReveal,
}: CardFaceProps): ReactNode {
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<TypeInResult | null>(null);
  const [chosen, setChosen] = useState<RemId[]>([]);
  const [listShown, setListShown] = useState(0);
  /** Answer items (set/list cards) marked as not known after revealing. */
  const [missed, setMissed] = useState<RemId[]>([]);
  const options = useMemo(() => (view.type === 'mc' ? shuffle(view.options) : []), [view]);
  const showAnswerKind = useSelector((s) => Boolean(selectSettings(s).mcShowAnswerKind));

  useEffect(() => {
    setTyped('');
    setResult(null);
    setChosen([]);
    setListShown(0);
    setMissed([]);
  }, [view.cardId]);

  // Set/list cards: everything counts as known until items are marked.
  const itemCard = (view.type === 'set' || view.type === 'list') && !view.reversed;
  useEffect(() => {
    if (revealed && itemCard) onSuggest(ratingFromItems(view.items.length, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, itemCard, view.cardId]);
  const toggleMissed = (id: RemId): void => {
    const next = missed.includes(id) ? missed.filter((x) => x !== id) : [...missed, id];
    setMissed(next);
    onSuggest(
      ratingFromItems(
        view.type === 'set' || view.type === 'list' ? view.items.length : 0,
        next.length,
      ),
    );
  };

  const typeIn = view.typeIn && view.type !== 'mc' && view.expectedAnswer.trim() !== '';
  const submitTyped = (): void => {
    const r = gradeTypedAnswer(view.expectedAnswer, typed, grading);
    setResult(r);
    onSuggest(r.suggestedRating);
    onReveal();
  };

  const correctIds = useMemo(() => options.filter((o) => o.correct).map((o) => o.remId), [options]);
  /** Grades the MC selection (nothing selected: just reveal) and reveals. */
  const checkChoice = (ids: RemId[]): void => {
    if (ids.length > 0) {
      const right = ids.length === correctIds.length && ids.every((id) => correctIds.includes(id));
      onSuggest(right ? 3 : 1);
    }
    onReveal();
  };
  // The main button checks an MC selection or a typed answer instead of
  // having a second "Check answer" button.
  useEffect(() => {
    if (!registerReveal) return;
    registerReveal(
      revealed
        ? null
        : view.type === 'mc'
          ? () => checkChoice(chosen)
          : typeIn && typed.trim()
            ? submitTyped
            : null,
    );
    return () => registerReveal(null);
  });

  const origin = <SlideOrigin ids={view.context} revealed={revealed} />;
  const extra =
    (revealed && view.extra.length > 0 && (
      <div className="card-extra">
        {view.extra.map((id) => (
          <RemInline key={id} remId={id} />
        ))}
      </div>
    )) ||
    null;
  const extraAndOrigin = (
    <>
      {extra}
      {origin}
    </>
  );

  const typeBox = typeIn && (
    <form
      className="type-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (!revealed) submitTyped();
      }}
    >
      <input
        className="input"
        autoFocus
        placeholder="Type your answer and press Enter"
        value={typed}
        disabled={revealed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {result && (
        <div className={`type-result ${result.correct ? 'ok' : 'bad'}`}>
          {result.correct ? '✓ Correct' : '✗ Not quite'} · {Math.round(result.similarity * 100)} %
          match
        </div>
      )}
    </form>
  );

  switch (view.type) {
    case 'basic':
      return (
        <div className={`card-face kind-${view.kind}`}>
          <Context ids={view.context} />
          <div className="card-question">
            <RichTextView value={view.question} />
            {view.reversed && <span className="faint card-dir">←</span>}
          </div>
          {typeBox}
          {revealed && (
            <div className="card-answer">
              <RichTextView value={view.answer} />
            </div>
          )}
          {extraAndOrigin}
        </div>
      );
    case 'cloze':
      return (
        <div className="card-face">
          <Context ids={view.context} />
          <div className="card-question">
            <RichTextView
              value={view.text}
              cloze={
                revealed
                  ? { kind: 'reveal', clozeId: view.clozeId }
                  : {
                      kind: 'hide',
                      clozeId: view.clozeId,
                      ...(view.hint ? { hint: view.hint } : {}),
                    }
              }
            />
          </div>
          {typeBox}
          {revealed && view.back && view.back.length > 0 && (
            <div className="card-answer">
              <RichTextView value={view.back} />
            </div>
          )}
          {extraAndOrigin}
        </div>
      );
    case 'set':
    case 'list': {
      const isList = view.type === 'list';
      if (view.reversed) {
        return (
          <div className="card-face">
            <Context ids={view.context} />
            <ul className="card-items">
              {view.items.map((id) => (
                <li key={id}>
                  <RemInline remId={id} />
                </li>
              ))}
            </ul>
            <div className="faint">What is this?</div>
            {typeBox}
            {revealed && (
              <div className="card-answer">
                <RichTextView value={view.question} />
              </div>
            )}
            {extraAndOrigin}
          </div>
        );
      }
      const shown = revealed ? view.items.length : isList ? listShown : 0;
      return (
        <div className="card-face">
          <Context ids={view.context} />
          <div className="card-question">
            <RichTextView value={view.question} />
          </div>
          {typeBox}
          <ol className={`card-items${isList ? '' : ' is-set'}${revealed ? ' is-gradable' : ''}`}>
            {view.items.map((id, i) =>
              revealed ? (
                <li key={id} className={missed.includes(id) ? 'is-missed' : 'is-known'}>
                  <button
                    className="item-grade"
                    aria-pressed={missed.includes(id)}
                    title={missed.includes(id) ? 'Doch gewusst' : 'Nicht gewusst'}
                    onClick={() => toggleMissed(id)}
                  >
                    <span className="item-mark" aria-hidden>
                      {missed.includes(id) ? '✗' : '✓'}
                    </span>
                    <RemInline remId={id} />
                  </button>
                </li>
              ) : (
                <li key={id} className={i < shown ? '' : 'is-hidden'}>
                  {i < shown ? <RemInline remId={id} /> : <span className="faint">?</span>}
                </li>
              ),
            )}
          </ol>
          {revealed && (
            <div className="faint item-hint">
              Tippe an, was du nicht wusstest ({view.items.length - missed.length}/
              {view.items.length} gewusst) – die Bewertung wird vorgeschlagen.
            </div>
          )}
          {isList && !revealed && (
            <button
              className="btn btn-sm"
              onClick={() => {
                if (listShown + 1 >= view.items.length) onReveal();
                setListShown((n) => n + 1);
              }}
            >
              Reveal next item ({listShown}/{view.items.length})
            </button>
          )}
          {extraAndOrigin}
        </div>
      );
    }
    case 'mc': {
      // Single choice (radio, answered on click) only when the user wants to see
      // that there is exactly one correct answer; otherwise checkboxes, checked
      // with the main "Show answer" button.
      const single = showAnswerKind && correctIds.length === 1;
      const check = checkChoice;
      return (
        <div className="card-face">
          <Context ids={view.context} />
          <div className="card-question">
            <RichTextView value={view.question} />
          </div>
          {!revealed && (
            <div className="faint" style={{ fontSize: 13 }}>
              {!showAnswerKind
                ? 'Select all correct answers.'
                : single
                  ? 'One correct answer.'
                  : 'Several correct answers - select all.'}
            </div>
          )}
          <div className="mc-options" role={single ? 'radiogroup' : 'group'}>
            {options.map((o, i) => {
              const picked = chosen.includes(o.remId);
              const state = revealed
                ? o.correct
                  ? 'is-correct'
                  : picked
                    ? 'is-wrong'
                    : ''
                : picked
                  ? 'is-picked'
                  : '';
              return (
                <button
                  key={o.remId}
                  role={single ? 'radio' : 'checkbox'}
                  aria-checked={picked}
                  className={`mc-option ${state}`}
                  disabled={revealed}
                  onClick={() => {
                    if (single) {
                      setChosen([o.remId]);
                      check([o.remId]);
                    } else
                      setChosen((c) =>
                        c.includes(o.remId) ? c.filter((x) => x !== o.remId) : [...c, o.remId],
                      );
                  }}
                >
                  <span
                    className={`mc-mark ${single ? 'radio' : 'check'}${picked ? ' on' : ''}`}
                    aria-hidden
                  />
                  <span className="mc-letter">{String.fromCharCode(65 + i)}</span>
                  <RemInline remId={o.remId} />
                </button>
              );
            })}
          </div>
          {extraAndOrigin}
        </div>
      );
    }
    case 'occlusion': {
      const hideAll = Boolean(view.image.hideAllOcclusions);
      return (
        <div className="card-face">
          <Context ids={view.context} />
          {view.question.length > 0 && (
            <div className="card-question">
              <RichTextView value={view.question} />
            </div>
          )}
          <ImageView
            src={view.image.src}
            width={view.image.width}
            occlusions={view.image.occlusions}
            hidden={(o) => (revealed ? false : o.id === view.occlusionId || hideAll)}
            revealed={revealed ? view.occlusionId : undefined}
          />
          {typeBox}
          {extraAndOrigin}
        </div>
      );
    }
  }
}
