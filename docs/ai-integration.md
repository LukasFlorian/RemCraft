# AI integration

The first AI feature is the **lecture assistant** (key K in lecture mode, `ui/lecture/AssistantPanel.tsx`):
it explains slides, quizzes you, answers open questions from your notes and generates flashcards
as a RemCraft card file (`remcraft-cards`), which is imported onto the slides. Context is chosen explicitly
with chips (`@Folie`, `@Foliensatz`, `@Meine Notizen`, `@Karten`, `@Vorlesung`, `@Kurs`,
built by `data/lecture/context.ts`).

The second is **AI editing** (_document menu → Mit KI überarbeiten…_, `ui/pages/AiEditDialog.tsx`,
logic in `core/ai/editPlan.ts`): an instruction in plain words ("turn all `::` cards into `>>`
cards") is applied to a document or folder.

1. The scope is sent as RemNote-syntax lines with short references (`[r12] Hash >> Streuwert`),
   in batches of whole subtrees (about 12 000 characters each).
2. The model answers with JSON operations: `update` (new line and/or `correct` for an MC
   option), `add` (new line under a parent, after a sibling) and `delete`.
3. The answer is validated (unknown references, deleting the scope root, … are dropped) and
   shown as a preview; each change can be left out.
4. `app.io.applyEdits` applies the chosen operations in one undo step. Lines are parsed by the
   same importer as pasted text, so the syntax creates exactly the cards typing would.

For simple text changes there is also _Suchen & Ersetzen_ (`core/edit/findReplace.ts`, Cmd+Shift+H),
which needs no AI.

Providers are pluggable through `AI_PROVIDERS` (`src/ai/registry.ts`): `openai-compatible` and
`anthropic` (Claude, Messages API with streaming). Add a provider by registering a factory.

- `src/ai/provider.ts` defines the only interface features may depend on:

  ```ts
  interface AiProvider {
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
    stream(messages: ChatMessage[], options?: CompletionOptions): AsyncIterable<string>;
  }
  ```

- `src/ai/openaiCompatible.ts` implements it for any endpoint speaking the OpenAI
  `/chat/completions` protocol: OpenAI, Azure OpenAI (via its compatible endpoint), OpenRouter,
  Groq, Mistral, Together, DeepSeek, local Ollama (`http://localhost:11434/v1`) or LM Studio.
  Supports JSON mode, temperature, max tokens, abort signals and server-sent-event streaming.
- _Settings → AI_ stores base URL, key and model in `localStorage` of the device (never
  synchronised) and offers a connection test.

## Adding a feature

1. Load the configuration with `loadAiConfig()`; if `null`, hide the feature.
2. Create the provider with `createOpenAiCompatibleProvider(config)`.
3. Build prompts from domain data (e.g. `exportMarkdown` of a document) and parse answers with
   the existing importers - e.g. ask the model to answer in RemNote syntax and feed the result to
   `app.io.pasteAt(...)`. That way generated flashcards use the exact same pipeline as imports.
4. Add a command to the _AI Tools_ group in `src/ui/editor/commands.ts`.

Ideas: generate cards from a document or PDF text, explain a card during practice, grade typed
answers semantically, summarise a document.

## Browser limitations

Calls go directly from the browser to the provider, so the provider must allow CORS (OpenAI,
OpenRouter, Groq and Ollama with `OLLAMA_ORIGINS` do). For providers without CORS, deploy a tiny
proxy (e.g. a Supabase Edge Function) and use its URL as base URL.
