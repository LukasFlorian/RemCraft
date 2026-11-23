/**
 * Habit statistics (`#/habits/stats`): all habits at a glance or one habit
 * with its year grid, numbers and completions per month.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Habit } from '@core/model/types';
import { completionRate, completionsPerMonth, streaks, totals } from '@core/habits/habits';
import { selectHabitData, selectHabits } from '@data/services/habits';
import { useApp, useSelector } from '../app/context';
import { BarChart, StatTile } from '../components/Charts';
import { MONTHS, YearGrid } from './HabitGrid';
import { HabitBadge, useHabitData, useToday } from './common';
import { t as tr } from '@core/i18n';

/** The statistics page. */
export function HabitStatsPage(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const habits = useSelector((s) => selectHabits(s));
  const today = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const habit = habits.find((h) => h.id === selected) ?? null;
  // All habits summed up per month.
  const all = useSelector((s) =>
    // Memoised: the selector must return the same object while nothing changed.
    s.memo(
      `habitStats:${year}:${today}`,
      [
        s.collectionVersion('habits'),
        s.collectionVersion('habitEntries'),
        s.collectionVersion('logs'),
      ],
      () =>
        selectHabits(s).map((h) => {
          const d = selectHabitData(s, h, today);
          return {
            habit: h,
            months: completionsPerMonth(d, year),
            rate: completionRate(d),
            streak: streaks(d),
          };
        }),
    ),
  );
  const sum = MONTHS.map((_, i) => all.reduce((n, a) => n + (a.months[i] ?? 0), 0));

  const exportCsv = (): void => {
    const blob = new Blob([app.habits.exportCsv(today)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gewohnheiten.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="main-scroll">
      <div className="page habits-page">
        <div className="page-header habits-header">
          <button className="icon-btn" aria-label={tr('Back')} onClick={() => navigate('/habits')}>
            <ChevronLeft size={18} />
          </button>
          <h1>{tr('Statistics')}</h1>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={exportCsv} title={tr('All days as CSV')}>
            <Download size={14} /> CSV
          </button>
        </div>

        <div className="habit-picker" role="tablist" aria-label={tr('Habit')}>
          <button
            role="tab"
            aria-selected={!habit}
            className={!habit ? 'active' : ''}
            onClick={() => setSelected(null)}
          >
            {tr('All')}
          </button>
          {habits.map((h) => (
            <button
              key={h.id}
              role="tab"
              aria-selected={habit?.id === h.id}
              title={h.name}
              aria-label={h.name}
              className={habit?.id === h.id ? 'active' : ''}
              onClick={() => setSelected(h.id)}
            >
              <HabitBadge habit={h} size={30} />
            </button>
          ))}
        </div>

        <div className="row habit-year-nav">
          <button
            className="icon-btn"
            aria-label={tr('Previous year')}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <strong>{year}</strong>
          <button
            className="icon-btn"
            aria-label={tr('Next year')}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {habit ? (
          <SingleHabitStats habit={habit} year={year} />
        ) : (
          <>
            <div className="card">
              <h2 className="card-title">{tr('Completions per month – all habits')}</h2>
              <BarChart
                labels={MONTHS}
                series={[{ name: tr('Completed'), color: 'var(--accent)', values: sum }]}
                height={160}
                ariaLabel={`Erledigungen pro Monat ${year}`}
              />
            </div>
            <div className="card habit-table-card">
              <table className="table compact habit-table">
                <thead>
                  <tr>
                    <th>{tr('Habit')}</th>
                    <th>{tr('Rate')}</th>
                    <th>{tr('Streak')}</th>
                    <th>{tr('Best')}</th>
                    <th>{year}</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((a) => (
                    <tr
                      key={a.habit.id}
                      onClick={() => setSelected(a.habit.id)}
                      className="clickable"
                    >
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <HabitBadge habit={a.habit} size={24} />
                          <span className="ellipsis">{a.habit.name}</span>
                        </span>
                      </td>
                      <td>{a.rate} %</td>
                      <td>{a.streak.current}</td>
                      <td>{a.streak.best}</td>
                      <td>{a.months.reduce((x, y) => x + y, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Numbers of one habit in a year. */
function SingleHabitStats({ habit, year }: { habit: Habit; year: number }): ReactNode {
  const data = useHabitData(habit);
  const s = streaks(data);
  const t = totals(data);
  const months = completionsPerMonth(data, year);
  return (
    <>
      <div className="card">
        <YearGrid data={data} color={habit.color} year={year} />
      </div>
      <div className="habit-stats">
        <StatTile label={tr('Completions')} value={t.completions} />
        <StatTile label={tr('Completion rate')} value={`${completionRate(data)} %`} />
        <StatTile label={tr('Current streak')} value={s.current} />
        <StatTile label={tr('Best streak')} value={s.best} />
      </div>
      <div className="card">
        <h2 className="card-title">{tr('Completions per month')}</h2>
        <BarChart
          labels={MONTHS}
          series={[{ name: tr('Completed'), color: habit.color, values: months }]}
          height={150}
          ariaLabel={`Erledigungen pro Monat ${year}`}
        />
      </div>
    </>
  );
}
