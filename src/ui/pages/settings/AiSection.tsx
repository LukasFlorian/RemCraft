/**
 * AI provider configuration (extension point; no AI features yet).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { createOpenAiCompatibleProvider, loadAiConfig, saveAiConfig } from '@ai/openaiCompatible';
import { Field } from '../../components/Controls';
import { useToast } from '../../components/Toast';

/** AI settings. */
export function AiSection(): ReactNode {
  const toast = useToast();
  const initial = loadAiConfig();
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [testing, setTesting] = useState(false);
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2 className="card-title">AI provider (experimental)</h2>
      <p className="muted" style={{ margin: 0 }}>
        RemCraft has no AI features yet, but any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Mistral, a local Ollama/LM Studio server, …) can be configured here for future features. The key is stored only on this device and never synchronised.
      </p>
      <Field label="Base URL">
        <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
      </Field>
      <Field label="API key">
        <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Model">
        <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gpt-4o-mini, llama3.1" />
      </Field>
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={() => {
            saveAiConfig(baseUrl && model ? { baseUrl, apiKey, model } : null);
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
              const answer = await createOpenAiCompatibleProvider({ baseUrl, apiKey, model }).complete([{ role: 'user', content: 'Reply with the single word: pong' }], { maxTokens: 5 });
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
