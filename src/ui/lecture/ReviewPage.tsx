/**
 * "Nacharbeiten": slides worth another look, with the reasons why (Fokus
 * `review.py`). For one lecture (`?lecture=`) or all lectures of the deck.
 */
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { mergeStats, slideStats } from '@core/lecture/analytics';
import { openQuestions } from '@core/lecture/notes';
import { reviewRows, todo } from '@core/lecture/review';
import { walkSubtree } from '@core/model/graph';
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { slideNotesText } from '@data/lecture/context';
import { selectCardIndex, selectLogs } from '@data/selectors';
import { useApp, useNow, useSelector } from '../app/context';
import { SlideView } from './SlideView';
import { selectLectureState, useLectureSettings } from './useLecture';
import { useDeckSlides } from './useSlides';
import { fmtDuration } from '@core/lecture/review';

/** The review page. */
export function ReviewPage(): ReactNode {
  const { deckId = '' } = useParams();
  const [params] = useSearchParams();
  const lectureFilter = params.get('lecture');
  const app = useApp();
  const navigate = useNavigate();
  const now = useNow();
  const cfg = useLectureSettings();
  const slides = useDeckSlides(deckId);
  const deckTitle = useSelector((s) => toPlainText(s.get(deckId)?.text ?? []));
  const rows = useSelector((s) =>
    s.memo(`review:${deckId}:${lectureFilter}`, [s.collectionVersion('rems'), s.collectionVersion('lectureEvents'), s.collectionVersion('annotations'), s.collectionVersion('logs'), Math.floor(now / 60000)], () => {
      const lectures = s.all('lectures').filter((l) => l.deckId === deckId && (!lectureFilter || l.id === lectureFilter));
      const stats = mergeStats(lectures.map((l) => slideStats(selectLectureState(s, l.id), slides.length, now)));
      const base = stats.length ? stats : slides.map((_, slide) => ({ slide, dwellMs: 0, visits: 0, awayMs: 0, drifts: 0, checkins: [] }));
      // Last answer per card (for "cards not known").
      const last = new Map<string, number>();
      for (const log of selectLogs(s)) last.set(log.cardId, log.rating);
      const index = selectCardIndex(s);
      return reviewRows(
        base,
        (i) => {
          const slide = slides[i];
          if (!slide) return { flags: [], openQuestions: [], hasNote: false, forgottenCards: 0 };
          let forgotten = 0;
          walkSubtree(s, slide.id, (r) => void (index.byRem.get(r.id) ?? []).forEach((c) => last.get(c.id) === 1 && !s.getRecord('cards', c.id)?.disabled && forgotten++));
          const ann = s.getRecord('annotations', slide.id);
          const text = slideNotesText(s, slide.id);
          return { flags: slide.slideFlags ?? [], openQuestions: openQuestions(text), hasNote: Boolean(text.trim() || ann?.strokes.length), forgottenCards: forgotten };
        },
        cfg,
      );
    }),
  );
  const list = todo(rows);
  const open = (i: number): void => void navigate(`/lecture/${deckId}?slide=${i + 1}`);
  return (
    <div className="main-scroll">
      <div className="page page-wide">
        <div className="page-header">
          <h1>Nacharbeiten</h1>
          <span className="muted">{deckTitle}{lectureFilter ? ' · eine Vorlesung' : ' · alle Vorlesungen'}</span>
        </div>
        {list.length === 0 && <div className="empty">Nichts nachzuarbeiten. 🎉</div>}
        {list.map((r) => (
          <ReviewItem key={r.slide} deckId={deckId} slideId={slides[r.slide]?.id} index={r.slide} reasons={r.reasons.map((x) => x.label)} priority={r.priority} dwell={fmtDuration(r.stats.dwellMs)} onOpen={() => open(r.slide)} onToggle={(flag) => {
            const slide = slides[r.slide];
            if (slide) app.lectures.setFlag(slide.id, flag, !slide.slideFlags?.includes(flag));
          }} />
        ))}
      </div>
    </div>
  );
}

/** One slide to review. */
function ReviewItem({ deckId, slideId, index, reasons, priority, dwell, onOpen, onToggle }: { deckId: RemId; slideId: RemId | undefined; index: number; reasons: string[]; priority: number; dwell: string; onOpen: () => void; onToggle: (f: 'important' | 'unclear') => void }): ReactNode {
  const slide = useSelector((s) => (slideId ? s.get(slideId) : undefined));
  return (
    <div className="review-item">
      <div className="review-thumb" onClick={onOpen}>
        <SlideView deckId={deckId} slide={slide} width={260} />
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <strong>
          Folie {index + 1} <span className="faint">· Priorität {priority} · {dwell}</span>
        </strong>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {reasons.map((r) => (
            <span key={r} className="badge badge-warning">
              {r}
            </span>
          ))}
        </div>
        <div className="faint ellipsis" style={{ fontSize: 13 }}>
          {slide?.slideText?.split('\n')[0]}
        </div>
        <div className="row">
          <button className="btn btn-sm btn-primary" onClick={onOpen}>
            Öffnen
          </button>
          <button className={`btn btn-sm${slide?.slideFlags?.includes('important') ? ' btn-primary' : ''}`} onClick={() => onToggle('important')}>
            ★ Wichtig
          </button>
          <button className={`btn btn-sm${slide?.slideFlags?.includes('unclear') ? ' btn-primary' : ''}`} onClick={() => onToggle('unclear')}>
            ? Unklar
          </button>
        </div>
      </div>
    </div>
  );
}
