# Extending RemCraft (Anki & co.)

RemCraft is built so features from Anki, RemNote and others can be added without touching
unrelated code. The main mechanism is a small generic **registry**
(`src/core/util/registry.ts`: `register`, `get`, `require`, `list`).

| Extension                                                             | Registry / interface                                                                  | Example to copy                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Scheduling algorithm (e.g. Anki's v3 scheduler, Leitner, SuperMemo)   | `SCHEDULERS` in `core/scheduling/registry.ts`, interface `Scheduler`                  | `exponential.ts` (minimal), `sm2.ts`, `fsrs.ts` |
| AI provider                                                           | `AI_PROVIDERS` in `src/ai/registry.ts`, interface `AiProvider`                        | `anthropic.ts`, `openaiCompatible.ts`           |
| Import format (e.g. Anki `.apkg`, Mochi, SuperMemo)                   | parse into `OutlineNode[]`, reuse `outlineToRems`; add a source in `ImportDialog.tsx` | `core/io/opml.ts`, `core/io/csv.ts`             |
| Card type (e.g. Anki "type in", note types)                           | `AnswerMode`, delimiter table, `generateCards`, `CardFace`                            | `core/cards/*`                                  |
| New stored data (e.g. Anki note types, card templates, tags per card) | add to `CollectionName`/`CollectionTypes` + collection lists                          | `annotations`, `lectures`                       |
| Daily-plan consumers (other task managers, calendars)                 | `daily_plans` + `_shared/todoist.ts`                                                  | [integrations.md](integrations.md)              |
| Share targets (other scopes or formats)                               | `ShareScope`, `ShareSnapshot`                                                         | [sharing.md](sharing.md)                        |
| Slash commands, menus                                                 | `editor/commands.ts` (data)                                                           |                                                 |
| Derived/invariant fields on write                                     | `store.addPreCommitHook`                                                              | space ids in `SharingService`                   |

Rules that keep it maintainable:

1. Algorithms go into `src/core` as pure, tested functions; IO into `src/data`; React into `src/ui`
   (ESLint enforces the direction).
2. New behaviour behind an existing interface first; extend the interface only when needed.
3. Records are JSON in the generic `records` table - new fields and collections need no migration.
4. Every module starts with a doc comment explaining _why_; public functions have TSDoc.

Ideas already prepared by the data model: FSRS parameter optimisation (review logs with
before-states are stored), Anki-style filtered decks (queue builders are pure functions over
`QueueEntry[]`), load balancing / easy days (the forecast in `forecastDailyPlans` can feed it).
