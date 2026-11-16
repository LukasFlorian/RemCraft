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

1. Run the migrations (`supabase db push`, or paste
   `supabase/migrations/20261118000000_integrations.sql` into the SQL editor).
2. Deploy the function and set a random cron secret:

   ```bash
   supabase functions deploy todoist-daily --no-verify-jwt
   ```

   ```bash
   supabase secrets set CRON_SECRET=<long random string>
   ```

3. Schedule it hourly at minute 1 - either
   - **GitHub Actions** (included): add the repository secret `CRON_SECRET` (and the variable
     `SUPABASE_URL`); `.github/workflows/todoist-daily.yml` runs at `1 * * * *`. GitHub may delay
     scheduled runs by some minutes; or
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
4. In the app: _Settings → Integrationen (Todoist)_: paste the API token (Todoist → Settings →
   Integrations → Developer), choose project, time zone, priority, labels and title, switch
   **Aktiv** on. The preview shows the next 7 days.

## Adding another task manager

Implement the sending side next to `_shared/todoist.ts` (same `PlannedTask` input) and a branch
in the Edge Function; the planning side (`daily_plans`) is provider-independent.
