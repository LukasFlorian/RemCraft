# Flashcard syntax

RemCraft uses RemNote's text syntax - in the editor (typing), when pasting, when importing
and when exporting. One table drives all of them: `src/core/cards/delimiters.ts`.

In the editor a delimiter turns into an arrow as soon as it is typed; **Backspace right after
the arrow turns it back into text**. To write a delimiter literally, escape it: `\>>`.

## Basic cards

| Syntax                             | Card                    |
| ---------------------------------- | ----------------------- |
| `Front >> Back` or `Front == Back` | forward                 |
| `Front << Back`                    | backward                |
| `Front <> Back` (or `><`)          | both directions         |
| `Front >- Back` (or `=-`)          | disabled (kept as note) |

## Concepts and descriptors

Concepts are bold and practiced both ways; descriptors are italic and describe an attribute
of their parent concept (the parent is shown as context while practicing).

|            | forward | backward | both          | disabled |
| ---------- | ------- | -------- | ------------- | -------- |
| Concept    | `:>`    | `:<`     | `::`          | `:-`     |
| Descriptor | `;;`    | `;<`     | `;;<` / `;<>` | `;-`     |

```
- Semaphore :: integer counter with atomic wait/signal
    - initial value for mutual exclusion ;; 1
```

## Multi-line cards (answer = children)

| Syntax                         | Card                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `Question >>>`                 | set: all children revealed at once (`<<<` backward, `<><` both) |
| `Question ==` then Enter       | same (empty back + children)                                    |
| `Question >>1.`                | list-answer: children revealed one by one, order matters        |
| `Question >>A)`                | multiple choice: children are options                           |
| `Concept :::` / `Concept ::1.` | multi-line / list concept                                       |

Multi-line delimiters only count at the end of the line.

## Multiple choice

```
- Which algorithms are preemptive? {CORRECT: A, B} >>A)
    - SRTF
    - Round Robin
    - FCFS
        - FCFS is non-preemptive.   ← shown after answering
```

- Without a marker the first option is correct (RemNote's rule).
- `{CORRECT: A, B}` (RemCraft extension) marks several options as correct on import.
- In the editor, click an option's letter to toggle it between correct (green) and wrong (red),
  or use `/Toggle correct answer` (`/mcr`).
- If several options are correct, the practice screen asks to select all of them.

## Cloze cards

```
The {{TLB}}{({small cache})} caches {{page table entries}}.
```

- Each cloze is a separate card; `{({hint})}` directly after a cloze shows the hint instead of `[…]`.
- In the editor: type `{{` to start a cloze, `}}` to end it, or select text and type `{`.
  ⌘⇧C toggles a cloze on the selection.
- Merging: the card popover (layers badge at the right of a Rem) can merge clozes into one card
  or split them again. On import, Anki's `{{c1::a}} … {{c1::b}}` groups become merged clozes and
  `{{c1::text::hint}}` hints are kept.

## Extra card detail

A child tagged `#[[Extra Card Detail]]` (or `/Extra Card Detail`) is shown on the back of its
parent's cards instead of being an answer item.

## Image occlusion

Add an image (`/Upload image`, paste or drop), then `/Image Occlusion Flashcard`: draw rectangles;
each one becomes a card. Choose whether only the asked region or all regions are hidden.

## Type in answer

`/Type in Answer` (`/tia`) on a Rem or any ancestor makes its cards ask for a typed answer.
Grading (Settings → Flashcards): _lenient_ ignores case, accents and punctuation and accepts
≥ 85 % similarity (transpositions count as one typo); _exact_ requires an exact match.

## Inline formatting in text files

`**bold**`, `*italic*`, `<u>underline</u>`, `~~strike~~`, `` `code` ``,
`<mark class="yellow">highlight</mark>`, `$x^2$` / `$$x^2$$`, `[[Reference]]`,
`#[[Tag]]`, `[label](https://…)`. Headings (`# `), todos (`[ ] `/`[x] `), quotes (`> `),
fenced code blocks, `---` and `![image](url)` are recognised as blocks.
