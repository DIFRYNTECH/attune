begin;

drop policy if exists "note_memory_select_own" on public.note_memory;
drop policy if exists "note_memory_insert_own" on public.note_memory;
drop policy if exists "note_memory_update_own" on public.note_memory;
drop policy if exists "note_memory_delete_own" on public.note_memory;
drop policy if exists "note_memory_select_plus_only" on public.note_memory;
drop policy if exists "note_memory_insert_plus_only" on public.note_memory;
drop policy if exists "note_memory_update_plus_only" on public.note_memory;
drop policy if exists "note_memory_delete_plus_only" on public.note_memory;

create policy "note_memory_select_plus_only"
on public.note_memory for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and ue.plan_id = 'plus'
      and (
        ue.status in ('active', 'grace')
        or (
          ue.status = 'canceled'
          and ue.current_period_end is not null
          and ue.current_period_end >= now()
        )
      )
  )
);

create policy "note_memory_insert_plus_only"
on public.note_memory for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and ue.plan_id = 'plus'
      and (
        ue.status in ('active', 'grace')
        or (
          ue.status = 'canceled'
          and ue.current_period_end is not null
          and ue.current_period_end >= now()
        )
      )
  )
);

create policy "note_memory_update_plus_only"
on public.note_memory for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and ue.plan_id = 'plus'
      and (
        ue.status in ('active', 'grace')
        or (
          ue.status = 'canceled'
          and ue.current_period_end is not null
          and ue.current_period_end >= now()
        )
      )
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and ue.plan_id = 'plus'
      and (
        ue.status in ('active', 'grace')
        or (
          ue.status = 'canceled'
          and ue.current_period_end is not null
          and ue.current_period_end >= now()
        )
      )
  )
);

create policy "note_memory_delete_plus_only"
on public.note_memory for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and ue.plan_id = 'plus'
      and (
        ue.status in ('active', 'grace')
        or (
          ue.status = 'canceled'
          and ue.current_period_end is not null
          and ue.current_period_end >= now()
        )
      )
  )
);

commit;