begin;

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to service_role;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;
end $$;

drop policy if exists "play_store_purchases_service_role_all" on public.play_store_purchases;
create policy "play_store_purchases_service_role_all"
  on public.play_store_purchases
  for all
  to service_role
  using (true)
  with check (true);

commit;
