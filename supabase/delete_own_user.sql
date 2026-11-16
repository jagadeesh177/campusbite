-- Run once in Supabase → SQL Editor. Used by "Delete account" (src/lib/account-deletion.ts):
-- a signed-in user can delete ONLY their own Supabase login. No service-role key is needed.
create or replace function public.delete_own_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_own_user() from public, anon;
grant execute on function public.delete_own_user() to authenticated;
