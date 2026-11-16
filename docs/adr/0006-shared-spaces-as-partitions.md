# 0006 Shared spaces as separate sync partitions

**Status**: accepted

## Context

Courses should be shareable read-only (cloneable) and for live collaboration, with flexible
scopes. Records so far lived in one per-user partition (`records`, PK user/collection/id).

## Decision

- Read-only sharing uses **snapshots** (scoped copies, cloned with fresh ids), published by
  token or exported as a file. No live link to the source, so scopes can transform content
  (e.g. cards → plain notes) safely.
- Live collaboration uses **spaces**: a second table `space_records` partitioned by space with
  the same LWW trigger and the same global sequence. Each Rem of a shared subtree carries
  `spaceId`; the sync engine routes rows by it. Membership and roles are enforced by RLS.
- Learning state (cards, logs, lectures) always stays personal.

## Consequences

- One sync cursor still covers both partitions (`pull_changes`); joining a space resets the cursor.
- Collaborators see the shared root as a top-level "orphan" (its parent is not theirs).
- When a membership ends, the local subtree is detached and kept as a personal copy.
- Scoped _live_ sharing (e.g. only cards, live) is not supported - use snapshots for that.
