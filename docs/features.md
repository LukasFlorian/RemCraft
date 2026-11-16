# Feature matrix (RemNote → RemCraft)

Legend: ✅ implemented · 🟡 partial / simplified · ⏳ not yet (extension point exists) · ❌ out of scope

The list follows RemNote's help center and UI (sidebar, Documents & Folders, editor, slash
menu, Flashcards home/Cards/Stats/Exams, import dialog).

## Knowledge base & organisation

| RemNote feature | Status | Notes |
|---|---|---|
| Rems (every bullet is an object) | ✅ | `Rem` record, see [data-model.md](data-model.md) |
| Documents | ✅ | Any Rem can be a document; opens as a page |
| Folders | ✅ | Folder page with documents/sub-folders |
| Documents & Folders page (filters, search, sort, date groups) | ✅ | All / Documents / Folders / PDFs / Tags / Daily Notes |
| Sidebar: Pinned / Unpinned trees, Today's Note, Flashcards badge, Edit Later | ✅ | |
| Daily documents (Today's Note), date references | ✅ | Deterministic ids per day; `/Today`, `/Tomorrow`, … |
| Edit Later | ✅ | Flag + page + sidebar count |
| Pinning / favourites | ✅ | Star in the document header |
| Global search (⌘K) with filters | ✅ | `#tag`, `is:card`, `is:todo`, `is:unfinished`, `is:document` |
| Breadcrumbs, zoom into any Rem | ✅ | Click a bullet |
| Move / duplicate / delete / convert doc↔folder | ✅ | ⋯ menu, drag & drop |
| Shared knowledge bases / collaboration | ❌ | Single-user design |
| Public sharing links | ⏳ | Could be added with a public Supabase view |

## Editor

| Feature | Status | Notes |
|---|---|---|
| Outliner editing (Enter, Tab, Shift+Tab, Backspace merge, arrows) | ✅ | |
| Collapse/expand, move up/down, drag & drop | ✅ | |
| Block selection (Esc, Shift+↑↓, Tab, ⌫, ⌘C/⌘X/⌘D) | ✅ | |
| Undo / redo (text and structure) | ✅ | One history for all edits |
| Slash menu with RemNote categories | ✅ | Data-driven command list |
| Bold, italic, underline, strikethrough, inline code, links | ✅ | Markdown shortcuts `**x**`, `` `x` `` |
| Highlights (6 colours, inline and block) | ✅ | |
| Headings H1–H3, quotes, dividers | ✅ | `# `, `> `, `---` |
| Todos | ✅ | `[] `, ⌘Enter |
| Code blocks | ✅ | Language label, no syntax colouring |
| LaTeX inline and display | ✅ | KaTeX; `$x$` |
| References `[[`, backlinks panel | ✅ | Live titles, create on the fly |
| Tags `#`, tag chips | ✅ | |
| Portals `((` | ✅ | Editable in place |
| Search portals | ✅ | Live query results |
| Aliases | ✅ | Used by search and reference lookup |
| Templates | 🟡 | Mark as template + insert (copies children) |
| Properties & tables (tag tables) | 🟡 | Property children on a tag Rem + editable table of tagged Rems |
| Images (upload, URL, paste, resize) | ✅ | Stored in IndexedDB / Supabase Storage |
| Image occlusion | ✅ | Draw masks, labels, hide-one/hide-all |
| PDFs & files | 🟡 | Upload, inline viewer; no PDF highlighting/annotation |
| Embeds (YouTube, Vimeo, audio, video, web pages) | ✅ | |
| Audio recording | ✅ | MediaRecorder |
| Drawing canvas | ⏳ | |
| Columns layout | ⏳ | |
| Paste multi-line text → Rems with cards | ✅ | Same syntax as import |
| Mobile toolbar | ✅ | Flashcard, Heading, Todo, Image, Table, More, Undo |

## Flashcards

| Feature | Status | Notes |
|---|---|---|
| Basic forward `>>`/`==`, backward `<<`, both `<>`, disabled `>-` | ✅ | |
| Concept `::` (+ `:>`, `:<`, `:-`) | ✅ | Bold, two-way by default |
| Descriptor `;;` (+ `;<`, `;;<`, `;-`) | ✅ | Italic, forward |
| Multi-line (set) `>>>` and "`==` then Enter" | ✅ | |
| List-answer `>>1.` | ✅ | Items revealed one by one |
| Multiple choice `>>A)` | ✅ | Several correct answers (click the letter); `{CORRECT: A, B}` on import |
| Cloze `{{…}}`, hints `{({…})}` | ✅ | |
| Merge / split clozes | ✅ | Card popover; Anki `{{c1::…}}` groups on import |
| Image occlusion cards | ✅ | |
| Extra Card Detail | ✅ | `/ecd`, `#[[Extra Card Detail]]` |
| Type in Answer (`/tia`), lenient or exact grading | ✅ | Edit-distance based |
| Hide context in queue | ✅ | |
| Disable / reset cards, card browser with bulk actions | ✅ | |
| Practice: SRS, practice all, all in order, cram | ✅ | Cram does not change scheduling |
| Ratings Forgot / Partially / With effort / Easily + Skip + Undo | ✅ | Interval previews on the buttons |
| Edit card during practice | ✅ | |
| Card statistics per card | 🟡 | State, due, reps in the card popover and browser |

## Scheduling & goals

| Feature | Status | Notes |
|---|---|---|
| Anki SM-2 (RemNote variant) | ✅ | All parameters configurable |
| FSRS-6 with desired retention | ✅ | Matches `ts-fsrs` to 1e-7 |
| FSRS parameter optimisation | ⏳ | Weights can be pasted; review logs are stored for a future optimiser |
| Custom schedulers per document/folder (inheritance) | ✅ | |
| Priorities: Exam, Currently Studying, Maintaining, No Priority, Paused | ✅ | |
| Exam scheduler (spread new cards, extra practice, final review, study plan) | ✅ | See [scheduling.md](scheduling.md) |
| Daily goal, streak goal, weekly chart | ✅ | |
| New cards per day, day start hour | ✅ | |
| Statistics (reviews, forecast, retention, maturity, heatmap) | ✅ | |

## Import / export

| Source | Status |
|---|---|
| RemNote Markdown export / pasted text | ✅ |
| Anki "Notes in plain text" | ✅ (`.apkg` ⏳) |
| Quizlet export | ✅ |
| CSV (Excel via CSV) | ✅ (`.xlsx` ⏳) |
| Workflowy / Dynalist (OPML) | ✅ |
| Notion / Obsidian / Roam / Logseq Markdown | ✅ |
| PDF or any file | ✅ |
| RemCraft JSON backup / restore | ✅ |
| Export Markdown (RemNote syntax) | ✅ |

## Platform

| Feature | Status |
|---|---|
| Offline-first, installable PWA | ✅ |
| Accounts (email/password, magic link, GitHub OAuth) | ✅ |
| Cross-device sync with realtime updates | ✅ |
| Multiple open tabs stay consistent | ✅ |
| Dark / light / system theme | ✅ |
| Keyboard shortcuts | ✅ |
| AI features (Remy tutor, AI card generation) | ⏳ provider interface ready ([ai-integration.md](ai-integration.md)) |
| Plugins API | ❌ |
