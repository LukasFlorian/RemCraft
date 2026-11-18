-- ---------------------------------------------------------------------------
-- Self-service account deletion (GDPR Art. 17).
-- ---------------------------------------------------------------------------
-- Deletes the calling user from auth.users. Every table with user data
-- references auth.users with `on delete cascade` (records, shares, spaces and
-- their members/invites/records, integrations, integration secrets, daily
-- plans), so this removes all of it. Storage objects cannot be deleted with
-- SQL; the client removes its files through the Storage API first
-- (`AuthService.deleteAccount`).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
