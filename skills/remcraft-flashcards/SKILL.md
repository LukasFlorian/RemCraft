---
name: remcraft-flashcards
description: Create flashcards (Karteikarten, Lernkarten) from lecture slides (PDF), notes or old exams as a RemCraft card file (*.cards.json) that maps every card and slide explanation onto its slide, optionally plus a RemNote import file (.md). Covers every card type - multiple choice with several correct answers, numeric/calculation answers, basic, reverse, two-way, cloze with hints, concept/descriptor, multi-line set and list answers, extra card detail. Use whenever the user wants flashcards or practice questions from slides or a PDF, wants cards "for RemCraft" or "for RemNote", or wants to add/fix cards of a slide deck.
---

# RemCraft flashcards

RemCraft is a notes + spaced repetition app with a lecture mode: slide decks are
split into slides, notes are written per slide, and flashcards appear next to
the slide they belong to. This skill writes those cards.

It produces from **one spec**:

1. `<name>.cards.json` – the RemCraft card file: every card with its type,
   readable front/back, the **PDF page(s)** and a **verbatim anchor phrase** of
   its slide, plus optional short explanations per slide
   (format: `references/format.md`).
2. `<name>.remnote.md` (optional, `--remnote`) – the same cards as a RemNote
   import file, for people who also use RemNote.

The card syntax inside both files is the RemNote text syntax, which RemCraft
understands natively (details: `references/card-syntax.md`).

## Workflow

1. **Read the source first.** Read the PDF page by page and keep track of the
   **PDF page index** (1-based, as a PDF viewer counts) – not the number printed
   on the slide. Handouts often have several slides per page and a cover page,
   so the two differ. If an existing deck or card file is given, mirror its
   sections and wording.
2. **Pick card types deliberately** (table below). Mix: facts as basic/concept,
   exam drill as multiple choice, calculations as numeric.
3. **Compute, don't guess, numeric answers.** Write a small Python calculator or
   simulator, check it against known answers (e.g. an old exam), and generate
   the numeric cards from it. Avoid inputs with ties; state tie-break rules.
4. **Locate every card:**
   - `"pages"`: PDF page number(s) the content is on (`[12]`, several if needed).
   - `"anchor"`: 3–12 words **copied verbatim** from that slide (spelling,
     umlauts, hyphens as on the slide), ideally the slide title or a phrase that
     occurs only on this slide. Never footers, course names, dates, "Agenda" or
     "Summary" headings. With several slides on one page, the anchor must come
     from the slide the card is about.
5. **Optionally add `slide_notes`** for slides that need an explanation (what the
   slide says, why it matters, a typical exam question). Markdown, at most ~120
   words, only where it adds something beyond the cards.
6. **Write the spec and build:**

   ```bash
   python <this skill>/scripts/build_cards.py spec.json -o out/<name> [--remnote]
   ```

   The script refuses to write if a card has no location, a page is out of
   range, an anchor is too long, or the card syntax would break (stray
   delimiters, malformed multiple choice). Fix and rerun.

7. **Check** a few anchors against the PDF (`pdftotext -f N -l N file.pdf -`):
   the anchor must really appear on the stated page.
8. **Deliver** the file(s) and tell the user:
   - RemCraft: open the slide deck → **Karten importieren** (or _Import → Karten
     mit Folien_); the matching deck is suggested from `source.pdf`. Re-importing a
     file with the same name updates the cards and keeps the learning progress.
   - RemNote (if requested): import the `.md`; for multiple choice with several
     correct answers, mark the extra correct letters named in `{CORRECT: …}`
     (RemNote only imports the first option as correct). RemCraft reads the tag
     and marks them automatically.
   - Counts per section/type and the number of slide notes.

## Spec

The spec lists sections with cards; each card has a `type` and the fields of
that type, plus `pages` and `anchor`:

