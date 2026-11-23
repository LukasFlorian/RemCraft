/**
 * Find and replace across Rems (a document/folder or everything): preview of
 * every change, individual changes can be left out, applied in one undo step.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { FindOptions, ReplaceChange } from '@core/edit/findReplace';
import { planReplace, remsInScope } from '@core/edit/findReplace';
import type { RemId } from '@core/model/types';
import { useApp, useSelector } from '../app/context';
import { useModals } from '../app/modals';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useRemTitle } from '../hooks/useRemTitle';
import { t } from '@core/i18n';

/** Changes shown in the preview at most (all are applied). */
const PREVIEW_LIMIT = 300;

/** Key of a change (a Rem field). */
const keyOf = (c: ReplaceChange): string => `${c.remId}:${c.field}`;

/** The dialog. */
export function ReplaceDialog({
  rootId,
  initialQuery = '',
  onClose,
}: {
  /** Scope: a document/folder, `null` for the whole knowledge base. */
  rootId: RemId | null;
  /** Prefilled search text (e.g. from the search dialog). */
  initialQuery?: string | undefined;
  onClose: () => void;
}): ReactNode {
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const modals = useModals();
  const scopeTitle = useRemTitle(rootId, t('Untitled'));
  const [scope, setScope] = useState<'doc' | 'all'>(rootId ? 'doc' : 'all');
  const [opts, setOpts] = useState<FindOptions>({
    query: initialQuery,
    replacement: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const remsVersion = useSelector((s) => s.collectionVersion('rems'));

  // The plan is recomputed while typing (and when Rems change).
  const plan = useMemo(() => {
    if (!opts.query) return [];
    const rems = remsInScope(app.store, scope === 'doc' ? rootId : null, app.store.all('rems'));
    return planReplace(rems, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, opts, scope, rootId, remsVersion]);
  const changes = typeof plan === 'string' ? [] : plan;
  const chosen = changes.filter((c) => !skipped.has(keyOf(c)));
  const occurrences = chosen.reduce((n, c) => n + c.count, 0);

  const set = (patch: Partial<FindOptions>): void => {
    setOpts((o) => ({ ...o, ...patch }));
    setSkipped(new Set());
  };
  const apply = (): void => {
    const n = app.rems.applyReplace(chosen);
    toast(
      t('Replaced {occurrences} occurrence(s) in {n} Rem(s) – undo with ⌘Z', { occurrences, n }),
    );
    onClose();
  };
  const toggle = (c: ReplaceChange): void =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(keyOf(c))) next.delete(keyOf(c));
      else next.add(keyOf(c));
      return next;
    });

  return (
    <Modal title={t('Find & replace')} onClose={onClose} wide>
      <div className="replace-dialog">
        <div className="replace-fields">
          <input
            className="input"
            autoFocus
            placeholder={t('Find')}
            value={opts.query}
            onChange={(e) => set({ query: e.target.value })}
            aria-label={t('Find')}
          />
          <input
            className="input"
            placeholder={t('Replace with')}
            value={opts.replacement}
            onChange={(e) => set({ replacement: e.target.value })}
            aria-label={t('Replace with')}
          />
        </div>
        <div className="replace-options">
          <label>
            <input
              type="checkbox"
              checked={Boolean(opts.caseSensitive)}
              onChange={(e) => set({ caseSensitive: e.target.checked })}
            />{' '}
            {t('Match case')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(opts.wholeWord)}
              onChange={(e) => set({ wholeWord: e.target.checked })}
            />{' '}
            {t('Whole word')}
          </label>
          <label title={t('Regular expressions; in the replacement $1, $2 … refer to groups')}>
            <input
              type="checkbox"
              checked={Boolean(opts.regex)}
              onChange={(e) => set({ regex: e.target.checked })}
            />{' '}
            {t('Regex')}
          </label>
          {rootId && (
            <select
              className="select"
              value={scope}
              onChange={(e) => (setScope(e.target.value as 'doc' | 'all'), setSkipped(new Set()))}
              aria-label={t('Applies to')}
            >
              <option value="doc">
                {t('In “')}
                {scopeTitle}“
              </option>
              <option value="all">{t('Everywhere')}</option>
            </select>
          )}
        </div>
        {typeof plan === 'string' && opts.query && <div className="type-result bad">{plan}</div>}
        {opts.query && typeof plan !== 'string' && (
          <div className="muted replace-summary">
            {changes.length === 0
              ? t('No matches.')
              : t(
                  '{occurrences} matches selected in {length} of {2} fields (fronts and backs; formatting is kept).',
                  { occurrences, length: chosen.length, '2': changes.length },
                )}
          </div>
        )}
        {changes.length > 0 && (
          <ul className="replace-list">
            {changes.slice(0, PREVIEW_LIMIT).map((c) => (
              <li key={keyOf(c)} className={skipped.has(keyOf(c)) ? 'is-skipped' : ''}>
                <input
                  type="checkbox"
                  checked={!skipped.has(keyOf(c))}
                  onChange={() => toggle(c)}
                  aria-label={t('Apply this change')}
                />
                <button
                  className="replace-preview"
                  title={t('Open in document')}
                  onClick={() => {
                    onClose();
                    const doc = [...app.rems.path(c.remId)].reverse().find((r) => r.isDocument);
                    navigate(
                      doc && doc.id !== c.remId
                        ? `/rem/${doc.id}?focus=${c.remId}`
                        : `/rem/${c.remId}`,
                    );
                  }}
                >
                  <span className="replace-before">{c.beforeText}</span>
                  <span className="replace-after">{c.afterText}</span>
                  {c.field === 'back' && <span className="badge">{t('Back side')}</span>}
                </button>
              </li>
            ))}
            {changes.length > PREVIEW_LIMIT && (
              <li className="faint">
                {t('… and')} {changes.length - PREVIEW_LIMIT} {t('more')}
              </li>
            )}
          </ul>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {rootId && (
            <button
              className="btn btn-ghost"
              title={t('For changes that cannot be expressed as find & replace')}
              onClick={() => {
                onClose();
                modals.open({ kind: 'ai-edit', rootId });
              }}
            >
              {t('Revise with AI…')}
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" disabled={chosen.length === 0} onClick={apply}>
            {occurrences > 0 ? t('Replace {occurrences}', { occurrences }) : t('Replace')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
