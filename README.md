# RemCraft

**RemCraft** is a free, self-hostable note-taking and spaced-repetition app inspired by
[RemNote](https://www.remnote.com) and compatible with its text format: hierarchical notes ("Rems"), documents and folders,
references, tags and portals, every RemNote flashcard type, Anki-SM-2 and FSRS-6
scheduling, a RemNote-style **exam scheduler**, statistics, import/export – and
accounts with cross-device sync on a free Supabase project.

It is a static web app (installable as a PWA) that works **offline first**: everything is
stored in the browser (IndexedDB) and synchronised in the background when you are signed in.

| Notes                                                                  | Practice                                         | Exams                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Outliner with RemNote syntax (`>>`, `::`, `;;`, `{{cloze}}`, `>>A)` …) | All card types, 4 ratings, type-in answers, undo | Spread new cards until the exam, final review, study plan |

## Highlights

- **Editor**: bullets, indent/outdent, drag & drop, collapse, zoom, block selection, undo/redo,
  slash menu (`/`) with RemNote's categories, references (`[[`), tags (`#`), portals (`((`),
  search portals, headings, todos, quotes, code blocks, LaTeX (KaTeX), highlights, images,
  image occlusion, PDFs/files, embeds, audio recording, templates, aliases, tag tables,
  daily notes, _Edit later_, pinning, references panel.
- **Flashcards**: basic (forward/backward/both/disabled), concept & descriptor,
  multi-line (set), list-answer, multiple choice with several correct answers,
  cloze with hints and merged clozes, image occlusion, extra card detail, type-in answers.
- **Scheduling**: RemNote's Anki-SM-2 variant and FSRS-6 (verified against the reference
  implementation), custom schedulers per folder/document, priorities
  (Currently Studying / Maintaining / No Priority / Paused), daily goal, streaks.
- **Exams**: exam date + scope → new cards spread evenly, extra practice for missed cards,
  final review window, daily targets, graph and month study plan.
- **Import/Export**: RemNote/Markdown (incl. `{CORRECT: A, B}`), Anki & Quizlet text, CSV,
  OPML (Workflowy/Dynalist), Notion/Obsidian/Roam/Logseq Markdown, PDFs, JSON backups;
  Markdown export in RemNote syntax.
- **Sync**: Supabase Auth (email/password, magic link, GitHub OAuth) + Postgres with row-level
  security, realtime updates, last-writer-wins conflict resolution, offline outbox.
- **Lectures**: import slide decks (handouts are split automatically), take notes
  per slide in lecture mode with ink, flags, check-ins and drift tracking, quiz the cards of the
  current slide, analyse the lecture and get a review list; card files written by the bundled Claude skill land on their slides.
- **Sharing**: whole course folders, only notes, only cards, … as read-only cloneable links/files,
  or live collaboration with read/write roles.
- **Todoist**: every night at 00:01 one task per course with the day's estimated study time.
- **AI**: lecture assistant with Claude or any OpenAI-compatible model (your key).
- **Extensible**: registries for schedulers and AI providers, pure core - built to adopt Anki features.

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. Without configuration RemCraft runs fully local.
To enable accounts and sync, follow [docs/deployment.md](docs/deployment.md).

## Free hosting in a nutshell

1. Create a free [Supabase](https://supabase.com) project and run the files in
   [`supabase/migrations/`](supabase/migrations) (in order) in its SQL editor.
2. In GitHub: _Settings → Pages → Source: GitHub Actions_, and add the repository
   **variables** `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Push to `main` – the [deploy workflow](.github/workflows/deploy.yml) publishes the app to
   `https://<user>.github.io/<repo>/`. A [keep-alive workflow](.github/workflows/supabase-keepalive.yml)
   prevents the free Supabase project from pausing.

Details, alternatives (Netlify, Cloudflare Pages) and auth redirect settings:
[docs/deployment.md](docs/deployment.md).

## Scripts

| Command                              | Purpose                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `npm run dev`                        | Development server                                          |
| `npm run build`                      | Type-check and production build (`dist/`)                   |
| `npm test`                           | Unit/integration tests (Vitest)                             |
| `npm run e2e`                        | End-to-end tests (Playwright, against the production build) |
| `npm run lint` / `npm run typecheck` | Static checks                                               |
| `npm run check`                      | Typecheck + lint + tests                                    |

## Documentation

| Document                                               | Content                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| [docs/features.md](docs/features.md)                   | RemNote feature matrix: what is implemented, partially, or not |
| [docs/architecture.md](docs/architecture.md)           | Layers, modules, data flow, extension points                   |
| [docs/data-model.md](docs/data-model.md)               | Records, ids, ordering, card derivation                        |
| [docs/flashcard-syntax.md](docs/flashcard-syntax.md)   | Every card type and its syntax                                 |
| [docs/scheduling.md](docs/scheduling.md)               | SM-2, FSRS-6, exam scheduler, queue, priorities, goals         |
| [docs/sync-and-accounts.md](docs/sync-and-accounts.md) | Local-first storage, sync protocol, conflicts, security        |
| [docs/deployment.md](docs/deployment.md)               | Supabase + GitHub Pages setup, alternatives, costs             |
| [docs/development.md](docs/development.md)             | Conventions, testing, how to extend                            |
| [docs/ai-integration.md](docs/ai-integration.md)       | Plugging in any OpenAI-compatible model                        |
| [docs/lectures.md](docs/lectures.md)                   | Slide decks, lecture mode, card files, Claude skill            |
| [docs/sharing.md](docs/sharing.md)                     | Read-only snapshots and live collaboration                     |
| [docs/integrations.md](docs/integrations.md)           | Todoist daily study tasks                                      |
| [docs/extending.md](docs/extending.md)                 | Extension points (Anki & co.)                                  |
| [docs/adr/](docs/adr)                                  | Architecture decision records                                  |

## Tech stack

TypeScript (strict) · React 19 · ProseMirror · Vite · Dexie (IndexedDB) · Supabase ·
KaTeX · pdf.js · Vitest · Playwright · GitHub Actions.

## License and notices

MIT - see [LICENSE](LICENSE).

RemCraft is an independent, non-commercial project. It is not affiliated with, endorsed by or
sponsored by RemNote Inc. "RemNote" is a trademark of its owner and is used here only to
describe compatibility (e.g. importing RemNote files). No code or assets of RemNote are used.

If you run a public instance, fill in the operator details for the in-app Impressum and
privacy policy (`#/legal`) - see [docs/deployment.md](docs/deployment.md#legal-notice-and-privacy-policy).
