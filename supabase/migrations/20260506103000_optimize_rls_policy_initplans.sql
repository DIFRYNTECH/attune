begin;

create index if not exists play_store_purchases_plan_id_idx
  on public.play_store_purchases (plan_id);

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
  on public.ai_usage
  for select
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own"
  on public.user_entitlements
  for select
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to public
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "weekly_summaries_select_own" on public.weekly_summaries;
create policy "weekly_summaries_select_own"
  on public.weekly_summaries
  for select
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "weekly_summaries_insert_own" on public.weekly_summaries;
create policy "weekly_summaries_insert_own"
  on public.weekly_summaries
  for insert
  to public
  with check ((select auth.uid()) = user_id);

drop policy if exists "weekly_summaries_update_own" on public.weekly_summaries;
create policy "weekly_summaries_update_own"
  on public.weekly_summaries
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "weekly_summaries_delete_own" on public.weekly_summaries;
create policy "weekly_summaries_delete_own"
  on public.weekly_summaries
  for delete
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own device state" on public.user_device_state;
create policy "Users can read own device state"
  on public.user_device_state
  for select
  to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own device state" on public.user_device_state;
create policy "Users can insert own device state"
  on public.user_device_state
  for insert
  to public
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own device state" on public.user_device_state;
create policy "Users can update own device state"
  on public.user_device_state
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "note_memory_select_plus_only" on public.note_memory;
create policy "note_memory_select_plus_only"
  on public.note_memory
  for select
  to public
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = (select auth.uid())
        and ue.plan_id = 'plus'
        and (
          ue.status = any (array['active'::text, 'grace'::text])
          or (
            ue.status = 'canceled'
            and ue.current_period_end is not null
            and ue.current_period_end >= now()
          )
        )
    )
  );

drop policy if exists "note_memory_insert_plus_only" on public.note_memory;
create policy "note_memory_insert_plus_only"
  on public.note_memory
  for insert
  to public
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = (select auth.uid())
        and ue.plan_id = 'plus'
        and (
          ue.status = any (array['active'::text, 'grace'::text])
          or (
            ue.status = 'canceled'
            and ue.current_period_end is not null
            and ue.current_period_end >= now()
          )
        )
    )
  );

drop policy if exists "note_memory_update_plus_only" on public.note_memory;
create policy "note_memory_update_plus_only"
  on public.note_memory
  for update
  to public
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = (select auth.uid())
        and ue.plan_id = 'plus'
        and (
          ue.status = any (array['active'::text, 'grace'::text])
          or (
            ue.status = 'canceled'
            and ue.current_period_end is not null
            and ue.current_period_end >= now()
          )
        )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = (select auth.uid())
        and ue.plan_id = 'plus'
        and (
          ue.status = any (array['active'::text, 'grace'::text])
          or (
            ue.status = 'canceled'
            and ue.current_period_end is not null
            and ue.current_period_end >= now()
          )
        )
    )
  );

drop policy if exists "note_memory_delete_plus_only" on public.note_memory;
create policy "note_memory_delete_plus_only"
  on public.note_memory
  for delete
  to public
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = (select auth.uid())
        and ue.plan_id = 'plus'
        and (
          ue.status = any (array['active'::text, 'grace'::text])
          or (
            ue.status = 'canceled'
            and ue.current_period_end is not null
            and ue.current_period_end >= now()
          )
        )
    )
  );

commit;
