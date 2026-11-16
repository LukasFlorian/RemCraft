# Lectures: slides → notes → flashcards

RemCraft contains a port of **Fokus** (`quasi_counter_and_regression`): a lecture
companion that closes the loop between slide decks, your lecture notes and flashcards
mapped to slides (`/fokus-flashcards`). Everything lives in the normal knowledge base,
so notes are Rems, cards are regular flashcards with spaced repetition, and decks can be
shared like any other document.

## Model

| Concept                     | Representation                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Course ("Vorlesungsmappe")  | A folder                                                                             |
| Slide deck                  | A document Rem with `deck: DeckInfo` (PDF file, layout, slide boxes)                 |
| Slide                       | Child Rem with `slide: { index, page, box }`, `slideText`, `slideFlags`              |
| Notes of a slide            | The outline below the slide Rem (any RemNote syntax, cards included)                 |
| Imported cards              | Rems with `fokus: FokusOrigin` (file, key, pages, anchor) - re-imports keep progress |
| Ink, text boxes, highlights | `annotations` collection, id = slide Rem id                                          |
| A lecture (recording)       | `lectures` + `lectureEvents` (start/pause/slide/drift/check-in/…)                    |

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
4. **Fokus cards**: the skill `fokus-flashcards` produces `*.fokus.json`; import it on the deck
   (or via _Import → Fokus-Karten_). Each card is placed on its slide via PDF page + verbatim
   anchor (`core/lecture/fokusCards.ts`); unmatched cards go to "Karten ohne Folie".
   The assistant (K) can also generate cards in the same format with any configured AI provider.
5. **After the lecture**: analysis (`#/lectures/<id>`: timeline, time per slide, drifts,
   check-ins, CSV), _Nacharbeiten_ (`#/review/<deck>`: slides ranked by reasons such as unclear,
   open question, missed, long without note), printable handout with notes (`#/handout/<deck>`),
   export for AI.

_Demo_: _Vorlesungen → Demo-Kurs erzeugen_ builds a course with a 5-slide handout, notes,
cards and two past lectures.

## Settings

_Settings → Vorlesungen_ (`LectureSettings`, defaults in `core/lecture/analytics.ts`):
check-in interval, away tracking thresholds, dwell thresholds for "skipped"/"missed"/"long".
