-- Task-manager integrations (Todoist). Idempotent.
--
-- The app uploads its study plan for the next days to `daily_plans`. The Edge
-- Function `todoist-daily` runs every hour (see docs/integrations.md for the
-- schedule) and, at 00:01 in each user's time zone, sends that day's tasks to
-- Todoist. The Todoist token lives in `integration_secrets`, which clients
-- can write (through `set_todoist_token`) but never read.

create table if not exists public.integrations (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  todoist_enabled boolean not null default false,
  project_name    text not null default 'RemCraft',
  timezone        text not null default 'Europe/Berlin',
  title_template  text not null default '{course} lernen (~{minutes} min)',
  labels          text[] not null default '{}',
  priority        smallint not null default 1 check (priority between 1 and 4),
  -- Written by the Edge Function.
  project_id      text,
  task_map        jsonb not null default '{}'::jsonb,
  last_run_date   date,
  last_run_at     timestamptz,
  last_result     text,
  last_error      text,
  updated_at      timestamptz not null default now()
);

alter table public.integrations enable row level security;

drop policy if exists "users manage own integrations" on public.integrations;
create policy "users manage own integrations" on public.integrations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.integration_secrets (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  todoist_token text
);

-- No policies: only the service role (Edge Function) can read secrets.
alter table public.integration_secrets enable row level security;

create or replace function public.set_todoist_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.integration_secrets (user_id, todoist_token) values (auth.uid(), p_token)
  on conflict (user_id) do update set todoist_token = excluded.todoist_token;
end;
$$;

create or replace function public.has_todoist_token()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select todoist_token is not null from public.integration_secrets where user_id = auth.uid()), false);
$$;

grant execute on function public.set_todoist_token(text), public.has_todoist_token() to authenticated;

create table if not exists public.daily_plans (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date  date not null,
  tasks      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

alter table public.daily_plans enable row level security;

drop policy if exists "users manage own plans" on public.daily_plans;
create policy "users manage own plans" on public.daily_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
