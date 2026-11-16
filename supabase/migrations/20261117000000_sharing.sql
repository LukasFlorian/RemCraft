-- Sharing: read-only link shares (snapshots) and shared spaces (live
-- collaboration). Idempotent; apply after 20261116000000_init.sql.
--
-- Read-only shares
--   `shares` holds a JSON snapshot per unguessable token. Anyone with the
--   link can read it through `get_share(token)` (also without an account);
--   its files live in the public bucket `shares` under `<token>/<file id>`
--   (public URLs, no listing).
--
-- Shared spaces
--   A space shares one subtree live. Its records live in `space_records`
--   (same shape as `records`, same global `seq`), visible to all members and
--   writable by owner/writers. `pull_changes` merges personal and space rows
--   for the sync engine. Invites are tokens granting a role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Read-only shares
-- ---------------------------------------------------------------------------

create table if not exists public.shares (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  root_id     text not null,
  scope_label text not null default '',
  snapshot    jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.shares enable row level security;

drop policy if exists "owners manage shares" on public.shares;
create policy "owners manage shares" on public.shares
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Anyone with the token may read the snapshot.
create or replace function public.get_share(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select snapshot from public.shares where token = p_token;
$$;

grant execute on function public.get_share(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('shares', 'shares', true)
on conflict (id) do update set public = true;

drop policy if exists "share owners manage share files" on storage.objects;
create policy "share owners manage share files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'shares'
    and exists (select 1 from public.shares s where s.token = (storage.foldername(name))[1] and s.owner_id = auth.uid())
  )
  with check (
    bucket_id = 'shares'
    and exists (select 1 from public.shares s where s.token = (storage.foldername(name))[1] and s.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Spaces
-- ---------------------------------------------------------------------------

create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  root_id    text not null,
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id  uuid not null references public.spaces (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null check (role in ('owner', 'writer', 'reader')),
  email     text,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.space_invites (
  token      text primary key default replace(gen_random_uuid()::text, '-', ''),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  role       text not null check (role in ('writer', 'reader')),
  created_at timestamptz not null default now()
);

create table if not exists public.space_records (
  space_id   uuid    not null references public.spaces (id) on delete cascade,
  collection text    not null,
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  seq        bigint  not null default nextval('public.records_seq'),
  primary key (space_id, collection, id)
);

create index if not exists space_records_seq_idx on public.space_records (space_id, seq);

-- Same last-writer-wins rule and sequence as `records`.
drop trigger if exists space_records_before_write on public.space_records;
create trigger space_records_before_write
  before insert or update on public.space_records
  for each row execute function public.records_before_write();

-- Role check without recursive RLS evaluation.
create or replace function public.space_role(p_space uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.space_members where space_id = p_space and user_id = auth.uid();
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invites enable row level security;
alter table public.space_records enable row level security;

drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces" on public.spaces
  for select to authenticated using (public.space_role(id) is not null);

drop policy if exists "members read members" on public.space_members;
create policy "members read members" on public.space_members
  for select to authenticated using (public.space_role(space_id) is not null);

drop policy if exists "members read records" on public.space_records;
create policy "members read records" on public.space_records
  for select to authenticated using (public.space_role(space_id) is not null);

drop policy if exists "writers insert records" on public.space_records;
create policy "writers insert records" on public.space_records
  for insert to authenticated with check (public.space_role(space_id) in ('owner', 'writer'));

drop policy if exists "writers update records" on public.space_records;
create policy "writers update records" on public.space_records
  for update to authenticated
  using (public.space_role(space_id) in ('owner', 'writer'))
  with check (public.space_role(space_id) in ('owner', 'writer'));

-- Invites are only reachable through the functions below (no policies).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_records'
  ) then
    alter publication supabase_realtime add table public.space_records;
  end if;
end;
$$;

-- Personal and shared changes after `since`, in sequence order.
create or replace function public.pull_changes(since bigint, lim integer)
returns table (collection text, id text, data jsonb, deleted boolean, updated_at bigint, seq bigint, space uuid)
language sql
security invoker
stable
set search_path = public
as $$
  select * from (
    select r.collection, r.id, r.data, r.deleted, r.updated_at, r.seq, null::uuid as space
    from public.records r
    where r.user_id = auth.uid() and r.seq > since
    union all
    select s.collection, s.id, s.data, s.deleted, s.updated_at, s.seq, s.space_id
    from public.space_records s
    where s.seq > since and public.space_role(s.space_id) is not null
  ) changes
  order by seq
  limit lim;
$$;

create or replace function public.create_space(p_name text, p_root text)
returns table (id uuid, name text, root_id text, owner_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.spaces (name, root_id, owner_id) values (p_name, p_root, auth.uid()) returning spaces.id into v_id;
  insert into public.space_members (space_id, user_id, role, email)
  values (v_id, auth.uid(), 'owner', auth.jwt() ->> 'email');
  return query select v_id, p_name, p_root, auth.uid(), 'owner'::text;
end;
$$;

create or replace function public.create_invite(p_space uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if public.space_role(p_space) is distinct from 'owner' then raise exception 'only the owner can invite'; end if;
  insert into public.space_invites (space_id, role) values (p_space, p_role) returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.my_spaces()
returns table (id uuid, name text, root_id text, owner_id uuid, role text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.name, s.root_id, s.owner_id, m.role
  from public.spaces s join public.space_members m on m.space_id = s.id
  where m.user_id = auth.uid();
$$;

create or replace function public.join_space(p_token text)
returns table (id uuid, name text, root_id text, owner_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.space_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_invite from public.space_invites where token = p_token;
  if not found then raise exception 'invalid invite'; end if;
  insert into public.space_members (space_id, user_id, role, email)
  values (v_invite.space_id, auth.uid(), v_invite.role, auth.jwt() ->> 'email')
  on conflict (space_id, user_id) do nothing;
  return query select * from public.my_spaces() s where s.id = v_invite.space_id;
end;
$$;

create or replace function public.set_space_member(p_space uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.space_role(p_space) is distinct from 'owner' or p_user = auth.uid() then
    raise exception 'not allowed';
  end if;
  if p_role is null then
    delete from public.space_members where space_id = p_space and user_id = p_user;
  else
    update public.space_members set role = p_role where space_id = p_space and user_id = p_user;
  end if;
end;
$$;

-- Members leave; the owner deletes the space (and all shared rows).
create or replace function public.leave_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.space_role(p_space) = 'owner' then
    delete from public.spaces where id = p_space;
  else
    delete from public.space_members where space_id = p_space and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.pull_changes(bigint, integer), public.create_space(text, text),
  public.create_invite(uuid, text), public.my_spaces(), public.join_space(text),
  public.set_space_member(uuid, uuid, text), public.leave_space(uuid), public.space_role(uuid)
  to authenticated;

-- Files of shared subtrees: `files/spaces/<space id>/<file id>`.
drop policy if exists "space members read files" on storage.objects;
create policy "space members read files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'files' and (storage.foldername(name))[1] = 'spaces'
    and public.space_role(((storage.foldername(name))[2])::uuid) is not null
  );

drop policy if exists "space writers write files" on storage.objects;
create policy "space writers write files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'files' and (storage.foldername(name))[1] = 'spaces'
    and public.space_role(((storage.foldername(name))[2])::uuid) in ('owner', 'writer')
  );

drop policy if exists "space writers update files" on storage.objects;
create policy "space writers update files" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'files' and (storage.foldername(name))[1] = 'spaces'
    and public.space_role(((storage.foldername(name))[2])::uuid) in ('owner', 'writer')
  );
