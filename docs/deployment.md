# Deployment (free)

RemCraft is a static site plus an optional Supabase project. Both fit comfortably into free
tiers:

| Service | Used for | Free tier (Nov 2026) |
|---|---|---|
| GitHub Pages | hosting the static app | public repositories (private with Pro) |
| GitHub Actions | CI, deployment, keep-alive | free for public repos, 2 000 min/month private |
| Supabase | auth, Postgres, realtime, file storage | 500 MB database, 1 GB storage, 50 000 monthly users; paused after 7 days without activity |

Without Supabase the app still works, but data stays in one browser.

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard> (any region close to you).
2. Open **SQL Editor**, paste [`supabase/migrations/20261116000000_init.sql`](../supabase/migrations/20261116000000_init.sql)
   and run it. It creates the `records` table with row-level security, the realtime
   publication, the private `files` storage bucket and the `keepalive()` function.
   *Alternative*: run the **Supabase migrate** workflow (needs the secrets listed in
   [`.github/workflows/supabase-migrate.yml`](../.github/workflows/supabase-migrate.yml)).
3. **Authentication → URL Configuration**: set *Site URL* to your app URL, e.g.
   `https://<user>.github.io/<repo>/`, and add it (plus `http://localhost:5173/` for development)
   to *Redirect URLs*. Magic links, confirmation and reset emails return there.
4. Optional: **Authentication → Providers → GitHub** to enable "Sign in with GitHub".
5. Note *Project URL* and the *anon public* key (**Project Settings → API**).

## 2. GitHub Pages

1. Push the repository to GitHub (public, or private with GitHub Pro).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** (not secrets; both values are
   public): `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually). The app is published
   at `https://<user>.github.io/<repo>/`. The workflow sets `VITE_BASE_PATH=/<repo>/`
   automatically; hash routing means no server rewrites are needed.

The **Supabase keep-alive** workflow calls `keepalive()` every Monday and Thursday so the free
project is not paused. GitHub disables scheduled workflows in repositories without activity for
60 days - re-enable it in the Actions tab if that happens (you get an email).

## 3. Use it on your devices

Open the URL on each device, go to **Settings → Account & Sync** and sign in. On phones use
"Add to Home Screen" to install the PWA.

## Without rebuilding: runtime configuration

If the build has no Supabase variables, *Settings → Account & Sync* lets you enter the project URL
and anon key; they are stored in the browser. Useful for forks or quick tests.

## Alternatives

- **Netlify / Cloudflare Pages / Vercel**: build command `npm run build`, output `dist`, set the
  environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and `VITE_BASE_PATH=/`).
- **Self-hosted Supabase** (Docker) works unchanged - point the variables at your instance.
- **Local only**: `npm run build` and serve `dist/` from any static server.

## Backups

Supabase free projects have no automatic backups you can restore. Use **Settings → Import,
Export & Data → Download full backup (JSON)** regularly; restore it on the same page.
