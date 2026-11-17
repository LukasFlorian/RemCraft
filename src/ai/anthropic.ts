/**
 * {@link AiProvider} for Anthropic's Messages API (Claude), called directly
 * from the browser. The key stays on the device; Anthropic requires the
 * `anthropic-dangerous-direct-browser-access` header for browser calls.
 */
import { AiError } from './openaiCompatible';
import type { AiConfig, AiProvider, ChatMessage, CompletionOptions } from './provider';

/** Default model if none is configured. */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * Creates a Claude provider.
 *
 * @param config `baseUrl` (default `https://api.anthropic.com/v1`), `apiKey`, `model`.
 * @param fetchImpl Fetch implementation (injectable for tests).
 */
export function createAnthropicProvider(
  config: AiConfig,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): AiProvider {
  const url = `${(config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`;

  /** Splits system prompts from the conversation (Anthropic takes them separately). */
  const body = (
    messages: readonly ChatMessage[],
    options: CompletionOptions,
    stream: boolean,
  ): string => {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    return JSON.stringify({
      model: config.model || DEFAULT_CLAUDE_MODEL,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(system ? { system } : {}),
      messages: rest,
      stream,
    });
  };

  const request = async (
    messages: readonly ChatMessage[],
    options: CompletionOptions,
    stream: boolean,
  ): Promise<Response> => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: body(messages, options, stream),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok)
      throw new AiError(
        `Claude request failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`,
        res.status,
      );
    return res;
  };

  return {
    async complete(messages, options = {}) {
      const data = (await (await request(messages, options, false)).json()) as {
        content?: { type: string; text?: string }[];
      };
      return (data.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
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
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const event = JSON.parse(line.slice(5).trim() || '{}') as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (event.type === 'content_block_delta' && event.delta?.text) yield event.delta.text;
        }
      }
    },
  };
}