```json
{
  "source": { "pdf": "VL03_Scheduling.pdf", "pdf_pages": 41 },
  "sections": [
    {
      "title": "3 - Scheduling",
      "cards": [
        {
          "type": "mc",
          "question": "Welche Verfahren sind präemptiv?",
          "correct": ["SRTF", "Round Robin"],
          "wrong": ["FCFS", "SJF"],
          "pages": [14],
          "anchor": "Präemptive Scheduling-Verfahren"
        },
        {
          "type": "numeric",
          "question": "Mittlere Wartezeit bei FCFS für P1 (AT=0, BT=7), P2 (AT=2, BT=4)?",
          "unit": "ms",
          "answer": "2.5",
          "how": "P1=0, P2=7-2=5; (0+5)/2=2.5",
          "pages": [16],
          "anchor": "FCFS Beispiel"
        },
        {
          "type": "basic",
          "front": "Was ist eine Zeitscheibe?",
          "back": "Maximale Rechenzeit pro Zuteilung bei Round Robin",
          "pages": [18],
          "anchor": "Round Robin mit Zeitscheibe"
        }
      ]
    }
  ],
  "slide_notes": [
    {
      "pages": [18],
      "anchor": "Round Robin mit Zeitscheibe",
      "title": "Round Robin",
      "text": "**Kernidee:** jeder Prozess bekommt reihum eine Zeitscheibe …"
    }
  ]
}
```

| `type`      | Fields                                                                         | Card                                              |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `mc`        | `question`, `correct` (list), `wrong` (list), optional `label`, `explanations` | Multiple choice; correct options are placed first |
| `numeric`   | `question`, `answer`, `how` (derivation), optional `unit`, `label`             | Calculation with the method on the back           |
| `basic`     | `front`, `back`, optional `direction` (`>>`, `<<`, `<>`, `>-`), `extra`        | Basic / reverse / two-way / disabled              |
| `concept`   | `term`, `definition`, optional `direction`, `descriptors` (attribute → value)  | Concept with descriptor cards                     |
| `cloze`     | `text` with `{{gap}}` and optional hint `{({hint})}`                           | Cloze                                             |
| `multiline` | `question`, `items`, optional `ordered`                                        | Set (all at once) or list (one by one, ordered)   |

**Never write `{CORRECT: …}` into an MC question** – the script adds it.

## Choosing a card type

| Goal                                                 | Card                             |
| ---------------------------------------------------- | -------------------------------- |
| Exam-style recognition, several correct statements   | Multiple choice                  |
| Calculation with one result                          | Numeric                          |
| Single fact / definition                             | Basic (`<>` for both directions) |
| Term ↔ definition both ways, attributes of a concept | Concept (+ descriptors)          |
| A key word in context                                | Cloze                            |
| Small unordered set                                  | Multiline (set)                  |
| Ordered sequence                                     | Multiline (`"ordered": true`)    |

Keep lists short (≤ 5–7 items) – split longer ones. Questions must not depend
on a sibling card; the section title is shown as context during practice.

## Multiple choice

- 3–6 options, at least one wrong, never all correct.
- Distractors are plausible misconceptions, not obvious nonsense.
- "None/All of the above" stays last among the wrong options.
- Don't number options – letters are added automatically.
- Optional explanation per option (`explanations: {option: text}`), shown after answering.

## Pitfalls

- **Page numbers from the printed slide number** instead of the PDF index – the
  most common mapping error. The anchor rescues it only if it is verbatim and unique.
- **Paraphrased anchors** do not match. Copy, don't rephrase.
- **Accidental delimiters** in card text create unwanted cards: `>>`, `<<`,
  `<>`, `>-`, `==`, `::`, `;;`, `{{`, `}}`. Watch code (`x == 0`, `a >> 2`,
  `std::cout`) and shell (`2>>log`); rephrase them. The script flags these.
- **One card = one line.** Write tables and process lists inline.

## Language

Write cards in the language of the source material. The numeric back side uses
the labels `Korrekte Antwort` / `Rechenweg`; translate the question, not the labels.
