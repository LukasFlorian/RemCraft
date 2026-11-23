/**
 * Flashcards home: today's goal, streak, exams and the documents grouped by
 * priority (Currently Studying / Maintaining / No Priority / Paused).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { RemIcon } from '../../components/RemIcon';
import { AlertTriangle, ChevronRight, GraduationCap, MoreHorizontal, Target } from 'lucide-react';
import type { Priority, RemId } from '@core/model/types';
import {
  averageAnswerTime,
  computeDailyGoal,
  computeStreak,
  lastDaysCounts,
  reviewsPerDay,
} from '@core/stats/stats';
import {
  countsTowardsGoal,
  selectCardIndex,
  selectDueCounts,
  selectExamPlans,
  selectGlobalQueue,
  selectInheritance,
  selectLogs,
  selectSettings,
  selectTodayLogs,
} from '@data/selectors';
import type { Store } from '@data/store/store';
import { useNow, useSelector } from '../../app/context';
import { BarChart } from '../../components/Charts';
import { ProgressBar } from '../../components/Controls';
import { Menu } from '../../components/Menu';
import type { MenuEntry } from '../../components/Menu';
import { useRemTitle } from '../../hooks/useRemTitle';
import { PRIORITY_LABELS, useRemMenu } from '../remMenu';
import { PriorityIcon } from '../../components/PriorityIcon';
import { t, tn } from '@core/i18n';

/** Number of cards in every subtree. */
function selectCardCounts(store: Store): Map<RemId, number> {
  return store.memo('cardCounts', [store.collectionVersion('rems')], () => {
    const counts = new Map<RemId, number>();
    for (const spec of selectCardIndex(store).specs) {
      let cur: RemId | null = spec.remId;
      const seen = new Set<RemId>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        counts.set(cur, (counts.get(cur) ?? 0) + 1);
        cur = store.get(cur)?.parentId ?? null;
      }
    }
    return counts;
  });
}

