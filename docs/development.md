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

| Command                 | Scope                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Vitest: core algorithms, store, services, persistence (fake-indexeddb), multi-device sync against an in-memory server, editor conversion, AI client |
| `npm run test:coverage` | with coverage of `core`, `data`, `ai`                                                                                                               |
| `npm run e2e`           | Playwright against the production build (editing, practicing, undo, import, exams, search)                                                          |

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

## Release notes ("Was ist neu")

After an update, users see a short popup with what changed since their last visit. The notes
live in `src/ui/whatsnew/releases.ts`: one entry per deployment (merge into `main`) with
user-visible changes - items are added to the top entry until it is deployed, then a new entry
starts (`id` increases, e.g. `2026-11-18a`; items are short German sentences from the user's
point of view). The last seen id is stored in the synced settings (and locally), so every user
sees each entry once, on whichever device opens the new version first; first-time users see
nothing.

## Beta channel

RemCraft is deployed twice from `main` by `.github/workflows/deploy.yml`:

| App    | URL            | Build                                    | Shows                            |
| ------ | -------------- | ---------------------------------------- | -------------------------------- |
| Stable | `<base>/`      | `npm run build`                          | features with status `stable`    |
| Beta   | `<base>/beta/` | `VITE_CHANNEL=beta`, base `<base>/beta/` | also features with status `beta` |

**Flow for a new user-facing feature**

1. Register it in `src/core/release/features.ts` with `status: 'beta'` and guard its entry points
   with `feature('<name>')` (`src/ui/app/channel.ts`): sidebar items, routes, menu entries.
2. Merge into `main` once typecheck, lint, unit/component tests and e2e tests pass (e2e tests run
   against the beta build, so flagged features are covered). Only the beta app shows it.
3. Beta testers try it (Settings → Beta-Version; "Fehler melden" opens a GitHub issue with the
   label `beta`).
4. After it has been stable for a while: set `status: 'stable'` and add the release note
   (`src/ui/whatsnew/releases.ts`). Release notes describe the stable app only.

Fixes and small changes to stable features do not need a flag.

**Rules that keep both apps working on the same server**

- Both apps share the Supabase project, accounts and synced data. Server changes must be additive
  (new tables/columns/collections, never renamed or removed ones while stable still uses them).
- New synced collections are fine: older apps skip rows of collections they do not know and pull
  everything again once an update adds them (`SyncEngine.pull`).
- Beta keeps its own IndexedDB (`remcraft-beta`) and tab channel, so a newer local schema never
  breaks the stable app. Signed-in users see the same data in both; local-only data does not cross.
- The stable service worker never answers navigations below `beta/` (`navigateFallbackDenylist`).
- Who is a beta tester is a synced setting (`settings.betaTester`): the stable app then links to
  the beta app in the sidebar. Anyone can open `<base>/beta/`; nothing secret is behind it.
