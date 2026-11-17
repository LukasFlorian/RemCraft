# Lectures: slides → notes → flashcards

Lecture mode closes the loop between slide decks, your lecture notes and flashcards
mapped to slides. (It started as a port of the author's earlier local tool _Fokus_.)
Everything lives in the normal knowledge base,
so notes are Rems, cards are regular flashcards with spaced repetition, and decks can be
shared like any other document.

## Model

| Concept                     | Representation                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Course ("Vorlesungsmappe")  | A folder                                                                                                                |
| Slide deck                  | A document Rem with `deck: DeckInfo` (PDF file, layout, slide boxes)                                                    |
| Slide                       | Child Rem with `slide: { index, page, box }`, `slideText`, `slideFlags`                                                 |
| Notes of a slide            | The outline below the slide Rem (any RemNote syntax, cards included)                                                    |
| Imported cards              | Rems with `fokus: FokusOrigin` (file, key, pages, anchor; field name kept for compatibility) - re-imports keep progress |
| Ink, text boxes, highlights | `annotations` collection, id = slide Rem id                                                                             |
| A lecture (recording)       | `lectures` + `lectureEvents` (start/pause/slide/drift/check-in/…)                                                       |

Pure logic is in `src/core/lecture/` (sessions, analytics, review reasons, card mapping,
handout layout detection); IO in `src/data/lecture/` (pdf.js engine, AI context, demo);
the service is `app.lectures` (`src/data/services/lectures.ts`); the UI in `src/ui/lecture/`.

## Workflow

1. **Import a deck**: _Import → Foliensatz (PDF)_ or _Foliensatz (PDF)_ on a folder page.
   Handouts with several slides per page are split automatically (ink/raster analysis,
   `core/lecture/layout.ts`); the layout can be changed per deck (auto, grid, images, 1 per page).
2. **Lecture mode** (`#/lecture/<deck>`): movable widgets (previous/current/next slide,
   notes, focus, cards, KPIs), pen/marker/eraser/text boxes on slides, flags _wichtig/unklar_,
   questions (`? …`), "I drifted off" (A), recall check-ins every _n_ minutes, time outside
   the app, goal and 3-point summary. `?` shows all shortcuts.
3. **Cards next to the slide**: the cards widget quizzes the cards and explanations of the
   current slide; answers are real reviews.
4. **Card files**: a `*.cards.json` (format `remcraft-cards`, see below) is imported on the deck
   (_Karten importieren_) or via _Import → Karten mit Folien_. Each card is placed on its slide
   via PDF page + verbatim anchor (`core/lecture/cardFile.ts`); unmatched cards go to
   "Karten ohne Folie".
   The assistant (K) can also generate cards in the same format with any configured AI provider.
5. **After the lecture**: analysis (`#/lectures/<id>`: timeline, time per slide, drifts,
   check-ins, CSV), _Nacharbeiten_ (`#/review/<deck>`: slides ranked by reasons such as unclear,
   open question, missed, long without note), printable handout with notes (`#/handout/<deck>`),
   export for AI.

_Demo_: _Vorlesungen → Demo-Kurs erzeugen_ builds a course with a 5-slide handout, notes,
cards and two past lectures.

## Card files and the Claude skill

The Claude skill **`remcraft-flashcards`** (source: `skills/remcraft-flashcards/`) turns lecture
slides into flashcards of every type, each with its PDF page and a verbatim anchor phrase, and
writes a `*.cards.json` (optionally also a RemNote `.md`). Its `scripts/build_cards.py` validates
the cards (stray delimiters, malformed multiple choice, missing locations) before writing.
Format reference: `skills/remcraft-flashcards/references/format.md`.

The app offers the skill as a download (_Claude-Skill_ on every slide deck, and in the import
dialog). `scripts/build-skill.mjs` packs it into `public/remcraft-flashcards.zip` before every
`dev`/`build`, so the download always matches the repository. Upload the ZIP in Claude under
_Settings → Capabilities → Skills_. Decks can also be exported in the same format
(_Karten exportieren_), edited by Claude and re-imported - progress of unchanged cards is kept.

The older format name `fokus-cards` is still accepted on import. Numeric cards written for
RemNote use its arrow `→` as separator; card files use `>>` (RemCraft reads `→` in notes as
"answered question"), and the importer converts `→` for numeric cards.

## Moving over from Fokus

_Settings → Import, Export & Data → Fokus-Datenordner übernehmen_ takes the `data` folder of a Fokus installation (by default
`quasi_counter_and_regression/data`, or `data_dir` from `config.toml`) and imports:

| Fokus                                               | RemCraft                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Courses (`courses/*/course.json`)                   | Top-level folders                                                                                               |
| Course files                                        | File documents in the folder (PDFs that are decks are not duplicated)                                           |
| Decks (`decks/*/deck.json` + `slides.pdf`)          | Slide decks with **Fokus' exact layout** (same slide indices); decks without a course go to “Ohne Kurs (Fokus)” |
| Notes per slide (`notes.json`)                      | Outline below the slide: one Rem per line, indentation kept, `>>` lines become flashcards                       |
| Markers, pen/marker strokes, text boxes, highlights | `slideFlags` and slide annotations                                                                              |
| Imported card files (`cards.json`)                  | Cards on their slides; cards disabled in Fokus stay disabled                                                    |
| Lectures (`sessions/*`)                             | Lectures with the full event history (analysis, review, CSV); a lecture left running is closed                  |

Not imported: Fokus' known/unknown counters of cards (RemCraft schedules cards with spaced
repetition from scratch), render caches, exports and settings. Re-running the import adds only what
is new (ids of imported objects are kept in `settings.externalIds`; notes are added only to slides
without notes). Converter: `core/io/fokusData.ts`; service: `data/services/fokusImport.ts`; the test
uses data produced by the real Fokus app (`scripts/make_fokus_fixture.py`).

## Settings

_Settings → Vorlesungen_ (`LectureSettings`, defaults in `core/lecture/analytics.ts`):
check-in interval, away tracking thresholds, dwell thresholds for "skipped"/"missed"/"long".
