/**
 * Registry of AI providers. Built in: any OpenAI-compatible API and Claude
 * (Anthropic Messages API). Register further providers (e.g. Gemini) with
 * `AI_PROVIDERS.register(...)`; features only ever see {@link AiProvider}.
 */
import { Registry } from '@core/util/registry';
import type { Registrable } from '@core/util/registry';
import { createAnthropicProvider, DEFAULT_CLAUDE_MODEL } from './anthropic';
import { createOpenAiCompatibleProvider } from './openaiCompatible';
import type { AiConfig, AiProvider } from './provider';

/** A provider plugin. */
export interface AiProviderPlugin extends Registrable {
  defaultBaseUrl: string;
  defaultModel: string;
  create(config: AiConfig): AiProvider;
}

/** All providers. */
export const AI_PROVIDERS = new Registry<AiProviderPlugin>('AI provider');

AI_PROVIDERS.register({
  id: 'openai-compatible',
  label: 'OpenAI-compatible (OpenAI, OpenRouter, Groq, Mistral, Ollama, …)',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  create: (c) => createOpenAiCompatibleProvider(c),
});
AI_PROVIDERS.register({
  id: 'anthropic',
  label: 'Claude (Anthropic API)',
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  defaultModel: DEFAULT_CLAUDE_MODEL,
  create: (c) => createAnthropicProvider(c),
});

/** Creates the provider of a configuration (`provider` defaults to OpenAI-compatible). */
export function createAiProvider(config: AiConfig): AiProvider {
  return (
    AI_PROVIDERS.get(config.provider ?? 'openai-compatible') ??
    AI_PROVIDERS.require('openai-compatible')
  ).create(config);
}
