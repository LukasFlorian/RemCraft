/**
 * Assistant panel (replaces Fokus' Claude-Code panel, which needs a local
 * CLI): chat with any configured AI provider about the slides, with explicit
 * context chips (`@` like in Claude Code), quick actions, "→ Notizen" and
 * flashcard generation as a RemCraft card file (imported onto the slides).
 */
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Send, Trash2, X } from 'lucide-react';
import { loadAiConfig } from '@ai/openaiCompatible';
import { createAiProvider } from '@ai/registry';
import type { ChatMessage } from '@ai/provider';
import { buildContext } from '@data/lecture/context';
import type { ContextChip } from '@data/lecture/context';
import type { CardFileDoc } from '@core/lecture/cardFile';
import type { RemId } from '@core/model/types';
import { useApp } from '../app/context';
import { useToast } from '../components/Toast';
import { useLocalState } from '../hooks/useLocalState';
import { t } from '@core/i18n';

/** Props of {@link AssistantPanel}. */
export interface AssistantPanelProps {
  deckId: RemId;
  slideIndex: number;
  lectureId: string | null;
  quote?: string | undefined;
  onClose: () => void;
  onToNotes: (text: string) => void;
}

/** Quick actions with their own context. */
const ACTIONS: {
  label: string;
  prompt: string;
  chips: Exclude<ContextChip['kind'], 'range'>[];
  cards?: boolean;
}[] = [
  {
    label: 'Folie erklären',
    prompt: 'Erkläre diese Folie verständlich, mit einem Beispiel.',
    chips: ['slide'],
  },
  {
    label: 'Quiz',
    prompt:
      'Stell mir 3 Verständnisfragen zu dieser Folie, eine nach der anderen. Warte jeweils auf meine Antwort.',
    chips: ['slide'],
  },
  {
    label: 'Offene Fragen',
    prompt: 'Beantworte die offenen Fragen (Zeilen mit „?“ ohne Pfeil) aus meinen Notizen.',
    chips: ['notes'],
  },
  {
    label: 'Was nacharbeiten?',
    prompt:
      'Was sollte ich nacharbeiten? Nutze Markierungen, offene Fragen und die Vorlesungsdaten.',
    chips: ['notes', 'lecture'],
  },
  {
    label: 'Zusammenfassung',
    prompt: 'Fasse den Foliensatz in 10 Stichpunkten zusammen.',
    chips: ['deck'],
  },
  {
    label: 'Karten: diese Folie',
    prompt: 'Erstelle Karteikarten zu dieser Folie.',
    chips: ['slide', 'cards'],
    cards: true,
  },
  {
    label: 'Karten: alle Folien',
    prompt:
      'Erstelle Karteikarten zum ganzen Foliensatz (die wichtigsten Inhalte, keine Duplikate vorhandener Karten).',
    chips: ['deck', 'cards'],
    cards: true,
  },
];

/** Instructions for card generation in the RemCraft card file format. */
const CARD_INSTRUCTIONS = `Antworte NUR mit einem JSON-Codeblock im Format "remcraft-cards" Version 1:
{"format":"remcraft-cards","version":1,"cards":[{"section":"…","type":"basic|concept|cloze|mc|set|list","front":"…","back":"…","options":[{"text":"…","correct":true}],"items":["…"],"pages":[PDF-Seite],"anchor":"3-12 Wörter WÖRTLICH von der Folie","remnote":"RemNote-Zeile, z. B. Frage >> Antwort"}],"notes":[]}
Regeln: "pages" sind PDF-Seitennummern (1-basiert) aus dem Kontext; "anchor" wird wörtlich kopiert (Folientitel oder eindeutige Phrase); MC: richtige Optionen zuerst; Cloze in "remnote" mit {{…}}; Sprache der Folien.`;

/** Extracts the first JSON code block (or bare JSON) of an answer. */
export function extractJson(text: string): unknown {
  const block =
    /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ??
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(block);
}

