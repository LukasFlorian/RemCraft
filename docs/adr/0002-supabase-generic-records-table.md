# ADR 0002: Supabase with one generic records table

- Status: accepted
- Date: 2026-11-16

## Context

Accounts and cross-device persistence are required at zero cost. Options considered: Firebase
(proprietary, vendor lock-in), PocketBase (needs a server), CouchDB/PouchDB (needs hosting),
Supabase (Postgres, auth, realtime, storage, generous free tier, open source/self-hostable).

## Decision

Use Supabase. Store all collections in one table `records(user_id, collection, id, data jsonb,
deleted, updated_at, seq)` with row-level security, a trigger that assigns a sequence number and
rejects stale writes, and realtime notifications.

## Consequences

- New fields and collections need no migration.
- Incremental sync is a single indexed query (`seq > lastSeq`).
- Server-side querying of individual fields is less convenient (not needed: all logic is client-side).
- Free projects pause after a week of inactivity → keep-alive workflow.
