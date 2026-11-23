# Feature matrix (RemNote → RemCraft)

Legend: ✅ implemented · 🟡 partial / simplified · ⏳ not yet (extension point exists) · ❌ out of scope

The list follows RemNote's help center and UI (sidebar, Documents & Folders, editor, slash
menu, Flashcards home/Cards/Stats/Exams, import dialog).

## Knowledge base & organisation

| RemNote feature                                                              | Status | Notes                                                               |
| ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Rems (every bullet is an object)                                             | ✅     | `Rem` record, see [data-model.md](data-model.md)                    |
| Documents                                                                    | ✅     | Any Rem can be a document; opens as a page                          |
| Folders                                                                      | ✅     | Folder page with documents/sub-folders                              |
| Documents & Folders page (filters, search, sort, date groups)                | ✅     | All / Documents / Folders / PDFs / Tags / Daily Notes               |
| Sidebar: Pinned / Unpinned trees, Today's Note, Flashcards badge, Edit Later | ✅     |                                                                     |
| Daily documents (Today's Note), date references                              | ✅     | Deterministic ids per day; `/Today`, `/Tomorrow`, …                 |
| Edit Later                                                                   | ✅     | Flag + page + sidebar count                                         |
| Pinning / favourites                                                         | ✅     | Star in the document header                                         |
| Global search (⌘K) with filters                                              | ✅     | `#tag`, `is:card`, `is:todo`, `is:unfinished`, `is:document`        |
| Breadcrumbs, zoom into any Rem                                               | ✅     | Click a bullet                                                      |
| Move / duplicate / delete / convert doc↔folder                               | ✅     | ⋯ menu, drag & drop                                                 |
| Shared knowledge bases / collaboration                                       | ✅     | Live shared spaces with read/write roles ([sharing.md](sharing.md)) |
| Public sharing links                                                         | ✅     | Scoped read-only snapshots, cloneable; also as file                 |

## Editor

| Feature                                                           | Status | Notes                                                                                               |
| ----------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Outliner editing (Enter, Tab, Shift+Tab, Backspace merge, arrows) | ✅     |                                                                                                     |
| Collapse/expand, move up/down, drag & drop                        | ✅     |                                                                                                     |
| Block selection (Esc, Shift+↑↓, Tab, ⌫, ⌘C/⌘X/⌘D)                 | ✅     |                                                                                                     |
| Undo / redo (text and structure)                                  | ✅     | One history for all edits                                                                           |
| Slash menu with RemNote categories                                | ✅     | Data-driven command list                                                                            |
| Bold, italic, underline, strikethrough, inline code, links        | ✅     | Markdown shortcuts `**x**`, `` `x` ``                                                               |
| Highlights (6 colours, inline and block)                          | ✅     |                                                                                                     |
| Headings H1–H3, quotes, dividers                                  | ✅     | `# `, `> `, `---`                                                                                   |
| Todos                                                             | ✅     | `[] `, ⌘Enter                                                                                       |
| Code blocks                                                       | ✅     | Language label, no syntax colouring                                                                 |
| LaTeX inline and display                                          | ✅     | KaTeX; `$x$`                                                                                        |
| References `[[`, backlinks panel                                  | ✅     | Live titles, create on the fly                                                                      |
| Tags `#`, tag chips                                               | ✅     |                                                                                                     |
| Portals `((`                                                      | ✅     | Editable in place                                                                                   |
| Search portals                                                    | ✅     | Live query results                                                                                  |
| Aliases                                                           | ✅     | Used by search and reference lookup                                                                 |
| Templates                                                         | 🟡     | Mark as template + insert (copies children)                                                         |
| Properties & tables (tag tables)                                  | 🟡     | Property children on a tag Rem + editable table of tagged Rems                                      |
| Images (upload, URL, paste, resize)                               | ✅     | Stored in IndexedDB / Supabase Storage                                                              |
| Image occlusion                                                   | ✅     | Draw masks, labels, hide-one/hide-all                                                               |
| PDFs & files                                                      | ✅     | Upload, inline viewer; slide decks with ink, highlights and text boxes ([lectures.md](lectures.md)) |
| Embeds (YouTube, Vimeo, audio, video, web pages)                  | ✅     |                                                                                                     |
| Audio recording                                                   | ✅     | MediaRecorder                                                                                       |
| Drawing canvas                                                    | 🟡     | Pen/marker/eraser on slides                                                                         |
| Columns layout                                                    | ⏳     |                                                                                                     |
| Paste multi-line text → Rems with cards                           | ✅     | Same syntax as import                                                                               |
| Mobile toolbar                                                    | ✅     | Flashcard, Heading, Todo, Image, Table, More, Undo                                                  |

## Flashcards

| Feature                                                          | Status | Notes                                                                   |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Basic forward `>>`/`==`, backward `<<`, both `<>`, disabled `>-` | ✅     |                                                                         |
| Concept `::` (+ `:>`, `:<`, `:-`)                                | ✅     | Bold, two-way by default                                                |
| Descriptor `;;` (+ `;<`, `;;<`, `;-`)                            | ✅     | Italic, forward                                                         |
| Multi-line (set) `>>>` and "`==` then Enter"                     | ✅     |                                                                         |
| List-answer `>>1.`                                               | ✅     | Items revealed one by one                                               |
| Multiple choice `>>A)`                                           | ✅     | Several correct answers (click the letter); `{CORRECT: A, B}` on import |
| Cloze `{{…}}`, hints `{({…})}`                                   | ✅     |                                                                         |
| Merge / split clozes                                             | ✅     | Card popover; Anki `{{c1::…}}` groups on import                         |
| Image occlusion cards                                            | ✅     |                                                                         |
| Extra Card Detail                                                | ✅     | `/ecd`, `#[[Extra Card Detail]]`                                        |
| Type in Answer (`/tia`), lenient or exact grading                | ✅     | Edit-distance based                                                     |
| Hide context in queue                                            | ✅     |                                                                         |
| Disable / reset cards, card browser with bulk actions            | ✅     |                                                                         |
| Practice: SRS, practice all, all in order, cram                  | ✅     | Cram does not change scheduling                                         |
| Ratings Forgot / Partially / With effort / Easily + Skip + Undo  | ✅     | Interval previews on the buttons                                        |
| Edit card during practice                                        | ✅     |                                                                         |
| Disable a card during practice (D, undoable)                     | ✅     |                                                                         |
| Answer time per card (active time only), hardest cards in Stats  | ✅     | Feeds the Todoist duration estimates                                    |
| Card statistics per card                                         | 🟡     | State, due, reps in the card popover and browser                        |

## Scheduling & goals

| Feature                                                                     | Status | Notes                                                                |
| --------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Anki SM-2 (RemNote variant)                                                 | ✅     | All parameters configurable                                          |
| FSRS-6 with desired retention                                               | ✅     | Matches `ts-fsrs` to 1e-7                                            |
| FSRS parameter optimisation                                                 | ⏳     | Weights can be pasted; review logs are stored for a future optimiser |
| Custom schedulers per document/folder (inheritance)                         | ✅     |                                                                      |
| Priorities: Exam, Currently Studying, Maintaining, No Priority, Paused      | ✅     |                                                                      |
| Exam scheduler (spread new cards, extra practice, final review, study plan) | ✅     | See [scheduling.md](scheduling.md)                                   |
| Daily goal, streak goal, weekly chart                                       | ✅     |                                                                      |
| New cards per day, day start hour                                           | ✅     |                                                                      |
| Statistics (reviews, forecast, retention, maturity, heatmap)                | ✅     |                                                                      |

## Import / export

| Source                                     | Status          |
| ------------------------------------------ | --------------- |
| RemNote Markdown export / pasted text      | ✅              |
| Anki "Notes in plain text"                 | ✅ (`.apkg` ⏳) |
| Quizlet export                             | ✅              |
| CSV (Excel via CSV)                        | ✅ (`.xlsx` ⏳) |
| Workflowy / Dynalist (OPML)                | ✅              |
| Notion / Obsidian / Roam / Logseq Markdown | ✅              |
| PDF or any file                            | ✅              |
| RemCraft JSON backup / restore             | ✅              |
| Export Markdown (RemNote syntax)           | ✅              |
| Drag files in (beta, see below)            | ✅              |

**Dragging files in** (beta, `src/ui/import/fileDrop.tsx`): drop files from the computer on the
sidebar (top level or a folder/document row), a folder tile, an open folder or document page, or
an open lecture. A hint shows the target while dragging. Each file is imported by its kind
(`src/core/io/fileKinds.ts`): PDFs become slide decks, `.cards.json`/`.fokus.json` go onto the
slides of the target deck (or the matching deck, preferring decks inside the target folder),
`.remcraft.json` shares are cloned, backups are merged after a confirmation, Markdown/TXT/CSV/OPML
become documents (tab separated `.txt` exports from Anki/Quizlet are read as CSV), images and other
files are attached to the target document or stored as new documents. Elements opt in with
`data-file-drop` (`root`, `rem:<id>`, `deck:<id>`); pages set a fallback with `data-file-drop-page`.

## Platform

| Feature                                             | Status                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Offline-first, installable PWA                      | ✅                                                                                                         |
| Accounts (email/password, magic link, GitHub OAuth) | ✅                                                                                                         |
| Cross-device sync with realtime updates             | ✅                                                                                                         |
| Multiple open tabs stay consistent                  | ✅                                                                                                         |
| Dark / light / system theme                         | ✅                                                                                                         |
| Keyboard shortcuts                                  | ✅                                                                                                         |
| AI features (tutor, card generation)                | 🟡 lecture assistant: explain, quiz, card generation as card file ([ai-integration.md](ai-integration.md)) |
| Plugins API                                         | ❌                                                                                                         |

## Beyond RemNote

| Feature                                                                                                               | Status | Notes                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Lecture mode: slides, notes, ink, flags, check-ins, drift, analysis, review, handout                                  | ✅     | [lectures.md](lectures.md)                                 |
| Card files (`*.cards.json`) mapped to slides (page + anchor), progress kept on re-import; Claude skill to create them | ✅     | [lectures.md](lectures.md#card-files-and-the-claude-skill) |
| Todoist: one task per course per day at 00:01 with duration estimate                                                  | ✅     | [integrations.md](integrations.md)                         |
| Pluggable schedulers / AI providers (Anki-style extensions)                                                           | ✅     | [extending.md](extending.md)                               |
