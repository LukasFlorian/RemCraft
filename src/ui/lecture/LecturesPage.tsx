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
import { t } from '@core/i18n';

/** The analytics page. */
export function LecturesPage(): ReactNode {
  const { lectureId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <div className="main-scroll" data-file-drop-page="root">
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
        <h1>{t('Lectures')}</h1>
      </div>
      {rows.length === 0 && (
        <div className="empty">
          {t(
            'No lecture recorded yet. Import a slide deck (PDF) into a course folder and click “Start lecture”.',
          )}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => void createDemo(app).then((id) => navigate(`/lecture/${id}`))}
            >
              {t('Create demo course')}
            </button>
          </div>
        </div>
      )}
      {rows.length > 1 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">{t('Comparison: share in the app')}</h3>
          <BarChart
            ariaLabel={t('Share of time in the app per lecture')}
            labels={chrono.map((r) =>
              new Date(r.l.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              }),
            )}
            series={[
              {
                name: t('In the app (%)'),
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
              {l.name} {sum.running && <span className="badge badge-success">{t('running')}</span>}{' '}
              {sum.paused && <span className="badge badge-warning">{t('Pause')}</span>}
            </span>
            <span className="doc-parent">
              {new Date(l.createdAt).toLocaleString()} · {deck} · {clock(sum.durationMs)}
              {sum.focusRatio !== null &&
                t(' · {0} % in the app', { '0': Math.round(sum.focusRatio * 100) })}
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
  if (!lecture || !st) return <div className="empty">{t('Lecture not found.')}</div>;
  const k = lectureKpis(st, cfg, slideCount, now);
  const tl = timeline(st, now);
  const stats = slideStats(st, slideCount, now);
  return (
    <div className="lecture-analysis">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>
          {t('← All lectures')}
        </button>
        <h2 style={{ flex: 1, fontSize: 24 }}>{lecture.name}</h2>
        {lecture.deckId && (
          <>
            <button
              className="btn"
              onClick={() => (onSlides ? onSlides() : navigate(`/lecture/${lecture.deckId}`))}
            >
              <Play size={15} /> {t('Slides')}
            </button>
            <button
              className="btn"
              onClick={() =>
                onReview ? onReview() : navigate(`/review/${lecture.deckId}?lecture=${lecture.id}`)
              }
            >
              {t('Follow-up')}
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
              <Download size={15} /> {t('Export for AI')}
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
          aria-label={t('Delete lecture')}
          onClick={async () => {
            if (
              await dialogs.confirm({
                title: t('Delete lecture?'),
                message: t('Notes and cards of the slides are kept.'),
                confirmLabel: t('Delete'),
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
          <strong>{t('Goal:')}</strong> {st.goal}
        </div>
      )}
      {st.summary && (
        <div className="card" style={{ whiteSpace: 'pre-wrap' }}>
          <strong>{t('Summary:')}</strong>
          {'\n'}
          {st.summary}
        </div>
      )}
      <div className="stat-grid">
        <StatTile label={t('Duration')} value={clock(k.durationMs)} />
        <StatTile
          label={t('In the app')}
          value={k.focusRatio === null ? '—' : `${Math.round(k.focusRatio * 100)} %`}
        />
        <StatTile
          label={t('Time away')}
          value={clock(k.awayMs)}
          hint={t('{awayCount}×, longest {1}', {
            awayCount: k.awayCount,
            '1': clock(k.longestAwayMs),
          })}
        />
        <StatTile label={t('Drift noticed')} value={k.drifts} />
        <StatTile
          label={t('Check-ins')}
          value={`${k.checkinsAnswered}/${k.checkins}`}
          hint={k.focusAvg ? t('Avg. focus {focusAvg}/5', { focusAvg: k.focusAvg }) : undefined}
        />
        <StatTile
          label={t('Slides covered')}
          value={k.slidesSeen}
          hint={k.paceMs ? t('Avg. {0} per slide', { '0': clock(k.paceMs) }) : undefined}
        />
      </div>
      <div className="card">
        <h3 className="card-title">
          {t('Attention over time (seconds outside the app per minute)')}
        </h3>
        <BarChart
          ariaLabel={t('Seconds outside the app per minute')}
          labels={tl.awaySeconds.map((_, i) => `${i + 1}′`)}
          labelEvery={Math.ceil(tl.minutes / 12)}
          series={[{ name: t('outside (s)'), color: 'var(--series-2)', values: tl.awaySeconds }]}
        />
        <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>
          {t('Drift noticed at minute')} {tl.drifts.map((d) => Math.round(d)).join(', ') || '—'}
        </div>
      </div>
      {slideCount > 0 && (
        <div className="card">
          <h3 className="card-title">{t('Time per slide')}</h3>
          <BarChart
            ariaLabel={t('Time per slide in seconds')}
            labels={stats.map((x) => String(x.slide + 1))}
            labelEvery={Math.ceil(stats.length / 20)}
            series={[
              {
                name: t('in the app (s)'),
                color: 'var(--series-1)',
                values: stats.map((x) => Math.round(Math.max(0, x.dwellMs - x.awayMs) / 1000)),
              },
              {
                name: t('outside (s)'),
                color: 'var(--series-2)',
                values: stats.map((x) => Math.round(x.awayMs / 1000)),
              },
            ]}
          />
        </div>
      )}
      {tl.checkins.length > 0 && (
        <div className="card">
          <h3 className="card-title">{t('Check-ins')}</h3>
          {tl.checkins.map((c, i) => (
            <div key={i} className="checkin-row">
              <span className="faint">
                {t('min')} {Math.round(c.minute)}
              </span>{' '}
              <em>{c.prompt}</em>
              <div>{c.skipped ? <span className="faint">{t('skipped')}</span> : c.text}</div>
              {c.focus && (
                <span className="badge">
                  {t('Focus')} {c.focus}/5
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <details>
        <summary className="muted">{t('Raw data (Markdown)')}</summary>
        <pre className="code-block">{lectureMarkdown(app.store, lectureId)}</pre>
      </details>
    </div>
  );
}
