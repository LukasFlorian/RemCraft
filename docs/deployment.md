# Deployment (free)

RemCraft is a static site plus an optional Supabase project. Both fit comfortably into free
tiers:

| Service        | Used for                               | Free tier (Nov 2026)                                                                      |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| GitHub Pages   | hosting the static app                 | public repositories (private with Pro)                                                    |
| GitHub Actions | CI, deployment, keep-alive             | free for public repos, 2 000 min/month private                                            |
| Supabase       | auth, Postgres, realtime, file storage | 500 MB database, 1 GB storage, 50 000 monthly users; paused after 7 days without activity |

Without Supabase the app still works, but data stays in one browser.

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard> (any region close to you).
2. Open **SQL Editor** and run the files of [`supabase/migrations/`](../supabase/migrations) in
   order: `…_init.sql` (records table with row-level security, realtime, private `files`
   bucket, `keepalive()`), `…_sharing.sql` (links and shared spaces, see [sharing.md](sharing.md))
   and `…_integrations.sql` (Todoist, see [integrations.md](integrations.md)). All are idempotent.
   _Alternative_: run the **Supabase migrate** workflow (needs the secrets listed in
   [`.github/workflows/supabase-migrate.yml`](../.github/workflows/supabase-migrate.yml)).
3. **Authentication → URL Configuration**: set _Site URL_ to your app URL, e.g.
   `https://<user>.github.io/<repo>/`, and add it (plus `http://localhost:5173/` for development)
   to _Redirect URLs_. Magic links, confirmation and reset emails return there.
4. Optional: **Authentication → Providers → GitHub** to enable "Sign in with GitHub".
5. Note _Project URL_ and the _anon public_ key (**Project Settings → API**).

## 2. GitHub Pages

1. Push the repository to GitHub (public, or private with GitHub Pro).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** (not secrets; both values are
   public): `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Push to `main` (or run the _Deploy to GitHub Pages_ workflow manually). The app is published
   at `https://<user>.github.io/<repo>/`. The workflow sets `VITE_BASE_PATH=/<repo>/`
   automatically; hash routing means no server rewrites are needed.

The **Supabase keep-alive** workflow calls `keepalive()` every Monday and Thursday so the free
project is not paused. GitHub disables scheduled workflows in repositories without activity for
60 days - re-enable it in the Actions tab if that happens (you get an email).

## Optional: Todoist daily tasks

Deploy the Edge Function `todoist-daily` (GitHub workflow _Supabase functions_, dashboard editor
or CLI) and schedule it hourly - see [integrations.md](integrations.md#setup).

## Optional: own (sub)domain

1. DNS (where your domain's zone is managed): `CNAME` record `remcraft` → `<user>.github.io.`
2. GitHub: _Settings → Pages → Custom domain_ `remcraft.example.com`, save, wait for the DNS
   check, then tick **Enforce HTTPS**. (Recommended: verify the domain under your account's
   _Settings → Pages_ to prevent takeovers.)
3. Repository variable `BASE_PATH` = `/`, then re-run the deploy workflow.
4. Supabase _Authentication → URL Configuration_: Site URL and Redirect URLs =
   `https://remcraft.example.com/`; GitHub OAuth app homepage URL likewise
   (the callback URL stays the Supabase one).

## 3. Use it on your devices

Open the URL on each device, go to **Settings → Account & Sync** and sign in. On phones use
"Add to Home Screen" to install the PWA.

## Without rebuilding: runtime configuration

If the build has no Supabase variables, _Settings → Account & Sync_ lets you enter the project URL
and anon key; they are stored in the browser. Useful for forks or quick tests.

## Alternatives

- **Netlify / Cloudflare Pages / Vercel**: build command `npm run build`, output `dist`, set the
  environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and `VITE_BASE_PATH=/`).
- **Self-hosted Supabase** (Docker) works unchanged - point the variables at your instance.
- **Local only**: `npm run build` and serve `dist/` from any static server.

## Backups

Supabase free projects have no automatic backups you can restore. Use **Settings → Import,
Export & Data → Download full backup (JSON)** regularly; restore it on the same page.
