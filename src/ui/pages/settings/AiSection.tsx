/**
 * AI provider configuration (extension point; no AI features yet).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { loadAiConfig, saveAiConfig } from '@ai/openaiCompatible';
import { AI_PROVIDERS, createAiProvider } from '@ai/registry';
import { Field } from '../../components/Controls';
import { useToast } from '../../components/Toast';

/** AI settings. */
export function AiSection(): ReactNode {
  const toast = useToast();
  const initial = loadAiConfig();
  const [provider, setProvider] = useState(initial?.provider ?? 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [testing, setTesting] = useState(false);
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2 className="card-title">AI provider (experimental)</h2>
      <p className="muted" style={{ margin: 0 }}>
        The lecture assistant (slides, notes, card generation) uses this provider: Claude via the
        Anthropic API or any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Mistral, a local
        Ollama/LM Studio server, …) can be configured here for future features. The key is stored
        only on this device and never synchronised.
      </p>
      <Field label="Anbieter">
        <select
          className="select"
          value={provider}
          onChange={(e) => {
            const p = AI_PROVIDERS.get(e.target.value);
            setProvider(e.target.value);
            if (p) {
              setBaseUrl(p.defaultBaseUrl);
              setModel(p.defaultModel);
            }
          }}
        >
          {AI_PROVIDERS.list().map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Base URL">
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </Field>
      <Field label="API key">
        <input
          className="input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Model">
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. gpt-4o-mini, llama3.1"
        />
      </Field>
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={() => {
            saveAiConfig(model ? { provider, baseUrl, apiKey, model } : null);
            toast('Saved on this device');
          }}
        >
          Save
        </button>
        <button
          className="btn"
          disabled={testing || !model}
          onClick={async () => {
            setTesting(true);
            try {
              const answer = await createAiProvider({ provider, baseUrl, apiKey, model }).complete(
                [{ role: 'user', content: 'Reply with the single word: pong' }],
                {
                  maxTokens: 5,
                },
              );
              toast(`Provider answered: ${answer.trim() || '(empty)'}`);
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), 'error');
            } finally {
              setTesting(false);
            }
          }}
        >
          Test connection
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            saveAiConfig(null);
            setApiKey('');
            toast('Removed');
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
