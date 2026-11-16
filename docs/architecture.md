# Architecture

RemCraft is a static single-page application. All logic runs in the browser; the only
server component is a Supabase project used as a sync target and identity provider.

```
┌──────────────────────────── src/ui (React) ────────────────────────────┐
│ pages · layout · editor (ProseMirror) · components · hooks             │
└───────────────▲───────────────────────────────────────┬────────────────┘
                │ useSelector(store → value)            │ service calls
┌───────────────┴──────────── src/data ─────────────────▼────────────────┐
│ RemCraftApp (composition root)                                          │
│ services: RemService · PracticeService · ExamService · SettingsService │
│           ImportExportService · FileService · LectureService           │
│           SharingService · IntegrationService                           │
│ selectors (memoised derived data)                                       │
│ Store (in-memory records, indexes, transactions, undo/redo)             │
│   ├─ Persister ──► PersistenceAdapter (Dexie/IndexedDB │ Memory)         │
│   ├─ TabSync   ──► BroadcastChannel                                     │
│   └─ SyncEngine ─► RemoteBackend (Supabase │ fake)  + AuthService        │
│      ShareBackend · IntegrationBackend (Supabase │ fake)                 │
└───────────────▲─────────────────────────────────────────────────────────┘
                │ pure functions, no IO
┌───────────────┴──────────── src/core ──────────────────────────────────┐
│ model · richtext · cards · scheduling · stats · io · search · util      │
│ lecture · sharing · planning                                            │
└─────────────────────────────────────────────────────────────────────────┘
        src/ai: AiProvider registry (OpenAI-compatible, Anthropic)
        supabase/functions: todoist-daily (Edge Function, Deno)
```

## Layers and rules

| Layer      | Responsibility                                                                                                                                                                 | May depend on                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `src/core` | Domain model and algorithms: card syntax, card generation, schedulers, exam planner, queues, statistics, import/export formats, search. Pure TypeScript, deterministic, no IO. | nothing (except tiny libs like `fractional-indexing`) |
| `src/data` | State, persistence, synchronisation, application services, derived selectors.                                                                                                  | `core`                                                |
| `src/ui`   | React components, routing, editor.                                                                                                                                             | `core`, `data`, `ai`                                  |
| `src/ai`   | AI provider abstraction.                                                                                                                                                       | nothing                                               |

The rules are enforced by ESLint (`no-restricted-imports` in `eslint.config.js`): `core`
cannot import React, Dexie, Supabase or the other layers; `data` cannot import the UI.

## Minimal interfaces

Each boundary is a small interface so implementations can be swapped and tested in isolation:

| Interface                                            | Location                        | Implementations                                 |
| ---------------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| `RemGraph` (`get`, `children`)                       | `core/model/graph.ts`           | `Store`, `createMemoryGraph` (tests, importers) |
| `Scheduler` (`review`, `retrievability`)             | `core/scheduling/common.ts`     | SM-2, FSRS-6                                    |
| `PersistenceAdapter`                                 | `data/persistence/adapter.ts`   | `DexieAdapter`, `MemoryAdapter`                 |
| `RemoteBackend` (`pull`, `push`, `subscribe`, files) | `data/sync/remote.ts`           | `SupabaseBackend`, `FakeServer` (tests)         |
| `AiProvider` (`complete`, `stream`)                  | `ai/provider.ts`                | OpenAI-compatible, Anthropic (`AI_PROVIDERS`)   |
| `PdfEngine`                                          | `data/lecture/pdf.ts`           | pdf.js                                          |
| `ShareBackend`                                       | `data/sync/shareBackend.ts`     | `SupabaseShareBackend`, `FakeServer.share`      |
| `IntegrationBackend`                                 | `data/services/integrations.ts` | `SupabaseIntegrationBackend`                    |
| `PreCommitHook`                                      | `data/store/store.ts`           | space-id invariant (`SharingService`)           |

## Data flow

1. **Write**: the UI calls a service (e.g. `app.rems.indent(ids)`). The service runs one
   `store.transact(tx => …)`. All writes of a transaction are applied atomically, indexes are
   updated, an undo entry is recorded and subscribers are notified once.
2. **Render**: components read with `useSelector(store => …)`. Selectors memoise on
   per-collection version counters (`store.memo(key, deps, compute)`), so heavy derivations
   (all cards with inherited priorities, the daily queue, exam plans) run once per relevant change.
3. **Persist**: the `Persister` writes every committed batch to IndexedDB in order and adds
   local changes to the persistent **outbox**.
4. **Sync**: the `SyncEngine` pushes the outbox and pulls remote rows (see
   [sync-and-accounts.md](sync-and-accounts.md)). Remote changes enter the store through
   `store.applyExternal(…, 'remote')` and follow the same render path.

## Derived flashcards

Cards are not stored with the Rem. `core/cards/generate.ts` derives them from the Rem's content
(separator, answer mode, clozes, occlusions). Each card has a deterministic id
`<remId>/<slot>` that links it to its `CardState` record. Editing never loses learning progress;
deleting a cloze retires exactly that card. See [data-model.md](data-model.md).

## Editor

- One ProseMirror view exists at a time - on the focused Rem (`editor/BlockEditor.tsx`).
  All other Rems render statically (`RemContent`), which keeps large documents fast.
- The schema (`editor/schema.ts`) is a single paragraph with marks (bold, …, cloze, link) and
  three atoms: reference, LaTeX and the card **separator**. Typing a delimiter turns it into a
  separator node (`editor/inputRules.ts`); Backspace turns it back into text.
- `editor/convert.ts` converts between Rem fields and the editor document.
- A global `EditorController` holds focus, block selection, the caret popup and drag state.
  Components subscribe to tiny slices, so moving the caret re-renders only two blocks.
- Commands (slash menu, toolbar, menus) are data in `editor/commands.ts`.

## Extension points

- **New card type**: extend `AnswerMode`/delimiter table (`core/cards/delimiters.ts`),
  `generateCards`, `buildCardView` and `CardFace`. The importer, exporter and editor pick up
  delimiters automatically.
- **New scheduler**: implement `Scheduler`, add the algorithm to `SchedulerAlgorithm` and
  `createScheduler`, add a settings form. Queues, exams and stats work unchanged.
- **New slash command**: add an entry to `COMMANDS`.
- **New import format**: parse into `OutlineNode[]` and reuse `outlineToRems`.
- **New collection**: add it to `CollectionName`/`CollectionTypes`; the generic `records`
  table syncs it without a migration.
- **AI features**: depend on `AiProvider` only ([ai-integration.md](ai-integration.md)).
- More (Anki-style features, registries): [extending.md](extending.md).

## Performance notes

- The full knowledge base is in memory; reads are synchronous map lookups.
- Child lists are copy-on-write arrays with stable identity between changes.
- Search is a linear scan with a cheap score (milliseconds for tens of thousands of Rems).
- Bundle: one chunk (~400 kB gzip incl. KaTeX fonts and Supabase); fully cached by the
  service worker after the first visit.
