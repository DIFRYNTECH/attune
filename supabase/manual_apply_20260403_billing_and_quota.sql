-- Attune manual rollout script for Supabase SQL Editor
-- Apply this only after the base schema migration:
--   20260328110216_attune_minimal_v1.sql
--
-- This script combines these migrations in order:
--   20260401153000_play_store_purchases.sql
--   20260403130000_note_memory_plus_only.sql
--   20260403141000_ai_quota_reservations.sql
--   20260403142000_user_entitlements_add_stripe_source.sql
--   20260403153000_user_entitlements_add_paddle_source.sql

-- 1. Google Play purchase storage
begin;

create table if not exists public.play_store_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_name text not null check (char_length(package_name) between 1 and 200),
  product_id text not null check (char_length(product_id) between 1 and 200),
  purchase_token text not null unique check (char_length(purchase_token) between 1 and 512),
  linked_purchase_token text,
  order_id text,
  plan_id text not null references public.plan_catalog(plan_id),
  status text not null check (status in ('active', 'grace', 'past_due', 'canceled', 'expired')),
  acknowledged boolean not null default false,
  auto_renew_enabled boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  latest_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(latest_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_play_store_purchases_set_updated_at on public.play_store_purchases;
create trigger trg_play_store_purchases_set_updated_at
before update on public.play_store_purchases
for each row execute function public.set_updated_at();

create index if not exists play_store_purchases_user_idx
  on public.play_store_purchases (user_id, updated_at desc);

create index if not exists play_store_purchases_product_idx
  on public.play_store_purchases (product_id, status);

alter table public.play_store_purchases enable row level security;

commit;

-- 2. Restrict remote note memory to Plus users only
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

-- 3. Atomic AI quota reservation function
begin;

create or replace function public.reserve_ai_usage_quota(
  p_user_id uuid,
  p_kind text,
  p_model text,
  p_meta jsonb,
  p_daily_limit integer,
  p_monthly_limit integer,
  p_reservation_ttl_seconds integer default 900
)
returns table (
  allowed boolean,
  error text,
  usage_id uuid,
  daily_used integer,
  monthly_used integer,
  reset_at timestamptz,
  period text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('cached', false, 'quota_state', 'reserved');
  v_usage_id uuid;
  v_daily_used integer := 0;
  v_monthly_used integer := 0;
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', timezone('utc', now())) at time zone 'utc';
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_user_id::text, ''), 0));

  if p_user_id is null then
    return query select false, 'quota_lookup_failed'::text, null::uuid, 0, 0, null::timestamptz, null::text;
    return;
  end if;

  if p_daily_limit is not null then
    select count(*)::integer
    into v_daily_used
    from public.ai_usage
    where user_id = p_user_id
      and occurred_at >= v_day_start
      and (
        (success = true and coalesce((meta->>'cached')::boolean, false) = false)
        or (
          meta->>'quota_state' = 'reserved'
          and occurred_at >= v_now - make_interval(secs => greatest(p_reservation_ttl_seconds, 60))
        )
      );

    if v_daily_used >= p_daily_limit then
      return query select false, 'ai_daily_limit_reached'::text, null::uuid, v_daily_used, 0, v_day_start + interval '1 day', 'day'::text;
      return;
    end if;
  end if;

  if p_monthly_limit is not null then
    select count(*)::integer
    into v_monthly_used
    from public.ai_usage
    where user_id = p_user_id
      and occurred_at >= v_month_start
      and (
        (success = true and coalesce((meta->>'cached')::boolean, false) = false)
        or (
          meta->>'quota_state' = 'reserved'
          and occurred_at >= v_now - make_interval(secs => greatest(p_reservation_ttl_seconds, 60))
        )
      );

    if v_monthly_used >= p_monthly_limit then
      return query select false, 'ai_monthly_limit_reached'::text, null::uuid, coalesce(v_daily_used, 0), v_monthly_used, v_month_start + interval '1 month', 'month'::text;
      return;
    end if;
  end if;

  insert into public.ai_usage (user_id, kind, model, success, error_code, meta)
  values (
    p_user_id,
    case when char_length(coalesce(p_kind, '')) between 1 and 64 then p_kind else 'unknown' end,
    nullif(p_model, ''),
    false,
    null,
    v_meta
  )
  returning id into v_usage_id;

  return query select true, null::text, v_usage_id, coalesce(v_daily_used, 0) + 1, coalesce(v_monthly_used, 0) + 1, null::timestamptz, null::text;
end;
$$;

grant execute on function public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer) to service_role;

commit;

-- 4. Allow Stripe and Paddle as entitlement sources
begin;

alter table public.user_entitlements
  drop constraint if exists user_entitlements_source_check;

alter table public.user_entitlements
  add constraint user_entitlements_source_check
  check (source in ('manual', 'app_store', 'play_store', 'revenuecat', 'promo', 'stripe', 'paddle'));

commit;

-- 5. Verification queries
-- Run these after the script succeeds.

select to_regclass('public.play_store_purchases') as play_store_purchases_table;

select policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'note_memory'
order by policyname;

select proname
from pg_proc
where proname = 'reserve_ai_usage_quota';

select pg_get_constraintdef(oid) as user_entitlements_source_check
from pg_constraint
where conrelid = 'public.user_entitlements'::regclass
  and conname = 'user_entitlements_source_check';