/**
 * Statistics: key numbers, reviews per day, forecast, heatmap, maturity and
 * answer distribution.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { RATING_LABELS } from '@core/scheduling/scheduler';
import {
  averageAnswerTime,
  cardCounts,
  computeStreak,
  dueForecast,
  lastDaysCounts,
  ratingDistribution,
  retentionRate,
  reviewsPerDay,
} from '@core/stats/stats';
import { cardTimes, hardestCards } from '@core/stats/cardTimes';
import { addStudyDays, DAY, isoDate } from '@core/util/time';
import { cardStateOf, selectCardIndex, selectLogs, selectSettings } from '@data/selectors';
import { useNavigate } from 'react-router';
import { toPlainText } from '@core/richtext/ops';
import { useNow, useSelector } from '../../app/context';
import { BarChart, Heatmap, StatTile } from '../../components/Charts';
import { t as tr } from '@core/i18n';

/** The stats tab. */
export function StatsTab(): ReactNode {
  const now = useNow();
  const [range, setRange] = useState(30);
  const settings = useSelector(selectSettings);
  const logs = useSelector(selectLogs);
  const states = useSelector((s) =>
    s.memo('allStates', [s.collectionVersion('rems'), s.collectionVersion('cards')], () =>
      selectCardIndex(s).specs.map((spec) => cardStateOf(s, spec)),
    ),
  );
  const perDay = reviewsPerDay(logs, settings.dayStartHour);
  const days = lastDaysCounts(perDay, now, range, settings.dayStartHour);
  const forecast = dueForecast(states, now, range, settings.dayStartHour);
  const counts = cardCounts(states);
  const streak = computeStreak(perDay, settings.streakGoal, now, settings.dayStartHour);
  const retention = retentionRate(logs, now - 30 * DAY);
  const ratings = ratingDistribution(logs.filter((l) => l.reviewedAt >= now - range * DAY));
  const year = lastDaysCounts(perDay, now, 365, settings.dayStartHour).map((d) => ({
    date: isoDate(d.day),
    count: d.count,
  }));
  const navigate = useNavigate();
  // Hardest cards: slow to answer or often forgotten (with their Rem's text).
  const hardest = useSelector((s) =>
    s.memo('hardestCards', [s.collectionVersion('logs'), s.collectionVersion('rems')], () => {
      const index = selectCardIndex(s);
      return hardestCards(cardTimes(selectLogs(s)), 15).flatMap((t) => {
        const remId = index.byId.get(t.cardId)?.remId;
        const rem = remId ? s.get(remId) : undefined;
        return rem && !cardStateOf(s, index.byId.get(t.cardId)!).disabled
          ? [{ ...t, remId: rem.id, text: toPlainText(rem.text) || '…' }]
          : [];
      });
    }),
  );
  const fmtDay = (t: number): string =>
    new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const every = Math.ceil(range / 10);

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="stat-grid">
        <StatTile
          label={tr('Cards')}
          value={counts.total}
          hint={tr('{new} new · {mature} mature', { new: counts.new, mature: counts.mature })}
        />
        <StatTile label={tr('Reviews today')} value={streak.today} />
        <StatTile label={tr('Total reviews')} value={logs.length} />
        <StatTile
          label={tr('Retention (30 d)')}
          value={retention === null ? '—' : `${Math.round(retention * 100)} %`}
          hint={tr('Reviews not forgotten')}
        />
        <StatTile
          label={tr('Streak')}
          value={`${streak.current} d`}
          hint={tr('Longest {longest} d', { longest: streak.longest })}
        />
        <StatTile
          label={tr('Avg. answer time')}
          value={`${Math.round(averageAnswerTime(logs) / 1000)} s`}
        />
      </div>
      <div className="row">
        {[7, 30, 90, 365].map((r) => (
          <button
            key={r}
            className={`pill${range === r ? ' active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 365 ? tr('1 year') : tr('{r} days', { r })}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">{tr('Reviews per day')}</h3>
          <BarChart
            ariaLabel={tr('Reviews per day')}
            labels={days.map((d) => fmtDay(d.day))}
            labelEvery={every}
            series={[
              { name: tr('Reviews'), color: 'var(--series-1)', values: days.map((d) => d.count) },
            ]}
          />
        </div>
        <div className="card">
          <h3 className="card-title">{tr('Forecast: cards due')}</h3>
          <BarChart
            ariaLabel={tr('Cards due per day in the future')}
            labels={forecast.map((_, i) => fmtDay(addStudyDays(now, i, settings.dayStartHour)))}
            labelEvery={every}
            series={[{ name: 'Due', color: 'var(--series-1)', values: forecast }]}
          />
        </div>
        <div className="card">
          <h3 className="card-title">{tr('Card maturity')}</h3>
          <BarChart
            ariaLabel={tr('Cards by maturity')}
            labels={[tr('Cards')]}
            series={[
              { name: 'New', color: 'var(--series-1)', values: [counts.new] },
              { name: tr('Learning'), color: 'var(--series-2)', values: [counts.learning] },
              { name: 'Young (< 21 d)', color: 'var(--series-3)', values: [counts.young] },
              { name: tr('Mature'), color: 'var(--series-4)', values: [counts.mature] },
            ]}
          />
          <table className="table compact">
            <tbody>
              <tr>
                <td>{tr('New')}</td>
                <td>{counts.new}</td>
                <td>{tr('Learning')}</td>
                <td>{counts.learning}</td>
              </tr>
              <tr>
                <td>{tr('Young')}</td>
                <td>{counts.young}</td>
                <td>{tr('Mature')}</td>
                <td>{counts.mature}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="card-title">
            {tr('Answers (')}
            {range === 365 ? tr('1 year') : tr('{range} days', { range })})
          </h3>
          <BarChart
            ariaLabel={tr('Answer distribution')}
            labels={[1, 2, 3, 4].map((r) => RATING_LABELS[r as 1])}
            series={[
              {
                name: tr('Answers'),
                color: 'var(--series-1)',
                values: [ratings[1], ratings[2], ratings[3], ratings[4]],
              },
            ]}
          />
        </div>
      </div>
      <div className="card">
        <h3 className="card-title">{tr('Activity (last year)')}</h3>
        <Heatmap days={year} ariaLabel={tr('Reviews per day over the last year')} />
      </div>
      <div className="card">
        <h3 className="card-title">{tr('Difficult cards')}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {tr(
            'Cards that take you longest or that you often forget (average of the last answers; only active time in the app).',
          )}
        </p>
        {hardest.length === 0 ? (
          <p className="faint">{tr('Not enough answers yet – every card needs at least two.')}</p>
        ) : (
          <table className="table hard-cards">
            <thead>
              <tr>
                <th>{tr('Card')}</th>
                <th>{tr('Avg. time')}</th>
                <th>{tr('Forgotten')}</th>
                <th>{tr('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {hardest.map((t) => (
                <tr
                  key={t.cardId}
                  className="clickable"
                  title={tr('Open in document')}
                  onClick={() => navigate(`/rem/${t.remId}`)}
                >
                  <td className="hard-card-text">{t.text}</td>
                  <td>{Math.round(t.avgSeconds ?? 0)} s</td>
                  <td>
                    {t.forgot} / {t.answers}
                  </td>
                  <td>{formatSeconds(t.totalSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Seconds as "45 s" or "3 min". */
function formatSeconds(seconds: number): string {
  return seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}
