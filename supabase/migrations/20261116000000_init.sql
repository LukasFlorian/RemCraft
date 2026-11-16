-- RemCraft database schema (Supabase / PostgreSQL)
--
-- One generic table stores every record of every collection as JSON. This
-- keeps the schema stable while the app evolves: adding a field or even a new
-- collection needs no migration. Each user can only see and modify their own
-- rows (row-level security).
--
-- Apply with the Supabase CLI (`supabase db push`) or paste this file into the
-- SQL editor of the Supabase dashboard. The script is idempotent.

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------

create sequence if not exists public.records_seq;

create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  collection text    not null check (collection in ('rems', 'cards', 'logs', 'exams', 'schedulers', 'settings')),
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  -- Last-writer-wins timestamp (milliseconds, hybrid logical clock of the client).
  updated_at bigint  not null,
  -- Monotonic change sequence used by clients to pull incremental changes.
  seq        bigint  not null default nextval('public.records_seq'),
  primary key (user_id, collection, id)
);

create index if not exists records_user_seq_idx on public.records (user_id, seq);

-- Assign a fresh sequence number on every write and ignore stale writes:
-- if another device already stored a newer version, the update is skipped.
create or replace function public.records_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- keep the newer row
  end if;
  new.seq := nextval('public.records_seq');
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

alter table public.records enable row level security;

drop policy if exists "records are private" on public.records;
create policy "records are private" on public.records
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime notifications so other devices pull changes immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- File storage (images, PDFs): private bucket, one folder per user.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists "users manage own files" on storage.objects;
create policy "users manage own files" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Keep-alive endpoint
-- ---------------------------------------------------------------------------
-- Free Supabase projects pause after a week without activity. The GitHub
-- Actions workflow `.github/workflows/supabase-keepalive.yml` calls this
-- function every few days. It reveals nothing and touches the database.

create or replace function public.keepalive()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.records where false;
$$;

grant execute on function public.keepalive() to anon, authenticated;
