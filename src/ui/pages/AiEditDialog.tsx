/**
 * AI editing ("Mit KI überarbeiten"): an instruction in plain words is applied
 * to a document or folder by a language model. The model proposes changes,
 * which are shown as a preview (each one can be left out) and applied in one
 * undo step. See `core/ai/editPlan.ts`.
 */
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { loadAiConfig } from '@ai/openaiCompatible';
import { createAiProvider } from '@ai/registry';
import type { EditOp } from '@core/ai/editPlan';
import {
  batchEntries,
  EDIT_SYSTEM_PROMPT,
  editUserPrompt,
  parseEditAnswer,
  scopeEntries,
} from '@core/ai/editPlan';
import type { RemId } from '@core/model/types';
import { useApp } from '../app/context';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useRemTitle } from '../hooks/useRemTitle';
import { t } from '@core/i18n';

/** Example instructions (tap to use). */
const EXAMPLES = [
  t('Rephrase all cards with "::" as normal question-answer cards (">>").'),
  t(
    'Turn cards whose answer is a comma-separated enumeration into list cards (">>>") with one child per item.',
  ),
  t('Fix typos and grammar without changing the content.'),
  t('Add two plausible wrong answers to multiple-choice questions without wrong options.'),
];

/** Label of an operation for the preview. */
function describe(op: EditOp): { kind: string; before?: string; after?: string } {
  if (op.op === 'add') return { kind: 'Neu', after: op.line };
  if (op.op === 'delete') return { kind: 'Löschen', before: op.before };
  if (op.line !== undefined)
    return {
      kind:
        op.correct === undefined
          ? t('Change')
          : `Ändern · Option ${op.correct ? 'richtig' : 'falsch'}`,
      before: op.before,
      after: op.line,
    };
  return { kind: `Option als ${op.correct ? 'richtig' : 'falsch'} markieren`, before: op.before };
}

/** The dialog. */
export function AiEditDialog({
  rootId,
  onClose,
}: {
  rootId: RemId;
  onClose: () => void;
}): ReactNode {
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const title = useRemTitle(rootId, t('Untitled'));
  const config = useMemo(() => loadAiConfig(), []);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    ops: EditOp[];
    summaries: string[];
    warnings: string[];
  } | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const entries = useMemo(() => scopeEntries(app.store, rootId), [app, rootId]);
  const batches = useMemo(() => batchEntries(entries), [entries]);

  /** Asks the model, batch by batch. */
  const run = async (): Promise<void> => {
    if (!config || !instruction.trim()) return;
    const provider = createAiProvider(config);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setResult(null);
    setSkipped(new Set());
    const ops: EditOp[] = [];
    const summaries: string[] = [];
    const warnings: string[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        setBusy({ done: i, total: batches.length });
        const answer = await provider.complete(
          [
            { role: 'system', content: EDIT_SYSTEM_PROMPT },
            { role: 'user', content: editUserPrompt(instruction.trim(), batches[i]!) },
          ],
          { json: true, temperature: 0.2, maxTokens: 8000, signal: ctrl.signal },
        );
        const parsed = parseEditAnswer(answer, batches[i]!);
        ops.push(...parsed.ops);
        if (parsed.summary) summaries.push(parsed.summary);
        warnings.push(...parsed.warnings);
      }
      setResult({ ops, summaries, warnings });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      // Keep what earlier batches proposed.
      if (ops.length > 0) setResult({ ops, summaries, warnings });
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const chosen = result ? result.ops.filter((_, i) => !skipped.has(i)) : [];
  const apply = (): void => {
    const n = app.io.applyEdits(chosen);
    toast(t('{n} change(s) applied – undo with ⌘Z', { n }));
    onClose();
  };

  if (!config)
    return (
      <Modal title={t('Revise with AI')} onClose={onClose}>
        <p>{t('This needs access to a language model (e.g. Claude or OpenAI).')}</p>
        <button className="btn btn-primary" onClick={() => (onClose(), navigate('/settings/ai'))}>
          {t('Set up AI')}
        </button>
      </Modal>
    );

  return (
    <Modal title={t('Revise with AI')} onClose={() => (abort.current?.abort(), onClose())} wide>
      <div className="ai-edit">
        <p className="muted" style={{ margin: 0 }}>
          {t('Applies to:')} <strong>{title}</strong> · {entries.length} {t('Rems')}
          {batches.length > 1 ? t(' · {length} requests', { length: batches.length }) : ''}
          {t('. The AI suggests changes; you review them before anything is applied.')}
        </p>
        <textarea
          className="input ai-edit-input"
          rows={3}
          autoFocus
          placeholder={t('What should be changed? e.g. “Turn all :: cards into normal >> cards”')}
          value={instruction}
          disabled={busy !== null}
          onChange={(e) => setInstruction(e.target.value)}
          aria-label={t('Instruction')}
        />
        {!result && !busy && (
          <div className="ai-edit-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="pill" onClick={() => setInstruction(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!instruction.trim() || busy !== null}
            onClick={() => void run()}
          >
            <Sparkles size={15} /> {result ? t('Suggest again') : t('Get suggestions')}
          </button>
          {busy && (
            <>
              <span className="muted">
                {t('The AI is working …')}{' '}
                {busy.total > 1 ? `(${busy.done + 1}/${busy.total})` : ''}
              </span>
              <button className="btn btn-sm" onClick={() => abort.current?.abort()}>
                {t('Cancel')}
              </button>
            </>
          )}
        </div>
        {error && <div className="type-result bad">{error}</div>}
        {result && (
          <>
            {result.summaries.length > 0 && (
              <div className="muted ai-edit-summary">{result.summaries.join(' ')}</div>
            )}
            {result.ops.length === 0 ? (
              <p className="muted">{t('No changes suggested.')}</p>
            ) : (
              <ul className="replace-list ai-edit-list">
                {result.ops.map((op, i) => {
                  const d = describe(op);
                  return (
                    <li key={i} className={skipped.has(i) ? 'is-skipped' : ''}>
                      <input
                        type="checkbox"
                        checked={!skipped.has(i)}
                        aria-label={t('Apply this change')}
                        onChange={() =>
                          setSkipped((s) => {
                            const next = new Set(s);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                      <div className={`replace-preview is-${op.op}`}>
                        <span className="badge">{d.kind}</span>
                        {d.before !== undefined && (
                          <span className="replace-before">{d.before}</span>
                        )}
                        {d.after !== undefined && <span className="replace-after">{d.after}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {result.warnings.length > 0 && (
              <div className="faint" style={{ fontSize: 12 }}>
                {result.warnings.length}{' '}
                {t('suggestion(s) of the AI were invalid and have been left out.')}
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>
                {t('Discard')}
              </button>
              <button className="btn btn-primary" disabled={chosen.length === 0} onClick={apply}>
                {t('Apply {n}', { n: chosen.length })}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