/** The assistant panel. */
export function AssistantPanel({
  deckId,
  slideIndex,
  lectureId,
  quote,
  onClose,
  onToNotes,
}: AssistantPanelProps): ReactNode {
  const app = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const config = useMemo(() => loadAiConfig(), []);
  const [history, setHistory] = useLocalState<{ role: 'user' | 'assistant'; content: string }[]>(
    `assistant.${deckId}`,
    [],
  );
  const [chips, setChips] = useState<ContextChip[]>([{ kind: 'slide' }]);
  const [input, setInput] = useState(quote ? `„${quote}“\n` : '');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const abort = useRef<AbortController | null>(null);

  const chipLabel = (c: ContextChip): string =>
    c.kind === 'range'
      ? `@Folien ${c.from}-${c.to}`
      : {
          slide: `@Folie ${slideIndex + 1}`,
          deck: '@Ganzer Foliensatz',
          notes: '@Meine Notizen',
          cards: '@Karten',
          lecture: '@Vorlesung',
          course: '@Ganzer Kurs',
        }[c.kind];

  /** Sends a message with the chosen context. */
  const send = async (text: string, contextChips: ContextChip[], cards = false): Promise<void> => {
    if (!config) return;
    const context = buildContext(app.store, { deckId, slideIndex, lectureId }, contextChips);
    const system: ChatMessage = {
      role: 'system',
      content: `Du bist ein Lernassistent für Vorlesungen. Antworte auf Deutsch, präzise, mit Markdown. Nenne Folien als „Folie N“.\n\n${cards ? CARD_INSTRUCTIONS : ''}\n\n# Kontext\n${context || '(kein Kontext gewählt)'}`,
    };
    const messages: ChatMessage[] = [
      system,
      ...history.slice(-10),
      { role: 'user', content: text },
    ];
    setHistory((h) => [...h, { role: 'user', content: text }]);
    setBusy(true);
    setStreaming('');
    abort.current = new AbortController();
    let answer = '';
    try {
      const provider = createAiProvider(config);
      for await (const chunk of provider.stream(messages, {
        signal: abort.current.signal,
        ...(cards ? { temperature: 0.2 } : {}),
      })) {
        answer += chunk;
        setStreaming(answer);
      }
      setHistory((h) => [...h, { role: 'assistant', content: answer }]);
      if (cards) {
        const doc = extractJson(answer) as CardFileDoc;
        const res = app.lectures.importCards(
          deckId,
          doc,
          `assistent-${new Date().toISOString().slice(0, 10)}.cards.json`,
        );
        toast(`${res.cards} Karten importiert und den Folien zugeordnet`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
      setStreaming('');
    }
  };

  if (!config) {
    return (
      <aside className="assistant">
        <header className="assistant-head">
          <strong>{t('Assistant')}</strong>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <X size={16} />
          </button>
        </header>
        <div className="assistant-body">
          <p className="muted">
            {t(
              'No AI provider set up. Under Settings → AI you can connect Claude (Anthropic) or any OpenAI-compatible API with your own key.',
            )}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/settings/ai')}>
            {t('Set up')}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="assistant">
      <header className="assistant-head">
        <strong>{t('Assistant')}</strong>
        <span className="faint" style={{ fontSize: 12 }}>
          {config.model}
        </span>
        <span className="spacer" />
        <button className="icon-btn" title={t('New chat')} onClick={() => setHistory([])}>
          <Trash2 size={15} />
        </button>
        <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>
          <X size={16} />
        </button>
      </header>
      <div className="assistant-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            className="pill"
            disabled={busy}
            onClick={() =>
              void send(
                a.prompt,
                a.chips.map((kind) => ({ kind }) as ContextChip),
                a.cards,
              )
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="assistant-body">
        {history.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-text">{m.content}</div>
            {m.role === 'assistant' && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => onToNotes(m.content.split('\n')[0]!.slice(0, 500))}
              >
                {t('→ Notes')}
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant">
            <div className="chat-text">{streaming || '…'}</div>
          </div>
        )}
      </div>
      <div className="assistant-chips">
        {chips.map((c, i) => (
          <span key={i} className="chip">
            {chipLabel(c)}
            <button
              aria-label={t('Remove')}
              onClick={() => setChips(chips.filter((_, k) => k !== i))}
            >
              ×
            </button>
          </span>
        ))}
        <select
          className="select chip-select"
          value=""
          onChange={(e) => {
            const kind = e.target.value as ContextChip['kind'];
            if (kind === 'range') {
              const r = prompt('Folienbereich, z. B. 10-15');
              const m = /^(\d+)\s*-\s*(\d+)$/.exec(r ?? '');
              if (m) setChips([...chips, { kind, from: Number(m[1]), to: Number(m[2]) }]);
            } else if (kind) setChips([...chips, { kind } as ContextChip]);
          }}
        >
          <option value="">{t('@ Context')}</option>
          <option value="slide">{t('Current slide')}</option>
          <option value="range">{t('Slide range…')}</option>
          <option value="deck">{t('Whole deck')}</option>
          <option value="notes">{t('My notes')}</option>
          <option value="cards">{t('Cards')}</option>
          <option value="lecture">{t('Lecture')}</option>
          <option value="course">{t('Whole course')}</option>
        </select>
      </div>
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) void send(input.trim(), chips).then(() => setInput(''));
        }}
      >
        <textarea
          className="textarea"
          rows={3}
          value={input}
          placeholder={t('Ask something about the slides…')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' &&
            !e.shiftKey &&
            (e.preventDefault(), e.currentTarget.form?.requestSubmit())
          }
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>
            {t('Stop')}
          </button>
        ) : (
          <button className="btn btn-primary" aria-label={t('Send')}>
            <Send size={15} />
          </button>
        )}
      </form>
    </aside>
  );
}
