# ADR 0003: Last-writer-wins per record with a hybrid logical clock

- Status: accepted
- Date: 2026-11-16

## Context

A single user edits on several devices, sometimes offline. CRDTs (Yjs/Automerge) offer
character-level merging but add complexity, size and opaque storage.

## Decision

Resolve conflicts per record by the newest `updatedAt`. Timestamps come from a hybrid logical
clock that never runs backwards and advances past every remote timestamp. Model data so records
are small and independent: one Rem per bullet, fractional indices for sibling order, append-only
review logs, card state separate from content.

## Consequences

- Simple, transparent protocol; easy to test (`sync.test.ts`).
- Concurrent edits of the _same_ bullet on two offline devices keep only the later one - rare for
  a single user and acceptable.
