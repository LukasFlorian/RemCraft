# Development guide

## Setup

```bash
npm install
```

```bash
npm run dev
```

Node ≥ 20. Optional: copy `.env.example` to `.env.local` and fill in Supabase values.

## Project layout

```
src/
  core/        pure domain logic (no React, no IO)
    model/       types, factories, ordering, RemGraph
    richtext/    rich-text operations, markup parser/serialiser
    cards/       delimiter syntax, card generation, card views, type-in grading
    scheduling/  SM-2, FSRS-6, inheritance, queue, session, exam planner
    stats/       statistics, streak, daily goal
    io/          outline (Markdown) parser, RemNote Markdown import/export, CSV, OPML, backup
    search/      full-text search
  data/        store, persistence, sync, services, selectors, composition root (app.ts)
  ui/          React: app shell, pages, editor, components, styles
  ai/          AI provider interface + OpenAI-compatible client
e2e/           Playwright tests
supabase/      SQL migrations
docs/          documentation
```

## Conventions

- TypeScript `strict` with `noUncheckedIndexedAccess`; no `any`.
- Every exported function/type has a TSDoc comment; non-obvious code has inline comments.
- Layering is enforced by ESLint (see [architecture.md](architecture.md)).
- Services perform exactly one store transaction per user action (one undo step).
- Selectors must be memoised (`store.memo`) or return primitives - `useSelector` additionally
  keeps shallowly-equal results stable.
- Formatting: Prettier (`npm run format`).

## Tests

| Command | Scope |
|---|---|
| `npm test` | Vitest: core algorithms, store, services, persistence (fake-indexeddb), multi-device sync against an in-memory server, editor conversion, AI client |
| `npm run test:coverage` | with coverage of `core`, `data`, `ai` |
| `npm run e2e` | Playwright against the production build (editing, practicing, undo, import, exams, search) |

Notable tests:
- `core/scheduling/fsrs.test.ts` cross-checks FSRS against the reference implementation.
- `data/sync/sync.test.ts` simulates two devices editing concurrently and offline.
- `core/io/io.test.ts` round-trips RemNote Markdown including `{CORRECT: …}` and clozes.

## How to …

**Add a slash command** – append to `COMMANDS` in `src/ui/editor/commands.ts`
(`group`, `label`, `icon`, `run(ctx, rem)`).

**Add a card type** – add delimiter(s) to `DELIMITERS`, handle it in `generateCards` and
`buildCardView`, render it in `pages/practice/CardFace.tsx`, document it in
[flashcard-syntax.md](flashcard-syntax.md).

**Add a scheduler** – implement `Scheduler` (`review`, `retrievability`) in
`core/scheduling/`, register it in `createScheduler`, extend `SchedulerAlgorithm` and
`SchedulerConfig`, add a form in `pages/settings/SchedulerSection.tsx`.

**Add an import format** – produce `OutlineNode[]` (see `io/opml.ts`) and call
`outlineToRems`; add a source in `pages/ImportDialog.tsx`.

**Change the database** – the generic `records` table rarely needs changes. If it does, add a
new file in `supabase/migrations/` (never edit applied migrations) and a new Dexie
`version(n)` block in `data/persistence/dexie.ts`.

## Releasing

Merging to `main` runs CI and deploys to GitHub Pages ([deployment.md](deployment.md)).
