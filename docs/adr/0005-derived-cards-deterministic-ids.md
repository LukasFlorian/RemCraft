# ADR 0005: Flashcards are derived from Rems with deterministic ids

- Status: accepted
- Date: 2026-11-16

## Context

Users edit cards constantly (fix typos, add clozes). Learning progress must survive edits, and
card definitions must not get out of sync with the notes.

## Decision

Never store card definitions. Derive cards from the Rem's content on demand and identify them
as `<remId>/<slot>` (`f`, `b`, `c:<clozeId>`, `o:<occlusionId>`). Scheduling state is stored in a
separate record keyed by that id and created lazily on the first answer.

## Consequences

- Editing text keeps the history; removing a cloze retires exactly that card.
- Cards of a large base are recomputed when Rems change (memoised; linear and fast).
- Switching a card's scheduler keeps its state (union of algorithm fields).
