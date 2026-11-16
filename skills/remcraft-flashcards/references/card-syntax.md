# Card syntax reference (RemCraft and RemNote)

RemCraft uses RemNote's text syntax for flashcards, so the same lines work in
both apps. Differences are noted where they matter. Source for the RemNote
side: RemNote Help Center - "How to Import Flashcards from Text", "Creating
Flashcards", "Multi-Line (List & Set) Flashcards", "Typing in Answers". Works for the import feature and for
copy-paste. Leading `- ` is optional; nesting is detected from leading spaces
(any consistent width per level).

## Contents

1. Basic cards
2. Cloze cards and hints
3. Multi-line (set) cards
4. List-answer cards
5. Multiple-choice cards
6. Concept / descriptor cards
7. Extra Card Detail
8. Not importable via text
9. Rich content

## 1. Basic cards

| Syntax                                | Card               |
| ------------------------------------- | ------------------ |
| `Front >> Back` or `Front == Back`    | forward            |
| `Front << Back`                       | backward only      |
| `Front <> Back` (also `><`)           | both directions    |
| `Front >- Back` (in editor also `=-`) | disabled (no card) |

## 2. Cloze cards

```
The {{TLB}} caches page table entries; it lives in the {{MMU}}.
```

Each `{{…}}` becomes an independent card (they cannot be merged on import).
Hints: `{({hint})}` directly after the cloze:

```
The {{TLB}}{({small cache})} speeds up {{address translation}}{({VA → PA})}.
```

A bullet can be both a basic card and contain clozes.

## 3. Multi-line (set) cards - all items revealed at once

```
- Which conditions must a critical-section solution satisfy? >>>
    - Mutual exclusion
    - Progress
    - Bounded waiting
```

`<<<` backward, `<><` two-way. Nested multi-line cards are allowed (each child
can itself be a multi-line card).

## 4. List-answer cards - items revealed one by one, order matters

```
- Steps of a context switch (in order) >>1.
    - Save context of running process into its PCB
    - Select next process
    - Load its context from its PCB
    - Resume it
```

Items are numbered in the given order. `<<1.` backward, `<>1.` two-way,
`>-1.` disabled.

## 5. Multiple-choice cards

```
- Which algorithms are preemptive? {CORRECT: A, B} >>A)
    - SRTF
    - Round Robin
    - FCFS
    - SJF
        - SJF is non-preemptive; SRTF is its preemptive variant.
```

- First child = correct on import; others wrong. Options are shuffled in review.
- RemCraft reads the `{CORRECT: A, B}` tag and marks all listed options as
  correct (and removes the tag). RemNote ignores it: extra correct answers must
  be set manually there (click the letter or `/mcr`; `/mcw` marks incorrect) -
  hence correct options first.
- Child bullets under an option are shown after answering (explanations).
- `>-A)` creates a disabled MC card. In the editor `==A)` also works.

## 6. Concept / descriptor cards

Concepts (`:`) are bold and two-way by default; descriptors (`;`) are italic,
forward by default, and describe an attribute of their parent concept.

|            | forward | backward | two-way               | disabled |
| ---------- | ------- | -------- | --------------------- | -------- |
| Concept    | `:>`    | `:<`     | `::`                  | `:-`     |
| Descriptor | `;;`    | `;<`     | `;;<` (editor: `;<>`) | `;-`     |

```
- Semaphore :: integer counter with atomic wait/signal operations
    - initial value for mutual exclusion ;; 1
    - wait() when counter is 0 ;; caller blocks
```

Multi-line / list / MC variants exist (from the help page tables; some entries
there look inconsistent, so test once before using in bulk):

- Multi-line: concept `:::` (editor) or as listed `;>>`/`:<<`; descriptor `;;;` / `;;>` / `;<<`
- List-answer: concept `::1.`, `:<<1.`, `:-1.`; descriptor `;;>1.`, `;<<1.`, `;;<1.`, `;-1.`
- MC: concept `:-A)` disabled; descriptor `;;>A)`, `;-A)`

When in doubt, prefer the plain basic/MC forms - they are unambiguous.

## 7. Extra Card Detail (shown on the back)

Tag a child bullet with `#[[Extra Card Detail]]`:

```
- What does the TLB cache? >> page table entries
    - Hit avoids the extra memory access for the PTE #[[Extra Card Detail]]
```

Works under basic and cloze cards.

## 8. Not importable via text (set in the app)

- **Type in Answer** - apply `/tia` (Type in Answer powerup) to a parent bullet
  or the document; all descendant cards get a text box. Grading mode (AI /
  fuzzy / exact) is a global setting. Useful for numeric cards. LaTeX answers
  are compared against the LaTeX source.
- **Image occlusion** - Ctrl/Cmd+click an image in RemNote.
- **Multiple correct MC answers** - see section 5.
- **Merged clozes** (all clozes hidden on one card) - set via the cloze dropdown.
- **Hiding ancestors** on a card - powerup in RemNote.

## 9. Rich content

- Inline LaTeX: `$x^2$` style math renders in RemNote.
- Code: keep code inline on one line or, if unavoidable, rephrase in prose -
  multi-line code blocks break the one-card-per-line rule and C operators
  (`==`, `>>`, `::`) trigger card delimiters.
