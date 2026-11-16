/**
 * Exams: list of exams and the study plan of one exam (graph and month view).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Archive, CalendarDays, GraduationCap, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { ExamPlan } from '@core/scheduling/exam';
import { selectExamPlans } from '@data/selectors';
import { useApp, useNow, useSelector } from '../../app/context';
import { useModals } from '../../app/modals';
import { BarChart, StatTile } from '../../components/Charts';
import { useDialogs } from '../../components/Confirm';
import { ProgressBar } from '../../components/Controls';
import { useRemTitle } from '../../hooks/useRemTitle';

/** The exams tab. */
export function ExamsTab({ examId }: { examId?: string | undefined }): ReactNode {
  const now = useNow();
  const modals = useModals();
  const navigate = useNavigate();
  const plans = useSelector((s) => selectExamPlans(s, now));
  const plan = examId ? plans.find((p) => p.exam.id === examId) : undefined;
  if (plan) return <ExamDetail plan={plan} />;
  const upcoming = plans.filter((p) => p.status !== 'past' && p.status !== 'archived');
  const past = plans.filter((p) => p.status === 'past' || p.status === 'archived');
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row">
        <p className="muted" style={{ margin: 0, flex: 1 }}>
          Set an exam date for documents or folders. New cards are spread over the days until the exam, everything is reviewed once more right before it, and your daily goal adapts automatically.
        </p>
        <button className="btn btn-primary" onClick={() => modals.open({ kind: 'exam' })}>
          <Plus size={15} /> New exam
        </button>
      </div>
      {upcoming.length === 0 && (
        <div className="empty">
          <GraduationCap size={32} />
          <div>No upcoming exams.</div>
        </div>
      )}
      <div className="grid-2">
        {upcoming.map((p) => (
          <button key={p.exam.id} className="card exam-mini" onClick={() => navigate(`/flashcards/exams/${p.exam.id}`)}>
            <div className="row">
              <strong className="ellipsis" style={{ flex: 1 }}>
                {p.exam.name}
              </strong>
              <span className={`badge ${p.onTrack ? 'badge-success' : 'badge-warning'}`}>{p.onTrack ? 'On track' : 'Behind'}</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {new Date(p.exam.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {p.daysLeft} days left
            </div>
            <ProgressBar value={p.totalCards ? 1 - p.newRemaining / p.totalCards : 1} />
            <div className="faint" style={{ fontSize: 12 }}>
              {p.totalCards - p.newRemaining} / {p.totalCards} cards started
            </div>
          </button>
        ))}
      </div>
      {past.length > 0 && (
        <>
          <h3 className="section-title">Past &amp; archived</h3>
          {past.map((p) => (
            <button key={p.exam.id} className="doc-row" onClick={() => navigate(`/flashcards/exams/${p.exam.id}`)}>
              <GraduationCap size={16} /> <span className="ellipsis">{p.exam.name}</span>
              <span className="faint">{new Date(p.exam.date).toLocaleDateString()}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** Study plan of one exam. */
function ExamDetail({ plan }: { plan: ExamPlan }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const modals = useModals();
  const dialogs = useDialogs();
  const [view, setView] = useState<'graph' | 'month'>('graph');
  const { exam } = plan;
  const fmt = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const statusLabel = { learning: 'Learning period', 'final-review': 'Final review', 'exam-day': 'Exam day', past: 'Exam is over', archived: 'Archived' }[plan.status];

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => navigate('/flashcards/exams')}>
          ← All exams
        </button>
        <h2 style={{ flex: 1, fontSize: 24 }}>{exam.name}</h2>
        <button className="btn btn-primary" onClick={() => navigate(`/practice?scope=exam:${exam.id}`)} disabled={plan.status === 'past'}>
          <Play size={15} /> Practice exam
        </button>
        <button className="btn" onClick={() => modals.open({ kind: 'exam', examId: exam.id })}>
          <Pencil size={15} /> Edit
        </button>
        <button className="btn" onClick={() => app.exams.archive(exam.id, !exam.archived)}>
          <Archive size={15} /> {exam.archived ? 'Restore' : 'Archive'}
        </button>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (await dialogs.confirm({ title: `Delete exam “${exam.name}”?`, message: 'Your review history is kept.', confirmLabel: 'Delete', danger: true })) {
              app.exams.delete(exam.id);
              navigate('/flashcards/exams');
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="row muted" style={{ flexWrap: 'wrap', gap: 14 }}>
        <span>
          <CalendarDays size={14} /> {new Date(exam.date).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
        </span>
        <span className={`badge ${plan.onTrack ? 'badge-success' : 'badge-warning'}`}>{plan.onTrack ? 'On track' : `Behind: ${plan.overdueBacklog} overdue`}</span>
        <span className="badge">{statusLabel}</span>
        <span>Scope: {exam.scope.map((id) => <ScopeName key={id} id={id} />)}</span>
      </div>
      <div className="stat-grid">
        <StatTile label="Days left" value={plan.daysLeft} />
        <StatTile label="Cards" value={plan.totalCards} hint={`${plan.learnedCards} learned`} />
        <StatTile label="Not started" value={plan.newRemaining} />
        <StatTile label="Today" value={`${plan.todayDone} / ${plan.todayTarget}`} hint={`${plan.todayNewQuota} new · ${plan.todayDueReviews} reviews · ${plan.todayFinalReviewQuota} final`} />
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 className="card-title" style={{ flex: 1, margin: 0 }}>
            Study plan
          </h3>
          <div className="segmented" style={{ width: 200 }}>
            <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>
              Graph
            </button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
              Month
            </button>
          </div>
        </div>
        {plan.days.length === 0 ? (
          <div className="empty">This exam is over.</div>
        ) : view === 'graph' ? (
          <BarChart
            ariaLabel="Planned cards per day until the exam"
            labels={plan.days.map((d) => fmt(d.day))}
            labelEvery={Math.ceil(plan.days.length / 10)}
            height={200}
            series={[
              { name: 'New cards', color: 'var(--series-1)', values: plan.days.map((d) => d.newCards) },
              { name: 'Reviews', color: 'var(--series-2)', values: plan.days.map((d) => d.reviews) },
              { name: 'Final review', color: 'var(--series-3)', values: plan.days.map((d) => d.finalReview) },
            ]}
          />
        ) : (
          <MonthView plan={plan} />
        )}
      </div>
    </div>
  );
}

function ScopeName({ id }: { id: string }): ReactNode {
  const navigate = useNavigate();
  const title = useRemTitle(id);
  return (
    <button className="link-btn" style={{ marginRight: 8 }} onClick={() => navigate(`/rem/${id}`)}>
      {title}
    </button>
  );
}

/** Calendar of the plan. */
function MonthView({ plan }: { plan: ExamPlan }): ReactNode {
  const first = new Date(plan.days[0]!.day);
  const offset = (first.getDay() + 6) % 7;
  const cells = [...Array<null>(offset).fill(null), ...plan.days];
  return (
    <div className="month-grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div key={d} className="month-head">
          {d}
        </div>
      ))}
      {cells.map((d, i) =>
        d ? (
          <div key={d.day} className={`month-cell phase-${d.phase}${i === offset ? ' is-today' : ''}`}>
            <div className="month-date">{new Date(d.day).getDate()}</div>
            {d.phase === 'exam' ? (
              <div className="month-exam">Exam</div>
            ) : (
              <>
                {d.newCards > 0 && <div>{d.newCards} new</div>}
                {d.reviews > 0 && <div>{d.reviews} reviews</div>}
                {d.finalReview > 0 && <div>{d.finalReview} final</div>}
              </>
            )}
          </div>
        ) : (
          <div key={`e${i}`} />
        ),
      )}
    </div>
  );
}
