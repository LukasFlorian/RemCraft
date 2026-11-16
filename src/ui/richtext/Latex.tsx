/**
 * KaTeX rendering of LaTeX formulas.
 */
import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** Renders LaTeX to HTML (errors are shown inline instead of throwing). */
export function renderLatex(source: string, displayMode = false): string {
  try {
    return katex.renderToString(source || '\\square', { displayMode, throwOnError: false, strict: 'ignore', trust: false });
  } catch {
    return `<span class="latex-error">${source.replace(/</g, '&lt;')}</span>`;
  }
}

/** A formula. */
export const Latex = memo(function Latex({ source, display = false }: { source: string; display?: boolean }): ReactNode {
  const html = useMemo(() => renderLatex(source, display), [source, display]);
  return <span className={display ? 'latex latex-block' : 'latex'} dangerouslySetInnerHTML={{ __html: html }} />;
});
