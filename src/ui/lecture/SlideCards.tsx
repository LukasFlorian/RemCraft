/**
 * Cards widget: explanations and flashcards of the current slide (or of the
 * whole deck), quizzed right next to the slide. Answers are real
 * spaced-repetition reviews, so the lecture and the flashcard queue share one
 * learning state - the loop "slides → notes → cards" is closed.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Ban, Check, RotateCcw, X } from 'lucide-react';
import { walkSubtree } from '@core/model/graph';
import type { Rating, RemId } from '@core/model/types';
import { shuffle } from '@core/scheduling/queue';
import { selectCardIndex, selectCardView, selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../app/context';
import { RemContent } from '../editor/RemBlock';
import { CardFace } from '../pages/practice/CardFace';

/** Card ids and explanation Rems below some roots. */
function useSlideCards(rootIds: RemId[]): { cards: string[]; explanations: RemId[] } {
  return useSelector((s) =>
    s.memo(
      `slideCards:${rootIds.join(',')}`,
      [s.collectionVersion('rems'), s.collectionVersion('cards')],
      () => {
        const index = selectCardIndex(s);
        const cards: string[] = [];
        const explanations: RemId[] = [];
        for (const root of rootIds) {
          walkSubtree(s, root, (r) => {
            if (r.fokus?.explanation) {
              explanations.push(r.id);
              return false;
            }
            for (const c of index.byRem.get(r.id) ?? [])
              if (!s.getRecord('cards', c.id)?.disabled) cards.push(c.id);
          });
        }
        return { cards, explanations };
      },
    ),
  );
}

/** A static explanation (title + its children). */
function Explanation({ remId }: { remId: RemId }): ReactNode {
  const rem = useSelector((s) => s.get(remId));
  const kids = useSelector((s) => s.children(remId));
  if (!rem) return null;
  return (
    <div className="explanation">
      <strong>
        <RemContent rem={rem} />
      </strong>
      {kids.map((k) => (
        <div key={k.id} className="explanation-line">
          <RemContent rem={k} />
        </div>
      ))}
    </div>
  );
}

/** The cards widget. */
export function SlideCards({
  slideId,
  deckSlideIds,
}: {
  slideId: RemId | undefined;
  deckSlideIds: RemId[];
}): ReactNode {
  const app = useApp();
  const [all, setAll] = useState(false);
  const roots = all ? deckSlideIds : slideId ? [slideId] : [];
  const { cards, explanations } = useSlideCards(roots);
  const order = useMemo(() => shuffle(cards), [cards.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pos, setPos] = useState(0);
  const grading = useSelector((s) => selectSettings(s).typeInAnswerGrading);
  const cardId = order[pos % Math.max(1, order.length)];
  // Revealed state belongs to one card: another card (other slide, next card) starts hidden.
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const revealed = cardId !== undefined && revealedId === cardId;
  const setRevealed = (on: boolean): void => setRevealedId(on && cardId ? cardId : null);
  const view = useSelector((s) =>
    cardId
      ? s.memo(`view:${cardId}`, [s.collectionVersion('rems')], () => selectCardView(s, cardId))
      : undefined,
  );

  const answer = (rating: Rating): void => {
    if (!cardId) return;
    app.practice.answer(cardId, rating, { now: Date.now(), durationMs: 0, mode: 'srs' });
    setRevealed(false);
    setPos((p) => p + 1);
  };

  return (
    <div className="slide-cards">
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="segmented" style={{ flex: 1 }}>
          <button className={!all ? 'active' : ''} onClick={() => (setAll(false), setPos(0))}>
            Diese Folie
          </button>
          <button className={all ? 'active' : ''} onClick={() => (setAll(true), setPos(0))}>
            Alle Folien
          </button>
        </div>
      </div>
      {!all && explanations.map((id) => <Explanation key={id} remId={id} />)}
      {order.length === 0 ? (
        <div className="faint" style={{ fontSize: 13 }}>
          Keine Karten {all ? 'in diesem Foliensatz' : 'zu dieser Folie'}. Schreib in den Notizen z.
          B. „Begriff &gt;&gt; Erklärung“ oder importiere eine *.fokus.json.
        </div>
      ) : view ? (
        <div className="mini-card">
          <div className="faint" style={{ fontSize: 12 }}>
            Karte {(pos % order.length) + 1} / {order.length}
          </div>
          <CardFace
            key={cardId}
            view={view}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onSuggest={() => undefined}
            grading={grading}
          />
          <div className="row" style={{ marginTop: 8 }}>
            {!revealed ? (
              <button className="btn btn-primary" onClick={() => setRevealed(true)}>
                Aufdecken
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => answer(3)}>
                  <Check size={14} /> gewusst
                </button>
                <button className="btn" onClick={() => answer(1)}>
                  <X size={14} /> nicht gewusst
                </button>
              </>
            )}
            <span className="spacer" />
            <button
              className="icon-btn"
              title="Überspringen"
              onClick={() => (setRevealed(false), setPos((p) => p + 1))}
            >
              <RotateCcw size={14} />
            </button>
            <button
              className="icon-btn"
              title="Karte deaktivieren"
              onClick={() =>
                cardId && (app.practice.setDisabled([cardId], true), setRevealed(false))
              }
            >
              <Ban size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
