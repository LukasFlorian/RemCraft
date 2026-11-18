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

/** Example instructions (tap to use). */
const EXAMPLES = [
  'Formuliere alle Karten mit "::" als normale Frage-Antwort-Karten (">>") um.',
  'Mach aus Karten, deren Antwort eine Aufzählung mit Kommas ist, Listen-Karten (">>>") mit einem Unterpunkt je Eintrag.',
  'Korrigiere Tippfehler und Grammatik, ohne den Inhalt zu ändern.',
  'Ergänze bei Multiple-Choice-Fragen ohne falsche Optionen zwei plausible falsche Antworten.',
];

/** Label of an operation for the preview. */
function describe(op: EditOp): { kind: string; before?: string; after?: string } {
  if (op.op === 'add') return { kind: 'Neu', after: op.line };
  if (op.op === 'delete') return { kind: 'Löschen', before: op.before };
  if (op.line !== undefined)
    return {
      kind:
        op.correct === undefined
          ? 'Ändern'
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
  const title = useRemTitle(rootId, 'Ohne Titel');
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
    toast(`${n} Änderung(en) übernommen – Rückgängig mit ⌘Z`);
    onClose();
  };

  if (!config)
    return (
      <Modal title="Mit KI überarbeiten" onClose={onClose}>
        <p>Dafür braucht RemCraft einen Zugang zu einem Sprachmodell (z. B. Claude oder OpenAI).</p>
        <button className="btn btn-primary" onClick={() => (onClose(), navigate('/settings/ai'))}>
          KI einrichten
        </button>
      </Modal>
    );

  return (
    <Modal title="Mit KI überarbeiten" onClose={() => (abort.current?.abort(), onClose())} wide>
      <div className="ai-edit">
        <p className="muted" style={{ margin: 0 }}>
          Bereich: <strong>{title}</strong> · {entries.length} Rems
          {batches.length > 1 ? ` · ${batches.length} Anfragen` : ''}. Die KI schlägt Änderungen
          vor; du prüfst sie, bevor etwas übernommen wird.
        </p>
        <textarea
          className="input ai-edit-input"
          rows={3}
          autoFocus
          placeholder="Was soll geändert werden? z. B. „Mach aus allen ::-Karten normale >>-Karten“"
          value={instruction}
          disabled={busy !== null}
          onChange={(e) => setInstruction(e.target.value)}
          aria-label="Anweisung"
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
            <Sparkles size={15} /> {result ? 'Neu vorschlagen' : 'Vorschläge holen'}
          </button>
          {busy && (
            <>
              <span className="muted">
                Die KI arbeitet … {busy.total > 1 ? `(${busy.done + 1}/${busy.total})` : ''}
              </span>
              <button className="btn btn-sm" onClick={() => abort.current?.abort()}>
                Abbrechen
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
              <p className="muted">Keine Änderungen vorgeschlagen.</p>
            ) : (
              <ul className="replace-list ai-edit-list">
                {result.ops.map((op, i) => {
                  const d = describe(op);
                  return (
                    <li key={i} className={skipped.has(i) ? 'is-skipped' : ''}>
                      <input
                        type="checkbox"
                        checked={!skipped.has(i)}
                        aria-label="Diese Änderung übernehmen"
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
                {result.warnings.length} Vorschlag/Vorschläge der KI waren ungültig und wurden
                ausgelassen.
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>
                Verwerfen
              </button>
              <button className="btn btn-primary" disabled={chosen.length === 0} onClick={apply}>
                {chosen.length} übernehmen
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
