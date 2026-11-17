/**
 * Printable handout (Fokus handout PDF): cover with goal, summary, KPIs and
 * the review list, then one block per slide with the slide (incl. drawings,
 * text boxes, highlights) and the notes, questions and check-ins next to it.
 * "Drucken / als PDF speichern" uses the browser's print dialog, so every
 * character and formula renders exactly as on screen.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Rem, RemId } from '@core/model/types';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Printer } from 'lucide-react';
import { lectureKpis, mergeStats, slideStats } from '@core/lecture/analytics';
import { openQuestions } from '@core/lecture/notes';
import { fmtDuration } from '@core/lecture/review';
import { toPlainText } from '@core/richtext/ops';
import { slideNotesText } from '@data/lecture/context';
import { useNow, useSelector } from '../app/context';
import { RemContent } from '../editor/RemBlock';
import { annotatedSlideImage } from './handoutImage';
import { useSlideImage } from './useSlides';
import { clock, selectLectureState, useLectureSettings } from './useLecture';
import { useDeckSlides } from './useSlides';

/** The handout. */
export function HandoutPage(): ReactNode {
  const { deckId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const now = useNow();
  const cfg = useLectureSettings();
  const slides = useDeckSlides(deckId);
  const title = useSelector((s) => toPlainText(s.get(deckId)?.text ?? []));
  const data = useSelector((s) =>
    s.memo(
      `handout:${deckId}:${params.get('lecture')}`,
      [s.collectionVersion('lectures'), s.collectionVersion('lectureEvents'), slides.length],
      () => {
        const lectures = s
          .all('lectures')
          .filter(
            (l) =>
              l.deckId === deckId && (!params.get('lecture') || l.id === params.get('lecture')),
          );
        const states = lectures.map((l) => ({ l, st: selectLectureState(s, l.id) }));
        return {
          states,
          stats: mergeStats(states.map(({ st }) => slideStats(st, slides.length, now))),
        };
      },
    ),
  );
  // Slides render asynchronously; printing waits until every image is ready.
  const [ready, setReady] = useState<ReadonlySet<RemId>>(new Set());
  const markReady = (id: RemId): void => setReady((r) => (r.has(id) ? r : new Set(r).add(id)));
  const allReady = slides.every((s) => ready.has(s.id));
  const questions = useSelector((s) =>
    s.memo(
      `handoutQ:${deckId}`,
      [s.collectionVersion('rems'), s.collectionVersion('annotations')],
      () =>
        slides.flatMap((sl) =>
          openQuestions(slideNotesText(s, sl.id)).map(
            (q) => `Folie ${(sl.slide?.index ?? 0) + 1}: ${q}`,
          ),
        ),
    ),
  );
  return (
    <div className="main-scroll handout">
      <div className="page page-wide">
        <div className="row no-print" style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            ← Zurück
          </button>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 13 }}>
            {allReady
              ? 'Tipp: im Druckdialog „Kopf- und Fußzeilen“ ausschalten.'
              : `Folien werden vorbereitet … ${ready.size}/${slides.length}`}
          </span>
          <button className="btn btn-primary" disabled={!allReady} onClick={() => window.print()}>
            <Printer size={15} /> Drucken / als PDF speichern
          </button>
        </div>
        <section className="handout-cover">
          <h1>{title}</h1>
          {data.states.map(({ l, st }) => {
            const k = lectureKpis(st, cfg, slides.length, now);
            return (
              <div key={l.id} className="handout-lecture">
                <h3>{l.name}</h3>
                {st.goal && (
                  <p>
                    <strong>Ziel:</strong> {st.goal}
                  </p>
                )}
                {st.summary && (
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    <strong>Zusammenfassung:</strong> {st.summary}
                  </p>
                )}
                <p className="muted">
                  Dauer {clock(k.durationMs)} ·{' '}
                  {k.focusRatio === null ? '' : `${Math.round(k.focusRatio * 100)} % in der App · `}
                  {k.drifts}× abgeschweift · {k.checkinsAnswered} Check-ins
                </p>
              </div>
            );
          })}
          {questions.length > 0 && (
            <>
              <h3>Offene Fragen</h3>
              <ul>
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        {slides.map((s, i) => {
          const st = data.stats[i];
          return (
            <section key={s.id} className="handout-slide">
              <div className="handout-left">
                <HandoutSlideImage deckId={deckId} slide={s} onReady={markReady} />
              </div>
              <div className="handout-right">
                <div className="handout-meta">
                  <strong>Folie {i + 1}</strong>
                  {s.slideFlags?.includes('important') && ' ★ wichtig'}
                  {s.slideFlags?.includes('unclear') && ' ? unklar'}
                  {st && st.dwellMs > 0 && (
                    <span className="muted">
                      {' '}
                      · {fmtDuration(st.dwellMs)}
                      {st.awayMs ? `, ${fmtDuration(st.awayMs)} außerhalb` : ''}
                    </span>
                  )}
                </div>
                <StaticNotes parentId={s.id} />
                {st?.checkins.map((c, k) => (
                  <div key={k} className="checkin-row">
                    <em>{c.prompt}</em> {c.text}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One slide as a plain image with its drawings, highlights and text boxes
 * baked in - prints identically in every browser.
 */
function HandoutSlideImage({
  deckId,
  slide,
  onReady,
}: {
  deckId: RemId;
  slide: Rem;
  onReady: (id: RemId) => void;
}): ReactNode {
  const url = useSlideImage(deckId, slide, 1000);
  const ann = useSelector((s) => s.getRecord('annotations', slide.id));
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    annotatedSlideImage(url, ann)
      .catch(() => url)
      .then((out) => {
        if (!alive) return;
        setSrc(out);
        onReady(slide.id);
      });
    return () => {
      alive = false;
    };
  }, [url, ann]); // eslint-disable-line react-hooks/exhaustive-deps
  return src ? (
    <img className="handout-img" src={src} alt={`Folie ${(slide.slide?.index ?? 0) + 1}`} />
  ) : (
    <div className="handout-img placeholder faint">Folie wird geladen…</div>
  );
}

/** Notes below a slide as static text (no editor chrome, prints cleanly). */
function StaticNotes({ parentId }: { parentId: RemId }): ReactNode {
  const kids = useSelector((s) => s.children(parentId));
  if (kids.length === 0) return null;
  return (
    <ul className="handout-notes">
      {kids.map((k) => (
        <li
          key={k.id}
          className={
            k.mcCorrect === true ? 'mc-right' : k.mcCorrect === false ? 'mc-wrong' : undefined
          }
        >
          <RemContent rem={k} />
          <StaticNotes parentId={k.id} />
        </li>
      ))}
    </ul>
  );
}
