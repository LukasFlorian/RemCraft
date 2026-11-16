# RemCraft card file (`*.cards.json`, `remcraft-cards` v1)

One UTF-8 JSON file. It contains the cards in readable form and as card
syntax, plus **where each card belongs**, and optional explanations per slide.
RemCraft imports it into the matching slide deck: every card becomes a regular
spaced-repetition card below its slide and shows up next to the slide in
lecture mode.

```json
{
  "format": "remcraft-cards",
  "version": 1,
  "created": "2026-10-28",
  "source": { "pdf": "VL03_Scheduling.pdf", "pdf_pages": 41, "title": "Betriebssysteme – VL 3" },
  "remnote_file": "VL03.remnote.md",
  "cards": [
    {
      "id": "c001",
      "section": "3 - Scheduling",
      "type": "basic",
      "front": "Was unterscheidet SRTF von SJF?",
      "back": "SRTF ist die präemptive Variante von SJF.",
      "options": [],
      "items": [],
      "pages": [12],
      "anchor": "Shortest Remaining Time First",
      "remnote": "Was unterscheidet SRTF von SJF? >> SRTF ist die präemptive Variante von SJF."
    }
  ],
  "notes": [
    {
      "pages": [12],
      "anchor": "Shortest Remaining Time First",
      "title": "SRTF",
      "text": "**Kernidee:** …"
    }
  ]
}
```

## Fields

| Field                    | Meaning                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `format`, `version`      | always `"remcraft-cards"`, `1`                                                                    |
| `source.pdf`             | file name of the PDF the cards were made from (RemCraft suggests the matching slide deck by it)   |
| `source.pdf_pages`       | number of PDF pages (sanity check, deck suggestion)                                               |
| `remnote_file`           | name of the RemNote file with the same cards (empty if none)                                      |
| `cards[].type`           | `basic`, `concept`, `cloze`, `mc`, `numeric`, `set`, `list`                                       |
| `cards[].front` / `back` | readable question / answer (no RemNote delimiters; cloze gaps shown as `[…]`)                     |
| `cards[].options`        | multiple choice: `[{"text", "correct"}]`, correct ones first                                      |
| `cards[].items`          | set/list answers, concept descriptors (`"attribute: value"`)                                      |
| `cards[].section`        | RemNote section title                                                                             |
| `cards[].pages`          | **PDF page numbers, 1-based, as in a PDF viewer** – not the number printed on the slide           |
| `cards[].anchor`         | **3–12 words copied verbatim from that slide** (see below)                                        |
| `cards[].remnote`        | the card in card syntax (children indented by 4 spaces + `- `); RemCraft creates the card from it |
| `notes[]`                | optional explanation per slide: `pages`, `anchor`, `title`, `text` (Markdown)                     |

## How RemCraft maps a card to a slide

1. Slides on the given `pages`. Handouts with **several slides per PDF page**
   are split into separate slides, so the `anchor` decides which one.
2. If the page numbers are off (e.g. counted from the printed slide numbers),
   the `anchor` is searched in all slides and wins if it matches clearly.
3. Cards that cannot be placed are kept under "Karten ohne Folie" in the deck.

Matching ignores case, accents, punctuation and line breaks. A good anchor is
the slide title or a distinctive phrase that occurs on **this slide only** –
never footers, course names, dates or "Agenda". Cards spanning several slides
list all pages and use an anchor from the first one.

## Re-importing

Cards are identified by section + front + back. Re-importing a file with the
same name updates its cards and keeps the learning progress of unchanged cards.

RemCraft also exports this format from a deck (_Karten exportieren_), so cards
written in the app can be edited by Claude and imported again.
