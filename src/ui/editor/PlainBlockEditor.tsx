/**
 * Plain-text editor for code blocks and display-math (LaTeX) blocks.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RemId } from '@core/model/types';
import { rt, toPlainText } from '@core/richtext/ops';
import { useApp, useRem } from '../app/context';
import { isMod } from '../hooks/useHotkeys';
import { Latex } from '../richtext/Latex';
import { useController } from './controller';

/** Props of {@link PlainBlockEditor}. */
export interface PlainBlockEditorProps {
  remId: RemId;
  instance: string;
  nonce: number;
}

/** Textarea-based editor for code and LaTeX blocks. */
export function PlainBlockEditor({ remId, instance, nonce }: PlainBlockEditorProps): ReactNode {
  const app = useApp();
  const controller = useController();
  const rem = useRem(remId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const source = rem
    ? rem.latexBlock
      ? rem.text
          .map((s) => (s.type === 'latex' ? s.source : s.type === 'text' ? s.text : ''))
          .join('')
      : toPlainText(rem.text)
    : '';
  const [value, setValue] = useState(source);

  // Keep in sync with external changes.
  useEffect(() => setValue(source), [source]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  useEffect(() => {
    ref.current?.focus();
  }, [nonce]);

  if (!rem) return null;

  /** Writes the value to the Rem. */
  const commit = (next: string): void => {
    setValue(next);
    const text = rem.latexBlock ? [{ type: 'latex' as const, source: next }] : rt(next);
    app.rems.update(remId, { text }, `text:${remId}`);
  };

  return (
    <div className={rem.code ? 'code-editor' : 'latex-editor'}>
      {rem.code && (
        <input
          className="code-language"
          placeholder="language"
          value={rem.code.language}
          onChange={(e) => app.rems.update(remId, { code: { language: e.target.value } })}
        />
      )}
      <textarea
        ref={ref}
        className="plain-editor"
        spellCheck={false}
        value={value}
        placeholder={rem.code ? 'Code…' : 'LaTeX, e.g. \\int_0^1 x^2 dx'}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && isMod(e))) {
            e.preventDefault();
            controller.select(instance, [remId]);
          } else if (e.key === 'Tab' && rem.code) {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: s, selectionEnd: t } = el;
            commit(value.slice(0, s) + '  ' + value.slice(t));
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          } else if (e.key === 'Backspace' && value === '') {
            e.preventDefault();
            app.rems.update(remId, { code: undefined, latexBlock: undefined, text: [] });
          } else if ((e.key === 'z' || e.key === 'Z') && isMod(e)) {
            e.preventDefault();
            if (e.shiftKey) app.store.redo();
            else app.store.undo();
          }
        }}
      />
      {rem.latexBlock && value && (
        <div className="latex-preview">
          <Latex source={value} display />
        </div>
      )}
    </div>
  );
}
