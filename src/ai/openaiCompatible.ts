/**
 * {@link AiProvider} for OpenAI-compatible `/chat/completions` endpoints.
 */
import type { AiConfig, AiProvider, ChatMessage, CompletionOptions } from './provider';

/** Error returned by the provider. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/**
 * Creates a provider for an OpenAI-compatible endpoint.
 *
 * @param config Endpoint, key and model.
 * @param fetchImpl Fetch implementation (injectable for tests).
 */
export function createOpenAiCompatibleProvider(config: AiConfig, fetchImpl: typeof fetch = (...a) => fetch(...a)): AiProvider {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  /** Sends the request and checks the status. */
  const request = async (messages: readonly ChatMessage[], options: CompletionOptions, stream: boolean): Promise<Response> => {
    const body: Record<string, unknown> = { model: config.model, messages, stream };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.json) body.response_format = { type: 'json_object' };
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AiError(`AI request failed (${res.status}): ${text.slice(0, 300)}`, res.status);
    }
    return res;
  };

  return {
    async complete(messages, options = {}) {
      const res = await request(messages, options, false);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    },
    async *stream(messages, options = {}) {
      const res = await request(messages, options, true);
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Server-sent events: lines of the form "data: {...}".
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, '').trim();
          if (!payload || payload === '[DONE]' || !line.startsWith('data:')) continue;
          const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield text;
        }
      }
    },
  };
}

/** Storage key of the AI configuration (kept on this device only). */
const STORAGE_KEY = 'remcraft.ai';

/** Loads the device-local AI configuration. API keys are never synced. */
export function loadAiConfig(): AiConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AiConfig | null;
    return value?.baseUrl && value.model ? value : null;
  } catch {
    return null;
  }
}

/** Saves (or clears) the device-local AI configuration. */
export function saveAiConfig(config: AiConfig | null): void {
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore: storage unavailable
  }
}
