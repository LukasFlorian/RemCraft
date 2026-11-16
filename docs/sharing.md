# Sharing

Anything in the tree - a whole course folder, a slide deck, a document - can be shared
with the **Teilen** button (share icon in the document header). There are two modes.

## 1. Read-only, cloneable (snapshot)

A _snapshot_ is a copy of the subtree at one point in time with a **scope**:

| Preset           | Slides (PDF) | Notes | Flashcards       | Annotations |
| ---------------- | ------------ | ----- | ---------------- | ----------- |
| Alles            | ✓            | ✓     | ✓                | ✓           |
| Folien + Notizen | ✓            | ✓     | –                | ✓           |
| Nur Notizen      | –            | ✓     | (as plain notes) | –           |
| Nur Karteikarten | –            | –     | ✓                | –           |
| Nur Folien       | ✓            | –     | –                | ✓           |

The switches can be combined freely. Rules (`core/sharing/scope.ts`):

- Containers (folders, documents, decks, slides) are kept when something inside them is shared.
- Answer children of cards (MC options, list items, extra card detail) follow their card.
- Without _Flashcards_, cards are shared as disabled notes (no cards, clozes removed).
- Without _Slides_, decks become plain documents and slides plain headings.
- References to Rems outside the share become plain text; personal fields (pinned,
  edit later, space ids) and **learning progress are never shared**.

Ways to share a snapshot:

- **Link** (`#/s/<token>`, needs an account): stored in the `shares` table, files in the public
  `shares` bucket under the unguessable token. Anyone with the link can view it (also without an
  account) and click **In meine Wissensbasis klonen**. _Aktualisieren_ republishes the current
  state under the same link; the trash icon revokes it.
- **File** (`*.remcraft.json`, no account needed): files embedded as base64. Recipients import it
  via _Import → Freigabe_.

Cloning (`core/sharing/snapshot.ts → cloneSnapshot`) assigns fresh ids, rewrites references
between the copied Rems and keeps Fokus origins, so the copy is fully independent.

## 2. Live collaboration (shared space)

_Live zusammenarbeiten → Live teilen_ moves the subtree into a **space**:

- The root gets `spaceRoot = <space id>`; every Rem below carries `spaceId`. A store
  pre-commit hook (`SharingService.normalizeSpaces`) keeps this invariant when Rems are created,
  moved in or out, and also tags slide annotations.
- The sync engine routes records with a `spaceId` to `space_records` (one partition per space,
  same global sequence and last-writer-wins rule as `records`); `pull_changes()` returns personal
  and space rows together. Files of shared subtrees are copied to `files/spaces/<space>/`.
- Invite links (`#/join/<token>`) grant **Bearbeiten** (writer) or **Nur lesen** (reader).
  The owner can change roles or remove members. Readers see a banner; their local edits are not
  uploaded (`SyncEngine.canPush`).
- For members the shared root appears at the top level of their sidebar (its real parent lives in
  the owner's knowledge base) - `Store.children(null)` includes such _orphan roots_.
- Card states, review logs and lectures stay personal: everyone learns with their own schedule.
- **Teilen beenden** (owner) deletes the space on the server; the owner's subtree becomes personal
  again and every member keeps a personal copy of the last state (`SharingService.reconcile`).

## Server objects

`supabase/migrations/20261117000000_sharing.sql`: tables `shares`, `spaces`, `space_members`,
`space_invites`, `space_records`; functions `get_share`, `pull_changes`, `create_space`,
`create_invite`, `join_space`, `my_spaces`, `set_space_member`, `leave_space`, `space_role`;
bucket `shares` and policies for `files/spaces/…`. All access is enforced with row-level security.

## Code map

| Piece                         | File                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| Scopes, presets               | `src/core/sharing/scope.ts`                                        |
| Snapshot build/clone/validate | `src/core/sharing/snapshot.ts`                                     |
| Space rules, roles            | `src/core/sharing/spaces.ts`                                       |
| Service (`app.sharing`)       | `src/data/services/sharing.ts`                                     |
| Server port + Supabase        | `src/data/sync/shareBackend.ts`, `src/data/sync/supabaseShare.ts`  |
| Test fake (multi-user server) | `src/data/testing/fakeRemote.ts`                                   |
| UI                            | `src/ui/sharing/ShareDialog.tsx`, `src/ui/sharing/SharedPages.tsx` |
