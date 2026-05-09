-- Attune (Supabase) minimal v1 schema
-- Tables: plan_catalog, user_entitlements, profiles, weekly_summaries, note_memory, ai_usage
-- Assumes Supabase auth schema exists (auth.users).
--
-- Naming alignment:
-- - The app calls this concept "weekly summaries".
-- - We use a single DB table name: public.weekly_summaries.
-- - We store one note-memory row per user per local day using note_date.
-- - Billing is represented by a small plan catalog and per-user entitlements.
--
-- If you previously created public.weekly_snapshots and want to rename it:
--   alter table public.weekly_snapshots rename to weekly_summaries;
--   (Then update trigger/index/policy names as desired.)

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.plan_catalog (
  plan_id text primary key check (plan_id in ('free', 'plus')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  ai_daily_request_limit integer not null check (ai_daily_request_limit >= 0),
  ai_monthly_request_limit integer check (ai_monthly_request_limit is null or ai_monthly_request_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_plan_catalog_set_updated_at on public.plan_catalog;
create trigger trg_plan_catalog_set_updated_at
before update on public.plan_catalog
for each row execute function public.set_updated_at();

alter table public.plan_catalog enable row level security;

drop policy if exists "plan_catalog_select_active" on public.plan_catalog;
create policy "plan_catalog_select_active"
on public.plan_catalog for select
using (is_active = true);

insert into public.plan_catalog (
  plan_id,
  display_name,
  entitlements,
  ai_daily_request_limit,
  ai_monthly_request_limit
)
values
  (
    'free',
    'Free',
    '{
      "darkMode": true,
      "noteMemory": false,
      "smartPick": false,
      "momentumExact": false,
      "multiWeekHistory": false,
      "patternCallouts": false,
      "deepInsights": false
    }'::jsonb,
    20,
    null
  ),
  (
    'plus',
    'Plus',
    '{
      "darkMode": true,
      "noteMemory": true,
      "smartPick": true,
      "momentumExact": true,
      "multiWeekHistory": true,
      "patternCallouts": true,
      "deepInsights": true
    }'::jsonb,
    200,
    null
  )
on conflict (plan_id) do update
set display_name = excluded.display_name,
    entitlements = excluded.entitlements,
    ai_daily_request_limit = excluded.ai_daily_request_limit,
    ai_monthly_request_limit = excluded.ai_monthly_request_limit,
    is_active = true,
    updated_at = now();

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plan_catalog(plan_id),
  status text not null check (status in ('active', 'grace', 'past_due', 'canceled', 'expired')),
  source text not null check (source in ('manual', 'app_store', 'play_store', 'revenuecat', 'promo')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_period_chk check (
    (current_period_start is null and current_period_end is null)
    or (
      current_period_start is not null
      and current_period_end is not null
      and current_period_end >= current_period_start
    )
  )
);

drop trigger if exists trg_user_entitlements_set_updated_at on public.user_entitlements;
create trigger trg_user_entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

create index if not exists user_entitlements_plan_status_idx
  on public.user_entitlements (plan_id, status);

create index if not exists user_entitlements_period_end_idx
  on public.user_entitlements (current_period_end desc);

alter table public.user_entitlements enable row level security;

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own"
on public.user_entitlements for select
using (auth.uid() = user_id);

insert into public.user_entitlements (user_id, plan_id, status, source)
select id, 'free', 'active', 'manual'
from auth.users
on conflict (user_id) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  email text check (email is null or char_length(email) <= 120),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  use_note_for_ai boolean not null default true,
  my_day_cap smallint not null default 5 check (my_day_cap between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles for delete
using (auth.uid() = user_id);

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  pace text check (pace in ('rest', 'gentle', 'light', 'steady', 'capable', 'brave')),
  archetype text check (archetype in ('Recovering Week', 'Resting Week', 'Gentle Week', 'Steady Week', 'Capable Week', 'Brave Week')),
  summary text check (summary is null or char_length(summary) <= 500),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_summaries_user_week_unique unique (user_id, week_start)
);

drop trigger if exists trg_weekly_summaries_set_updated_at on public.weekly_summaries;
create trigger trg_weekly_summaries_set_updated_at
before update on public.weekly_summaries
for each row execute function public.set_updated_at();

alter table public.weekly_summaries enable row level security;

drop policy if exists "weekly_summaries_select_own" on public.weekly_summaries;
create policy "weekly_summaries_select_own"
on public.weekly_summaries for select
using (auth.uid() = user_id);

drop policy if exists "weekly_summaries_insert_own" on public.weekly_summaries;
create policy "weekly_summaries_insert_own"
on public.weekly_summaries for insert
with check (auth.uid() = user_id);

drop policy if exists "weekly_summaries_update_own" on public.weekly_summaries;
create policy "weekly_summaries_update_own"
on public.weekly_summaries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "weekly_summaries_delete_own" on public.weekly_summaries;
create policy "weekly_summaries_delete_own"
on public.weekly_summaries for delete
using (auth.uid() = user_id);

create table if not exists public.note_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null,
  note text not null check (char_length(note) between 1 and 200),
  themes jsonb not null default '[]'::jsonb check (jsonb_typeof(themes) = 'array'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_memory_user_note_date_unique unique (user_id, note_date)
);

drop trigger if exists trg_note_memory_set_updated_at on public.note_memory;
create trigger trg_note_memory_set_updated_at
before update on public.note_memory
for each row execute function public.set_updated_at();

create index if not exists note_memory_user_note_date_idx
  on public.note_memory (user_id, note_date desc);

create index if not exists note_memory_user_last_used_at_idx
  on public.note_memory (user_id, last_used_at desc);

alter table public.note_memory enable row level security;

drop policy if exists "note_memory_select_own" on public.note_memory;
create policy "note_memory_select_own"
on public.note_memory for select
using (auth.uid() = user_id);

drop policy if exists "note_memory_insert_own" on public.note_memory;
create policy "note_memory_insert_own"
on public.note_memory for insert
with check (auth.uid() = user_id);

drop policy if exists "note_memory_update_own" on public.note_memory;
create policy "note_memory_update_own"
on public.note_memory for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "note_memory_delete_own" on public.note_memory;
create policy "note_memory_delete_own"
on public.note_memory for delete
using (auth.uid() = user_id);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind text not null default 'generate_board' check (char_length(kind) between 1 and 64),
  model text,
  prompt_tokens int check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens int check (completion_tokens is null or completion_tokens >= 0),
  total_tokens int check (total_tokens is null or total_tokens >= 0),
  success boolean not null default true,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')
);

create index if not exists ai_usage_user_occurred_at_idx
  on public.ai_usage (user_id, occurred_at desc);

create index if not exists ai_usage_user_kind_occurred_at_idx
  on public.ai_usage (user_id, kind, occurred_at desc);

create index if not exists ai_usage_user_day_expr_idx
  on public.ai_usage (user_id, ((occurred_at at time zone 'utc')::date));

create or replace function public.count_billable_ai_usage(
  p_user_id uuid,
  p_since timestamptz
)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from public.ai_usage
  where user_id = p_user_id
    and success = true
    and occurred_at >= p_since
    and coalesce((meta->>'cached')::boolean, false) = false;
$$;

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
on public.ai_usage for select
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (user_id) do nothing;

  insert into public.user_entitlements (user_id, plan_id, status, source)
  values (new.id, 'free', 'active', 'manual')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

commit;
