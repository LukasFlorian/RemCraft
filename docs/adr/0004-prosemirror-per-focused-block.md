# ADR 0004: ProseMirror editor mounted only on the focused Rem

- Status: accepted
- Date: 2026-11-16

## Context

RemNote-style editing needs rich text with inline atoms (references, LaTeX, card separators)
inside an outliner whose structure maps 1:1 to Rem records.

## Decision

Each Rem's content is a one-paragraph ProseMirror document. Only the focused Rem mounts an
`EditorView`; all others render static React. Structure operations (Enter, Tab, Backspace merge,
moves) are handled by services on the Rem tree, not inside ProseMirror. Undo is a single
store-level history (text edits coalesced per typing burst).

## Consequences

- Robust caret handling and IME support from ProseMirror; fast rendering of large documents.
- Cross-block text selection is replaced by block selection (Esc, Shift+arrows), as in RemNote.
- Static and editing renderings must stay visually aligned (shared CSS).
