# Integrations: Todoist daily study tasks

Every night at **00:01** (your time zone) RemCraft adds one Todoist task per course
("Vorlesung" = nearest folder, else the top-level document) for the cards planned that day,
with an **estimated duration** and no fixed time, e.g.

> **ML lernen (~25 min)** · due today · 25 min
> 18 Wiederholungen, 6 neue Karten · Prüfung: ML-Klausur (14 Karten) · [In RemCraft üben](…)

## How it works

1. **Plan in the browser.** `forecastDailyPlans` (`src/data/services/integrations.ts`) runs the
   real queue (`buildGlobalQueue`) for each of the next 14 days: exam quotas from the exam
   scheduler, due reviews, learning cards, priorities, new-card limits. `buildDailyTasks`
   (`src/core/planning/daily.ts`) groups the queue by course and estimates minutes from your
   review history (seconds per answer, answers per new card / review; rounded up to 5 min).
2. **Upload.** When enabled, the plan is uploaded to `daily_plans` after every relevant change
   (debounced). Days ahead assume nothing is practised before; the 00:01 run uses whatever was
   uploaded last.
3. **Send.** The Edge Function `supabase/functions/todoist-daily` is triggered hourly. For each
   user it sends today's tasks on the first call after local midnight (retried hourly until
   06:00 on errors). Tasks are created in the configured project (created if missing) or, if
   already created that day, updated; tasks you completed or deleted are left alone
   (`supabase/functions/_shared/todoist.ts`, Todoist API v1).
4. **Jetzt senden** in the settings runs the same code for today immediately.

The Todoist API token is written through `set_todoist_token()` into `integration_secrets`,
which clients can never read; only the Edge Function (service role) can.

## Setup

Four steps: database tables, the Edge Function, its secret `CRON_SECRET`, and an hourly trigger.
No local tools are needed if you use variant A or B for the function.

### 1. Database

Run the migrations: paste `supabase/migrations/20261118000000_integrations.sql` into the
dashboard's **SQL Editor** (or run the _Supabase migrate_ workflow / `supabase db push --remote`).

### 2. Edge Function and `CRON_SECRET`

`CRON_SECRET` is any long random string (e.g. from a password manager). The hourly trigger sends
it, and the function only accepts nightly runs that carry it.

#### Variant A - GitHub Actions (recommended)

The workflow `.github/workflows/supabase-functions.yml` deploys `todoist-daily` on every push to
`main` that changes `supabase/functions/**`, and on demand (_Actions → Supabase functions → Run
workflow_). It also copies `CRON_SECRET` from GitHub to the function, so the secret lives in one
place. Without the settings below it ends with a hint instead of failing.

In the repository on GitHub, _Settings → Secrets and variables → Actions_:

| Where       | Name                    | Value                                                                                                                                                                        |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Secrets_   | `SUPABASE_ACCESS_TOKEN` | a personal access token: Supabase dashboard → your avatar → _Account preferences_ → _Access Tokens_ (<https://supabase.com/dashboard/account/tokens>) → _Generate new token_ |
| _Secrets_   | `CRON_SECRET`           | your random string (also used by the hourly trigger)                                                                                                                         |
| _Variables_ | `SUPABASE_PROJECT_REF`  | the project reference: the `xyz` in `https://xyz.supabase.co` (also under _Project Settings → General → Project ID_)                                                         |

Then run the workflow once (_Actions → Supabase functions → Run workflow_). It deploys with
`--no-verify-jwt` (also set in `supabase/config.toml`): the function checks the cron secret or
the user's login itself.

#### Variant B - dashboard editor (no GitHub settings)

1. Supabase dashboard → _Edge Functions_ → _Deploy a new function_ → _Via Editor_.
2. Name it exactly `todoist-daily`, replace the template with the content of
   [`supabase/functions/todoist-daily/single-file.ts`](../supabase/functions/todoist-daily/single-file.ts)
   (the function in one file - the editor has no `_shared` folder) and deploy.
3. In the function's _Details_/_Settings_, switch **off** JWT verification ("Verify JWT" /
   "Enforce JWT verification", wording varies).
4. _Edge Functions → Secrets_ (or _Project Settings → Edge Functions_): add `CRON_SECRET`.

After changes to the function, paste the file again (`single-file.ts` is regenerated with
`node scripts/build-function-single-file.mjs`; a test fails if it is outdated).

#### Variant C - Supabase CLI

```bash
supabase functions deploy todoist-daily --no-verify-jwt --remote=<ref>
```

```bash
supabase secrets set CRON_SECRET=<long random string> --remote=<ref>
```

### 3. Hourly trigger

Call the function hourly at minute 1 - either

- **GitHub Actions** (included): with the secret `CRON_SECRET` and the variable `SUPABASE_URL`
  (`https://xyz.supabase.co`, already needed for the app build) set,
  `.github/workflows/todoist-daily.yml` runs at `1 * * * *`. GitHub may delay scheduled runs by
  some minutes; failed or late runs are retried until 06:00; or
- **pg_cron** (exact timing): in the SQL editor

  ```sql
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  select cron.schedule('todoist-daily', '1 * * * *', $$
    select net.http_post(
      url := 'https://<project>.supabase.co/functions/v1/todoist-daily',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
      body := '{"mode":"cron"}'::jsonb)
  $$);
  ```

### 4. In the app

_Settings → Integrationen (Todoist)_: paste the API token (Todoist → Settings → Integrations →
Developer), choose project, time zone, priority, labels and title, switch **Aktiv** on. The
preview shows the next 7 days; **Heute jetzt senden** tests the whole chain immediately.

## Adding another task manager

Implement the sending side next to `_shared/todoist.ts` (same `PlannedTask` input) and a branch
in the Edge Function; the planning side (`daily_plans`) is provider-independent.
