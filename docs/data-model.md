# Data model

All records are plain JSON objects (`src/core/model/types.ts`). Six collections exist; each
record has an `id` and an `updatedAt` timestamp (used for conflict resolution).

| Collection | Record | Purpose |
|---|---|---|
| `rems` | `Rem` | Every bullet, document and folder |
| `cards` | `CardState` | Scheduling state of a flashcard that was practiced at least once |
| `logs` | `ReviewLog` | One entry per answer (history, stats, undo, future FSRS optimisation) |
| `exams` | `Exam` | Exam date, scope and options |
| `schedulers` | `SchedulerConfig` | SM-2 / FSRS parameter sets (`default` is built-in) |
| `settings` | `Settings` | One record with id `settings` |

## Rem

```ts
interface Rem {
  id: string;               // 16-char random base62
  parentId: string | null;  // null = top level
  order: string;            // fractional index among siblings
  text: RichText;           // front (before the separator)
  back: RichText | null;    // after the separator; null = no separator
  kind: 'plain' | 'concept' | 'descriptor';
  direction: 'none' | 'forward' | 'backward' | 'both' | 'disabled';
  answerMode: 'inline' | 'set' | 'list' | 'mc';
  isDocument: boolean; isFolder: boolean;
  tags: string[]; aliases: string[];
  // optional powerups: heading, todo, quote, code, latexBlock, divider, highlight,
  // image (+occlusions), file, embed, collapsed, portalOf, searchQuery, tableView,
  // isProperty, propertyId, mcCorrect, extraCardDetail, typeInAnswer, priority,
  // schedulerId, clozeHints, hideContextInQueue, pinned, editLater, isTemplate, dailyDate
  createdAt: number; updatedAt: number;
}
```

Optional fields are omitted when unset, keeping records small.

### Rich text

`RichText` is an array of segments: `{ type: 'text', text, marks? }`,
`{ type: 'ref', remId, marks? }` and `{ type: 'latex', source, marks? }`. Marks: bold, italic,
underline, strike, code, highlight colour, link and **cloze id**. Segments sharing a cloze id
form one cloze; a *merged* cloze is simply two runs with the same id. Rich text is always
normalised (adjacent equal runs merged), so values compare structurally.

### Ordering

Siblings are sorted by `order`, a fractional index string (`fractional-indexing`). Inserting or
moving a Rem writes only that Rem - concurrent edits on two devices never rewrite siblings.

### Inheritance

`priority`, `schedulerId`, `typeInAnswer` and `hideContextInQueue` apply to the whole subtree.
`core/scheduling/inheritance.ts` resolves priorities and schedulers for all Rems in one
traversal; active exams add the derived **exam** priority to their scope (exam wins against
everything except *paused*).

## Cards

Cards are derived, never stored with the Rem (`core/cards/generate.ts`):

| Card | Id | Generated when |
|---|---|---|
| forward | `<remId>/f` | direction forward/both and an answer exists |
| backward | `<remId>/b` | direction backward/both (not for MC) |
| cloze | `<remId>/c:<clozeId>` | one per distinct cloze id in `text` |
| image occlusion | `<remId>/o:<occlusionId>` | one per mask |

"An answer exists" means: non-empty back (inline), at least one child (set/list) or two
children (MC). An inline card with empty back but children behaves as a multi-line card,
which is how RemNote's "`==` then Enter" works. Children flagged as *extra card detail*
are shown on the back instead of being part of the answer.

`CardState` is created lazily on the first answer; until then a fresh *new* state is assumed.
It stores the union of all algorithm fields (`interval`, `ease` for SM-2; `stability`,
`difficulty` for FSRS; `phase`, `step`, `due`, `reps`, `lapses`, `streak`), so a card can move
between schedulers without losing history.

## Review log

Each answer writes an immutable `ReviewLog` containing the rating, duration, mode
(`srs`, `exam`, `all`, `all-in-order`; cram writes nothing), the algorithm and a snapshot of the
card state *before* the review. The snapshot makes undo trivial and keeps the data needed to
optimise FSRS weights later.

## Ids for shared/seeded records

Records that two devices may create independently use deterministic ids so that they merge
instead of duplicating: `settings`, `default` (scheduler), `daily-documents`,
`daily-YYYY-MM-DD`, and the welcome document (`seed-welcome…`).
