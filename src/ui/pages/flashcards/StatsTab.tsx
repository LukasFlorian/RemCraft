/**
 * Statistics: key numbers, reviews per day, forecast, heatmap, maturity and
 * answer distribution.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { RATING_LABELS } from '@core/scheduling/scheduler';
import { averageAnswerTime, cardCounts, computeStreak, dueForecast, lastDaysCounts, ratingDistribution, retentionRate, reviewsPerDay } from '@core/stats/stats';
import { addStudyDays, DAY, isoDate } from '@core/util/time';
import { cardStateOf, selectCardIndex, selectLogs, selectSettings } from '@data/selectors';
import { useNow, useSelector } from '../../app/context';
import { BarChart, Heatmap, StatTile } from '../../components/Charts';

/** The stats tab. */
export function StatsTab(): ReactNode {
  const now = useNow();
  const [range, setRange] = useState(30);
  const settings = useSelector(selectSettings);
  const logs = useSelector(selectLogs);
  const states = useSelector((s) => s.memo('allStates', [s.collectionVersion('rems'), s.collectionVersion('cards')], () => selectCardIndex(s).specs.map((spec) => cardStateOf(s, spec))));
  const perDay = reviewsPerDay(logs, settings.dayStartHour);
  const days = lastDaysCounts(perDay, now, range, settings.dayStartHour);
  const forecast = dueForecast(states, now, range, settings.dayStartHour);
  const counts = cardCounts(states);
  const streak = computeStreak(perDay, settings.streakGoal, now, settings.dayStartHour);
  const retention = retentionRate(logs, now - 30 * DAY);
  const ratings = ratingDistribution(logs.filter((l) => l.reviewedAt >= now - range * DAY));
  const year = lastDaysCounts(perDay, now, 365, settings.dayStartHour).map((d) => ({ date: isoDate(d.day), count: d.count }));
  const fmtDay = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const every = Math.ceil(range / 10);

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="stat-grid">
        <StatTile label="Cards" value={counts.total} hint={`${counts.new} new · ${counts.mature} mature`} />
        <StatTile label="Reviews today" value={streak.today} />
        <StatTile label="Total reviews" value={logs.length} />
        <StatTile label="Retention (30 d)" value={retention === null ? '—' : `${Math.round(retention * 100)} %`} hint="Reviews not forgotten" />
        <StatTile label="Streak" value={`${streak.current} d`} hint={`Longest ${streak.longest} d`} />
        <StatTile label="Avg. answer time" value={`${Math.round(averageAnswerTime(logs) / 1000)} s`} />
      </div>
      <div className="row">
        {[7, 30, 90, 365].map((r) => (
          <button key={r} className={`pill${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>
            {r === 365 ? '1 year' : `${r} days`}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">Reviews per day</h3>
          <BarChart ariaLabel="Reviews per day" labels={days.map((d) => fmtDay(d.day))} labelEvery={every} series={[{ name: 'Reviews', color: 'var(--series-1)', values: days.map((d) => d.count) }]} />
        </div>
        <div className="card">
          <h3 className="card-title">Forecast: cards due</h3>
          <BarChart
            ariaLabel="Cards due per day in the future"
            labels={forecast.map((_, i) => fmtDay(addStudyDays(now, i, settings.dayStartHour)))}
            labelEvery={every}
            series={[{ name: 'Due', color: 'var(--series-1)', values: forecast }]}
          />
        </div>
        <div className="card">
          <h3 className="card-title">Card maturity</h3>
          <BarChart
            ariaLabel="Cards by maturity"
            labels={['Cards']}
            series={[
              { name: 'New', color: 'var(--series-1)', values: [counts.new] },
              { name: 'Learning', color: 'var(--series-2)', values: [counts.learning] },
              { name: 'Young (< 21 d)', color: 'var(--series-3)', values: [counts.young] },
              { name: 'Mature', color: 'var(--series-4)', values: [counts.mature] },
            ]}
          />
          <table className="table compact">
            <tbody>
              <tr><td>New</td><td>{counts.new}</td><td>Learning</td><td>{counts.learning}</td></tr>
              <tr><td>Young</td><td>{counts.young}</td><td>Mature</td><td>{counts.mature}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="card-title">Answers ({range === 365 ? '1 year' : `${range} days`})</h3>
          <BarChart ariaLabel="Answer distribution" labels={[1, 2, 3, 4].map((r) => RATING_LABELS[r as 1])} series={[{ name: 'Answers', color: 'var(--series-1)', values: [ratings[1], ratings[2], ratings[3], ratings[4]] }]} />
        </div>
      </div>
      <div className="card">
        <h3 className="card-title">Activity (last year)</h3>
        <Heatmap days={year} ariaLabel="Reviews per day over the last year" />
      </div>
    </div>
  );
}