/** The home tab. */
export function HomeTab(): ReactNode {
  const navigate = useNavigate();
  const now = useNow();
  const settings = useSelector(selectSettings);
  const queue = useSelector((s) => selectGlobalQueue(s, now));
  const todayLogs = useSelector((s) => selectTodayLogs(s, now));
  const logs = useSelector(selectLogs);
  const plans = useSelector((s) => selectExamPlans(s, now)).filter(
    (p) => p.status !== 'past' && p.status !== 'archived',
  );

  const correctToday = todayLogs.filter((l) => l.rating > 1).length;
  const forGoal = queue.filter((q) => countsTowardsGoal(q.bucket, settings.dailyGoalMode)).length;
  const goal = computeDailyGoal(
    settings.dailyGoalMode,
    forGoal,
    correctToday,
    settings.dailyGoalNumber,
  );
  const minutes = Math.max(1, Math.round((queue.length * averageAnswerTime(logs)) / 60000));
  const perDay = reviewsPerDay(logs, settings.dayStartHour);
  const streak = computeStreak(perDay, settings.streakGoal, now, settings.dayStartHour);
  const week = lastDaysCounts(perDay, now, 7, settings.dayStartHour);

  return (
    <div className="col" style={{ gap: 28 }}>
      <section>
        <h2 className="section-title">
          <Target size={20} className="accent-icon" /> {t("Today's Goal")}
        </h2>
        <div className="grid-2">
          <div className="card goal-card">
            <div className="goal-number">
              <strong>{goal.remaining}</strong> {t('cards due for today')}
            </div>
            <ProgressBar value={goal.target ? goal.done / goal.target : 1} />
            <div className="faint" style={{ fontSize: 13 }}>
              {goal.done} {t('of')} {goal.target} {t('done today')}
            </div>
            <button
              className="btn btn-primary btn-lg"
              disabled={queue.length === 0}
              onClick={() => navigate('/practice?scope=global')}
            >
              {queue.length === 0
                ? t('All done for today 🎉')
                : t('Practice {length} Cards · {minutes} min', { length: queue.length, minutes })}
            </button>
          </div>
          <div className="card streak-card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="col" style={{ gap: 6 }}>
                <div className="goal-number">
                  <strong>{streak.current}</strong> {t('day streak')}
                </div>
                {!streak.hitToday ? (
                  <span className="badge badge-warning">
                    <AlertTriangle size={12} /> {t('Practice')}{' '}
                    {Math.max(0, settings.streakGoal - streak.today)} {t('cards')}
                  </span>
                ) : (
                  <span className="badge badge-success">{t('Streak goal reached')}</span>
                )}
                <span className="faint" style={{ fontSize: 12 }}>
                  {t('Longest:')} {streak.longest} {t('days')}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <BarChart
                  ariaLabel={t('Reviews in the last 7 days')}
                  labels={week.map((d) =>
                    new Date(d.day).toLocaleDateString(undefined, { weekday: 'narrow' }),
                  )}
                  series={[
                    {
                      name: t('Reviews'),
                      color: 'var(--series-1)',
                      values: week.map((d) => d.count),
                    },
                  ]}
                  goal={settings.streakGoal}
                  height={120}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <section>
          <h2 className="section-title">
            <GraduationCap size={20} className="accent-icon" /> {t('Exams')}
          </h2>
          <div className="grid-2">
            {plans.map((p) => (
              <button
                key={p.exam.id}
                className="card exam-mini"
                onClick={() => navigate(`/flashcards/exams/${p.exam.id}`)}
              >
                <div className="row">
                  <strong className="ellipsis" style={{ flex: 1 }}>
                    {p.exam.name}
                  </strong>
                  <span className={`badge ${p.onTrack ? 'badge-success' : 'badge-warning'}`}>
                    {p.onTrack ? t('On track') : t('Behind')}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {p.daysLeft === 0 ? t('Today') : tn('in {n} day', 'in {n} days', p.daysLeft)} ·{' '}
                  {p.totalCards} {t('cards ·')} {p.newRemaining} {t('new left')}
                </div>
                <ProgressBar value={p.todayTarget ? p.todayDone / p.todayTarget : 1} />
                <div className="faint" style={{ fontSize: 12 }}>
                  {t('Today:')} {p.todayDone} / {p.todayTarget}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {(['active', 'maintaining', 'none', 'paused'] as Priority[]).map((p) => (
        <PrioritySection key={p} priority={p} now={now} />
      ))}
    </div>
  );
}

/** Documents/folders of one priority (top-most items of that priority). */
function PrioritySection({ priority, now }: { priority: Priority; now: number }): ReactNode {
  const roots = useSelector((s) =>
    s.memo(`prio:${priority}`, [s.collectionVersion('rems'), Math.floor(now / 60000)], () => {
      const info = selectInheritance(s, now);
      const counts = selectCardCounts(s);
      return s
        .all('rems')
        .filter((r) => (r.isDocument || r.isFolder) && (counts.get(r.id) ?? 0) > 0)
        .filter((r) => info.get(r.id)?.explicitPriority === priority)
        .filter((r) => {
          // Only the top-most document of this priority with cards.
          let p = r.parentId;
          while (p) {
            const parent = s.get(p);
            if (
              parent &&
              (parent.isDocument || parent.isFolder) &&
              info.get(p)?.explicitPriority === priority &&
              (counts.get(p) ?? 0) > 0
            )
              return false;
            p = parent?.parentId ?? null;
          }
          return true;
        })
        .map((r) => r.id);
    }),
  );
  if (roots.length === 0) return null;
  return (
    <section>
      <h2 className="section-title">
        <PriorityIcon priority={priority} size={18} /> {PRIORITY_LABELS[priority]}
      </h2>
      <div className="card priority-card">
        {roots.map((id) => (
          <PriorityItem key={id} remId={id} depth={0} now={now} priority={priority} />
        ))}
      </div>
    </section>
  );
}

/** A document/folder row with due count and nested children. */
function PriorityItem({
  remId,
  depth,
  now,
  priority,
}: {
  remId: RemId;
  depth: number;
  now: number;
  priority: Priority;
}): ReactNode {
  const navigate = useNavigate();
  const remMenu = useRemMenu();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entries: MenuEntry[] } | null>(null);
  const [open, setOpen] = useState(true);
  const title = useRemTitle(remId);
  const rem = useSelector((s) => s.get(remId));
  const due = useSelector((s) => selectDueCounts(s, now).get(remId) ?? 0);
  const kids = useSelector((s) =>
    s.memo(`prioKids:${remId}`, [s.collectionVersion('rems')], () => {
      const counts = selectCardCounts(s);
      return s
        .children(remId)
        .filter(
          (c) =>
            (c.isDocument || c.isFolder) &&
            (counts.get(c.id) ?? 0) > 0 &&
            (c.priority === undefined || c.priority === priority),
        )
        .map((c) => c.id);
    }),
  );
  if (!rem) return null;
  return (
    <>
      <div className="priority-row" style={{ paddingLeft: 8 + depth * 22 }}>
        {kids.length > 0 ? (
          <button
            className={`tree-toggle${open ? ' open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={t('Expand')}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}
        <RemIcon rem={rem} size={16} className="tree-icon" />
        <button
          className="link-plain ellipsis priority-title"
          onClick={() => navigate(`/rem/${remId}`)}
        >
          {title}
        </button>
        <span className="spacer" />
        {priority !== 'paused' && (
          <button
            className="btn btn-sm due-btn"
            onClick={() => navigate(`/practice?scope=${remId}&mode=srs`)}
          >
            {due} {t('Due')}
          </button>
        )}
        {priority === 'paused' && <span className="badge">{t('Paused')}</span>}
        <button
          className="icon-btn"
          aria-label={t('More')}
          onClick={(e) =>
            setMenu({ anchor: e.currentTarget, entries: remMenu(remId, { includeOpen: true }) })
          }
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      {open &&
        kids.map((k) => (
          <PriorityItem key={k} remId={k} depth={depth + 1} now={now} priority={priority} />
        ))}
      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menu.entries}
          onClose={() => setMenu(null)}
          align="end"
        />
      )}
    </>
  );
}
