/**
 * Global search (⌘K): find any Rem and jump to it, or create a document.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { RemIcon } from '../components/RemIcon';
import type { RemId } from '@core/model/types';
import { useApp, useSelector } from '../app/context';
import { useModals } from '../app/modals';
import { Modal } from '../components/Modal';
import { searchStore } from '../hooks/search';
import { useRemTitle } from '../hooks/useRemTitle';
import { RichTextView } from '../richtext/RichTextView';
import { parseSearchQuery } from '@core/search/search';
import { findMatches, snippet } from '@core/search/highlight';
import { toPlainText } from '@core/richtext/ops';
import { useTextHighlight } from '../hooks/useTextHighlight';
import { t } from '@core/i18n';

/** The search dialog. */
export function SearchDialog({ onClose }: { onClose: () => void }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const modals = useModals();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const hits = useSelector((s) => (query.trim() ? searchStore(s, query, 40) : null));
  const recent = useSelector((s) =>
    s.memo('recentForSearch', [s.collectionVersion('rems')], () =>
      [...s.all('rems')]
        .filter((r) => r.isDocument)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10),
    ),
  );
  const ids = hits ? hits.map((h) => h.remId) : recent.map((r) => r.id);
  // Words to highlight in the results (not #tags or is: filters).
  const terms = useMemo(() => parseSearchQuery(query).terms, [query]);
  const total = ids.length + (query.trim() ? 1 : 0);
  useEffect(() => setIndex(0), [query]);

  /** Opens a Rem (documents directly, other Rems inside their document). */
  const open = (id: RemId): void => {
    const rem = app.store.get(id);
    if (!rem) return;
    const doc = rem.isDocument ? rem : [...app.rems.path(id)].reverse().find((r) => r.isDocument);
    // Inside a document: open it and scroll to the Rem.
    navigate(doc && doc.id !== id ? `/rem/${doc.id}?focus=${id}` : `/rem/${doc?.id ?? id}`);
    onClose();
  };
  const create = (): void => {
    const doc = app.rems.createDocument(null, query.trim());
    navigate(`/rem/${doc.id}`);
    onClose();
  };

  return (
    <Modal title={t('Search')} onClose={onClose} wide>
      <div className="search-input-row">
        <Search size={18} className="faint" />
        <input
          className="input search-input"
          autoFocus
          placeholder={t('Search Rems… (try #tag, is:card, is:todo)')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, total - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (index < ids.length) open(ids[index]!);
              else if (query.trim()) create();
            }
          }}
        />
        <button
          className="btn btn-sm btn-ghost"
          title={t('Find & replace (⌘⇧H)')}
          onClick={() => {
            onClose();
            modals.open({ kind: 'replace', rootId: null, query: query.trim() });
          }}
        >
          {t('Replace…')}
        </button>
      </div>
      <div className="search-results">
        {!hits && <div className="menu-label">{t('Recent documents')}</div>}
        {hits && hits.length === 0 && (
          <div className="faint" style={{ padding: 8 }}>
            {t('No results.')}
          </div>
        )}
        {ids.map((id, i) => (
          <SearchResult
            key={id}
            remId={id}
            terms={hits ? terms : []}
            active={i === index}
            onHover={() => setIndex(i)}
            onOpen={() => open(id)}
          />
        ))}
        {query.trim() && (
          <button
            className={`menu-item${index === ids.length ? ' active' : ''}`}
            onMouseEnter={() => setIndex(ids.length)}
            onClick={create}
          >
            <Plus size={16} /> {t('Create document “')}
            {query.trim()}”
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Matches further in than this many characters are likely cut off: show a snippet. */
const SNIPPET_AFTER = 50;

function SearchResult({
  remId,
  terms,
  active,
  onHover,
  onOpen,
}: {
  remId: RemId;
  /** Search terms to highlight. */
  terms: readonly string[];
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
}): ReactNode {
  const app = useApp();
  const rem = useSelector((s) => s.get(remId));
  const parent = useRemTitle(rem?.parentId ?? null, '');
  const textRef = useRef<HTMLSpanElement>(null);
  useTextHighlight(textRef, terms, rem);
  // Plain text of the result, for a snippet when the match would be cut off.
  const plain = rem
    ? toPlainText(rem.text) + (rem.back?.length ? ` → ${toPlainText(rem.back)}` : '')
    : '';
  const matches = terms.length > 0 ? findMatches(plain, terms) : [];
  const excerpt =
    matches.length > 0 && matches[0]![0] > SNIPPET_AFTER ? snippet(plain, matches) : null;
  if (!rem) return null;
  void app;
  return (
    <button
      className={`menu-item search-result${active ? ' active' : ''}`}
      onMouseEnter={onHover}
      onClick={onOpen}
      ref={(el) => {
        if (active) el?.scrollIntoView({ block: 'nearest' });
      }}
    >
      <RemIcon rem={rem} size={16} />
      <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
        <span className="ellipsis" ref={textRef}>
          <RichTextView value={rem.text} inertRefs />
          {rem.back && rem.back.length > 0 && (
            <>
              <span className="separator">→</span>
              <RichTextView value={rem.back} inertRefs />
            </>
          )}
        </span>
        {excerpt && (
          <span className="search-snippet" data-testid="search-snippet">
            {excerpt.map((p, i) =>
              p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
            )}
          </span>
        )}
        {parent && (
          <span className="faint ellipsis" style={{ fontSize: 12 }}>
            {parent}
          </span>
        )}
      </span>
    </button>
  );
}
