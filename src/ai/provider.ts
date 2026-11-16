/**
 * Extension point for AI features (not used by the app yet).
 *
 * Any OpenAI-compatible chat-completions API works: OpenAI, Azure OpenAI,
 * OpenRouter, Groq, Mistral, a local Ollama/LM Studio server, … Features
 * such as "generate flashcards from notes" only depend on the small
 * {@link AiProvider} interface, so swapping vendors needs no code changes.
 * See docs/ai-integration.md.
 */

/** A chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for a completion request. */
export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object response (if the provider supports it). */
  json?: boolean;
  signal?: AbortSignal;
}

/** Minimal interface every AI feature depends on. */
export interface AiProvider {
  /** Returns the full completion text. */
  complete(messages: readonly ChatMessage[], options?: CompletionOptions): Promise<string>;
  /** Streams the completion text chunk by chunk. */
  stream(messages: readonly ChatMessage[], options?: CompletionOptions): AsyncIterable<string>;
}

/** Connection settings of an OpenAI-compatible endpoint. */
export interface AiConfig {
  /** Base URL including the version path, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  apiKey: string;
  model: string;
}
