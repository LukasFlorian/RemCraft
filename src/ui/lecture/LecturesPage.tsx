/**
 * "Auswertung": all lectures, the analysis of one lecture (KPIs, attention
 * over time, time per slide, check-ins) and the comparison across lectures
 * (Fokus `charts.js`).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { RemId } from '@core/model/types';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Download, Play, Trash2 } from 'lucide-react';
import { lectureKpis, slideStats, timeline } from '@core/lecture/analytics';
import { summarize } from '@core/lecture/session';
import { toPlainText } from '@core/richtext/ops';
import { exportForAi, lectureMarkdown } from '@data/lecture/context';
import { createDemo } from '@data/lecture/demo';
import { useApp, useNow, useSelector } from '../app/context';
import { BarChart, StatTile } from '../components/Charts';
import { useDialogs } from '../components/Confirm';
import { downloadText } from '../hooks/useFilePicker';
import {
  clock,
  selectLectureState,
  useLectureSettings,
  useLectures,
  useLectureState,
} from './useLecture';

/** The analytics page. */
export function LecturesPage(): ReactNode {
  const { lectureId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <div className="main-scroll">
      <div className="page page-wide">
        {lectureId ? (
          <LectureAnalysis lectureId={lectureId} onBack={() => navigate('/lectures')} />
        ) : (
          <LectureList
            deckFilter={params.get('deck')}
            onOpen={(id) => navigate(`/lectures/${id}`)}
          />
        )}
      </div>
    </div>
  );
}

/** Lectures of one deck with their analysis - shown inside lecture mode. */
export function DeckLecturesPanel({
  deckId,
  onSlides,
  onReview,
}: {
  deckId: RemId;
  onSlides: () => void;
  onReview: () => void;
}): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  return selected ? (
    <LectureAnalysis
      lectureId={selected}
      onBack={() => setSelected(null)}
      onSlides={onSlides}
      onReview={onReview}
    />
  ) : (
    <LectureList deckFilter={deckId} onOpen={setSelected} />
  );
}

