# Storage, sync and accounts

## Local-first

The whole knowledge base lives in memory (`Store`) and is persisted to IndexedDB (Dexie,
database `remcraft`). The app works fully offline; signing in is optional. Several open tabs are
kept consistent through a `BroadcastChannel`: each tab applies the other tabs' changes without
writing them again.

## Server schema

One generic table holds every record (`supabase/migrations/20261116000000_init.sql`):

| Column | Meaning |
|---|---|
| `user_id` | owner (`auth.uid()`), part of the primary key |
| `collection`, `id` | record address |
| `data` | the record as JSON (`null` when deleted) |
| `deleted` | tombstone flag |
| `updated_at` | last-writer-wins timestamp (ms) |
| `seq` | server-assigned change sequence number |

A trigger assigns a new `seq` on every write and **ignores updates older than the stored row**,
so concurrent pushes can never overwrite newer data. Row-level security restricts every
operation to `user_id = auth.uid()`; the anon key alone cannot read anything. Files (images,
PDFs) go to a private Storage bucket `files` under `<user id>/<file id>`, protected by the same
rule.

## Protocol

```
local edit ─► store ─► IndexedDB + outbox ─► push (upsert, debounced 0.8 s)
                                   remote change ─► realtime notification ─► pull (seq > lastSeq)
```

- **Push** reads the outbox (records changed locally, survives reloads), uploads the current
  version of each record (or a tombstone) and removes the entries that did not change meanwhile.
- **Pull** fetches rows with `seq > lastSeq` in batches, applies those newer than the local copy
  and stores the new `lastSeq`. Rows for which a newer local change is still in the outbox are
  skipped.
- **Triggers**: local writes, Supabase Realtime, every 60 s, when the browser comes online and
  *Sync now*.

## Conflicts

Conflicts are resolved per record by *last writer wins* on `updatedAt`. Timestamps come from a
hybrid logical clock: it never runs backwards and jumps past every timestamp seen from other
devices, so an edit made after receiving a remote change always wins against it, even with
skewed device clocks. Because Rems are small records (one bullet each) and sibling order uses
fractional indices, concurrent edits on different bullets never conflict. Review logs are
append-only and never conflict.

## Accounts

Supabase Auth: email + password (with optional email confirmation), magic link, password reset
and GitHub OAuth (enable the provider in the Supabase dashboard).

First sign-in on a device:

- local data was never edited (only the welcome document) → nothing is uploaded, the account's
  data is downloaded;
- local data was edited → it is uploaded and merged with the account;
- the device held another account's data → local data is cleared first.

Signing out optionally clears the local copy (recommended on shared devices).

## Security notes

- The anon key and project URL are public by design; access control is enforced by RLS.
- API keys for AI providers are stored only in `localStorage` of the device and never synced.
- All rendering of user content uses React (escaped); KaTeX runs with `trust: false`; embeds are
  sandboxed iframes.
