/**
 * Flashcard configuration popover of a Rem: card list with scheduling state,
 * direction, cloze hints/merging and per-card actions.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { cardTypeLabel, generateCards } from '@core/cards/generate';
import type { CardDirection, Rem } from '@core/model/types';
import { clozeIds, mergeClozes, splitCloze, toPlainText } from '@core/richtext/ops';
import { newId } from '@core/util/ids';
import { formatInterval } from '@core/util/time';
import { useApp, useChildren, useSelector } from '../app/context';
import { useToast } from '../components/Toast';

/** Props of {@link CardPopover}. */
export interface CardPopoverProps {
  rem: Rem;
  anchor: HTMLElement;
  onClose: () => void;
}

/** Popover with card details and configuration. */
export function CardPopover({ rem, anchor, onClose }: CardPopoverProps): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const children = useChildren(rem.id);
  const cards = generateCards(rem, children);
  const states = useSelector((s) => s.memo(`cardStates:${rem.id}`, [s.collectionVersion('cards'), cards.map((c) => c.id).join()], () => cards.map((c) => app.practice.stateOf(c.id))));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [mergeSel, setMergeSel] = useState<string[]>([]);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const el = ref.current!;
    const left = Math.min(Math.max(8, r.right - el.offsetWidth), window.innerWidth - el.offsetWidth - 8);
    let top = r.bottom + 6;
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 6);
    setPos({ left, top });
  }, [anchor]);

  const ids = clozeIds(rem.text);
  const setDirection = (direction: CardDirection): void => app.rems.update(rem.id, { direction });

  return createPortal(
    <>
      <div className="popover-backdrop" onMouseDown={onClose} />
      <div ref={ref} className="popover card-popover" style={pos} onMouseDown={(e) => e.stopPropagation()}>
        <div className="popover-title">Flashcards</div>
        {rem.direction !== 'none' && (
          <div className="segmented" role="group" aria-label="Direction">
            {(['forward', 'backward', 'both', 'disabled'] as CardDirection[])
              .filter((d) => rem.answerMode !== 'mc' || d === 'forward' || d === 'disabled')
              .map((d) => (
                <button key={d} className={rem.direction === d ? 'active' : ''} onClick={() => setDirection(d)}>
                  {d === 'forward' ? '→ Forward' : d === 'backward' ? '← Backward' : d === 'both' ? '↔ Both' : '⇸ Off'}
                </button>
              ))}
          </div>
        )}
        <table className="table compact">
          <tbody>
            {cards.map((c, i) => {
              const st = states[i];
              return (
                <tr key={c.id}>
                  <td>{cardTypeLabel(rem, c, children)}</td>
                  <td className="muted">
                    {!st || st.phase === 'new' ? 'new' : st.disabled ? 'disabled' : `${st.phase} · next ${st.due <= Date.now() ? 'now' : formatInterval(st.due - Date.now())}`}
                  </td>
                  <td className="muted">{st ? `${st.reps}×` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {ids.length > 0 && (
          <div className="col">
            <div className="popover-subtitle">Clozes</div>
            {ids.map((id) => {
              const text = toPlainText(rem.text.filter((s) => s.marks?.cloze === id));
              const runs = rem.text.reduce((n, s, i, arr) => (s.marks?.cloze === id && arr[i - 1]?.marks?.cloze !== id ? n + 1 : n), 0);
              return (
                <div key={id} className="row cloze-row">
                  <input type="checkbox" checked={mergeSel.includes(id)} onChange={(e) => setMergeSel((m) => (e.target.checked ? [...m, id] : m.filter((x) => x !== id)))} aria-label="Select for merge" />
                  <span className="cloze ellipsis" style={{ maxWidth: 120 }}>
                    {text}
                  </span>
                  <input
                    className="input"
                    style={{ height: 28 }}
                    placeholder="hint"
                    defaultValue={rem.clozeHints?.[id] ?? ''}
                    onBlur={(e) => {
                      const hints = { ...rem.clozeHints };
                      if (e.target.value.trim()) hints[id] = e.target.value.trim();
                      else delete hints[id];
                      app.rems.update(rem.id, { clozeHints: Object.keys(hints).length ? hints : undefined });
                    }}
                  />
                  {runs > 1 && (
                    <button className="btn btn-sm" onClick={() => app.rems.update(rem.id, { text: splitCloze(rem.text, id, () => newId(8)) })}>
                      Split
                    </button>
                  )}
                </div>
              );
            })}
            {mergeSel.length > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  app.rems.update(rem.id, { text: mergeClozes(rem.text, mergeSel) });
                  setMergeSel([]);
                }}
              >
                Merge {mergeSel.length} clozes into one card
              </button>
            )}
          </div>
        )}

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => navigate(`/practice?scope=${rem.id}&mode=all-in-order`)}>
            Practice
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              app.practice.reset(cards.map((c) => c.id));
              toast('Progress reset');
            }}
          >
            Reset
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              const allDisabled = states.every((s) => s?.disabled);
              app.practice.setDisabled(
                cards.map((c) => c.id),
                !allDisabled,
              );
            }}
          >
            {states.every((s) => s?.disabled) ? 'Enable' : 'Disable'}
          </button>
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={Boolean(rem.typeInAnswer)} onChange={(e) => app.rems.update(rem.id, { typeInAnswer: e.target.checked || undefined })} />
            Type answer
          </label>
        </div>
      </div>
    </>,
    document.body,
  );
}