/** All lectures with headline numbers and the semester comparison. */
function LectureList({
  deckFilter,
  onOpen,
}: {
  deckFilter: string | null;
  onOpen: (lectureId: string) => void;
}): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const now = useNow();
  const lectures = useLectures().filter((l) => !deckFilter || l.deckId === deckFilter);
  const rows = useSelector((s) =>
    s.memo(
      `lectureRows:${deckFilter}`,
      [
        s.collectionVersion('lectures'),
        s.collectionVersion('lectureEvents'),
        s.collectionVersion('rems'),
        Math.floor(now / 30_000),
      ],
      () =>
        lectures.map((l) => ({
          l,
          sum: summarize(selectLectureState(s, l.id), now),
          deck: l.deckId ? toPlainText(s.get(l.deckId)?.text ?? []) : '',
        })),
    ),
  );
  const chrono = [...rows].reverse();
  return (
    <>
      <div className="page-header">
        <h1>Vorlesungen</h1>
      </div>
      {rows.length === 0 && (
        <div className="empty">
          Noch keine Vorlesung aufgezeichnet. Importiere einen Foliensatz (PDF) in einen Kursordner
          und klicke „Vorlesung starten“.
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => void createDemo(app).then((id) => navigate(`/lecture/${id}`))}
            >
              Demo-Kurs erzeugen
            </button>
          </div>
        </div>
      )}
      {rows.length > 1 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">Vergleich: Anteil in der App</h3>
          <BarChart
            ariaLabel="Anteil der Zeit in der App je Vorlesung"
            labels={chrono.map((r) =>
              new Date(r.l.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              }),
            )}
            series={[
              {
                name: 'In der App (%)',
                color: 'var(--series-1)',
                values: chrono.map((r) =>
                  r.sum.focusRatio === null ? 0 : Math.round(r.sum.focusRatio * 100),
                ),
              },
            ]}
          />
        </div>
      )}
      {rows.map(({ l, sum, deck }) => (
        <button key={l.id} className="doc-row" onClick={() => onOpen(l.id)}>
          <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <span className="doc-title ellipsis">
              {l.name} {sum.running && <span className="badge badge-success">läuft</span>}{' '}
              {sum.paused && <span className="badge badge-warning">Pause</span>}
            </span>
            <span className="doc-parent">
              {new Date(l.createdAt).toLocaleString()} · {deck} · {clock(sum.durationMs)}
              {sum.focusRatio !== null && ` · ${Math.round(sum.focusRatio * 100)} % in der App`}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

/** Analysis of one lecture. */
function LectureAnalysis({
  lectureId,
  onBack,
  onSlides,
  onReview,
}: {
  lectureId: string;
  onBack: () => void;
  onSlides?: () => void;
  onReview?: () => void;
}): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const now = useNow();
  const cfg = useLectureSettings();
  const lecture = useSelector((s) => s.getRecord('lectures', lectureId));
  const st = useLectureState(lectureId);
  const slideCount = useSelector((s) =>
    lecture?.deckId ? s.children(lecture.deckId).filter((r) => r.slide).length : 0,
  );
  if (!lecture || !st) return <div className="empty">Vorlesung nicht gefunden.</div>;
  const k = lectureKpis(st, cfg, slideCount, now);
  const tl = timeline(st, now);
  const stats = slideStats(st, slideCount, now);
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>
          ← Alle Vorlesungen
        </button>
        <h2 style={{ flex: 1, fontSize: 24 }}>{lecture.name}</h2>
        {lecture.deckId && (
          <>
            <button
              className="btn"
              onClick={() => (onSlides ? onSlides() : navigate(`/lecture/${lecture.deckId}`))}
            >
              <Play size={15} /> Folien
            </button>
            <button
              className="btn"
              onClick={() =>
                onReview ? onReview() : navigate(`/review/${lecture.deckId}?lecture=${lecture.id}`)
              }
            >
              Nacharbeiten
            </button>
            <button
              className="btn"
              onClick={() =>
                downloadText(
                  `${lecture.name}.md`,
                  exportForAi(app.store, lecture.deckId!, lecture.id),
                  'text/markdown',
                )
              }
            >
              <Download size={15} /> Export für KI
            </button>
          </>
        )}
        <button
          className="btn"
          onClick={() => {
            const csv = [
              'folie;zeit_s;besuche;ausserhalb_s;abschweifen',
              ...stats.map(
                (x) =>
                  `${x.slide + 1};${Math.round(x.dwellMs / 1000)};${x.visits};${Math.round(x.awayMs / 1000)};${x.drifts}`,
              ),
            ].join('\n');
            downloadText(`${lecture.name}.csv`, csv, 'text/csv');
          }}
        >
          CSV
        </button>
        <button
          className="btn btn-danger"
          aria-label="Vorlesung löschen"
          onClick={async () => {
            if (
              await dialogs.confirm({
                title: 'Vorlesung löschen?',
                message: 'Notizen und Karten der Folien bleiben erhalten.',
                confirmLabel: 'Löschen',
                danger: true,
              })
            ) {
              app.lectures.delete(lectureId);
              navigate('/lectures');
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {st.goal && (
        <div className="card">
          <strong>Ziel:</strong> {st.goal}
        </div>
      )}
      {st.summary && (
        <div className="card" style={{ whiteSpace: 'pre-wrap' }}>
          <strong>Zusammenfassung:</strong>
          {'\n'}
          {st.summary}
        </div>
      )}
      <div className="stat-grid">
        <StatTile label="Dauer" value={clock(k.durationMs)} />
        <StatTile
          label="In der App"
          value={k.focusRatio === null ? '—' : `${Math.round(k.focusRatio * 100)} %`}
        />
        <StatTile
          label="Zeit außerhalb"
          value={clock(k.awayMs)}
          hint={`${k.awayCount}×, längste ${clock(k.longestAwayMs)}`}
        />
        <StatTile label="Abschweifen bemerkt" value={k.drifts} />
        <StatTile
          label="Check-ins"
          value={`${k.checkinsAnswered}/${k.checkins}`}
          hint={k.focusAvg ? `Ø Fokus ${k.focusAvg}/5` : undefined}
        />
        <StatTile
          label="Folien besprochen"
          value={k.slidesSeen}
          hint={k.paceMs ? `Ø ${clock(k.paceMs)} pro Folie` : undefined}
        />
      </div>
      <div className="card">
        <h3 className="card-title">
          Aufmerksamkeit im Verlauf (Sekunden außerhalb der App pro Minute)
        </h3>
        <BarChart
          ariaLabel="Sekunden außerhalb der App pro Minute"
          labels={tl.awaySeconds.map((_, i) => `${i + 1}′`)}
          labelEvery={Math.ceil(tl.minutes / 12)}
          series={[{ name: 'außerhalb (s)', color: 'var(--series-2)', values: tl.awaySeconds }]}
        />
        <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
          Abschweifen bemerkt bei Minute {tl.drifts.map((d) => Math.round(d)).join(', ') || '—'}
        </div>
      </div>
      {slideCount > 0 && (
        <div className="card">
          <h3 className="card-title">Zeit pro Folie</h3>
          <BarChart
            ariaLabel="Zeit pro Folie in Sekunden"
            labels={stats.map((x) => String(x.slide + 1))}
            labelEvery={Math.ceil(stats.length / 20)}
            series={[
              {
                name: 'in der App (s)',
                color: 'var(--series-1)',
                values: stats.map((x) => Math.round(Math.max(0, x.dwellMs - x.awayMs) / 1000)),
              },
              {
                name: 'außerhalb (s)',
                color: 'var(--series-2)',
                values: stats.map((x) => Math.round(x.awayMs / 1000)),
              },
            ]}
          />
        </div>
      )}
      {tl.checkins.length > 0 && (
        <div className="card">
          <h3 className="card-title">Check-ins</h3>
          {tl.checkins.map((c, i) => (
            <div key={i} className="checkin-row">
              <span className="faint">Min. {Math.round(c.minute)}</span> <em>{c.prompt}</em>
              <div>{c.skipped ? <span className="faint">übersprungen</span> : c.text}</div>
              {c.focus && <span className="badge">Fokus {c.focus}/5</span>}
            </div>
          ))}
        </div>
      )}
      <details>
        <summary className="muted">Rohdaten (Markdown)</summary>
        <pre className="code-block">{lectureMarkdown(app.store, lectureId)}</pre>
      </details>
    </div>
  );
}
