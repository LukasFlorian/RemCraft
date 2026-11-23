/**
 * Card browser: search, filter and manage every flashcard.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { cardTypeLabel } from '@core/cards/generate';
import type { CardId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { fold } from '@core/search/search';
import { formatInterval } from '@core/util/time';
import { cardStateOf, selectCardIndex } from '@data/selectors';
import { useApp, useNow, useSelector } from '../../app/context';
import { t } from '@core/i18n';

type StateFilter = 'all' | 'new' | 'learning' | 'review' | 'due' | 'disabled';
const PAGE = 100;

/** The cards tab. */
export function CardsTab(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<StateFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<CardId>>(new Set());

  const rows = useSelector((s) =>
    s.memo('cardRows', [s.collectionVersion('rems'), s.collectionVersion('cards')], () =>
      selectCardIndex(s).specs.map((spec) => {
        const rem = s.get(spec.remId)!;
        const st = cardStateOf(s, spec);
        const resolve = (id: string): string => toPlainText(s.get(id)?.text ?? []);
        return {
          spec,
          state: st,
          front: toPlainText(rem.text, resolve),
          back: rem.back ? toPlainText(rem.back, resolve) : '',
          type: cardTypeLabel(rem, spec, s.children(rem.id)),
          doc: [...app.rems.path(rem.id)].reverse().find((r) => r.isDocument),
        };
      }),
    ),
  );

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((r) => {
      if (q && !fold(`${r.front} ${r.back} ${r.doc ? app.rems.title(r.doc.id) : ''}`).includes(q))
        return false;
      switch (state) {
        case 'new':
          return r.state.phase === 'new' && !r.state.disabled;
        case 'learning':
          return (
            (r.state.phase === 'learning' || r.state.phase === 'relearning') && !r.state.disabled
          );
        case 'review':
          return r.state.phase === 'review' && !r.state.disabled;
        case 'due':
          return r.state.phase !== 'new' && r.state.due <= now && !r.state.disabled;
        case 'disabled':
          return Boolean(r.state.disabled);
        default:
          return true;
      }
    });
  }, [rows, query, state, now, app]);

  const ids = [...selected];
  const toggle = (id: CardId): void =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder={t('Search cards')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('Search cards')}
        />
        {(['all', 'new', 'learning', 'review', 'due', 'disabled'] as StateFilter[]).map((f) => (
          <button
            key={f}
            className={`pill${state === f ? ' active' : ''}`}
            onClick={() => setState(f)}
          >
            {f[0]!.toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="spacer" />
        <span className="muted">
          {filtered.length} {t('cards')}
        </span>
      </div>
      {ids.length > 0 && (
        <div className="row bulk-bar">
          <span>
            {ids.length} {t('selected')}
          </span>
          <button className="btn btn-sm" onClick={() => app.practice.reset(ids)}>
            {t('Reset')}
          </button>
          <button className="btn btn-sm" onClick={() => app.practice.setDisabled(ids, true)}>
            {t('Disable')}
          </button>
          <button className="btn btn-sm" onClick={() => app.practice.setDisabled(ids, false)}>
            {t('Enable')}
          </button>
          <button className="btn btn-sm" onClick={() => app.practice.setDue(ids, Date.now())}>
            {t('Make due now')}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
            {t('Clear')}
          </button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="table cards-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label={t('Select all')}
                  checked={
                    filtered.length > 0 &&
                    filtered.slice(0, limit).every((r) => selected.has(r.spec.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(filtered.slice(0, limit).map((r) => r.spec.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th>{t('Front')}</th>
              <th>{t('Back side')}</th>
              <th>{t('Type')}</th>
              <th>{t('State')}</th>
              <th>{t('Due')}</th>
              <th>{t('Interval')}</th>
              <th>{t('Reps')}</th>
              <th>{t('Lapses')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.spec.id} className={r.state.disabled ? 'is-disabled' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.spec.id)}
                    onChange={() => toggle(r.spec.id)}
                    aria-label={t('Select card')}
                  />
                </td>
                <td>
                  <button
                    className="link-plain cell-text"
                    onClick={() => navigate(`/rem/${r.doc?.id ?? r.spec.remId}`)}
                    title={r.doc ? app.rems.title(r.doc.id) : ''}
                  >
                    {r.front || '—'}
                  </button>
                </td>
                <td className="muted cell-text">{r.back}</td>
                <td className="nowrap">{r.type}</td>
                <td>
                  {r.state.disabled ? (
                    <span className="badge">{t('disabled')}</span>
                  ) : (
                    <span
                      className={`badge ${r.state.phase === 'review' ? 'badge-success' : r.state.phase === 'new' ? 'badge-accent' : 'badge-warning'}`}
                    >
                      {r.state.phase}
                    </span>
                  )}
                </td>
                <td className="nowrap muted">
                  {r.state.phase === 'new'
                    ? '—'
                    : r.state.due <= now
                      ? t('now')
                      : t('in {0}', { '0': formatInterval(r.state.due - now) })}
                </td>
                <td className="nowrap muted">
                  {r.state.interval ? `${Math.round(r.state.interval)}d` : '—'}
                </td>
                <td className="muted">{r.state.reps}</td>
                <td className="muted">{r.state.lapses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          {t('Show more (')}
          {filtered.length - limit} {t('remaining)')}
        </button>
      )}
      {filtered.length === 0 && <div className="empty">{t('No cards match.')}</div>}
    </div>
  );
}
