-- Attune (Supabase) minimal v1 schema
-- Tables: profiles, weekly_summaries, note_memory, ai_usage
-- Assumes Supabase auth schema exists (auth.users).
--
-- Naming alignment:
-- - The app calls this concept "weekly summaries".
-- - We use a single DB table name: public.weekly_summaries.
--
-- If you previously created public.weekly_snapshots and want to rename it:
--   alter table public.weekly_snapshots rename to weekly_summaries;
--   (Then update trigger/index/policy names as desired.)

begin;

-- Extensions (gen_random_uuid)
create extension if not exists pgcrypto;

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) profiles: per-user profile + settings to sync across devices
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  name text not null default '',
  email text,

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

-- Automatically create a profiles row for each new auth user.
-- Magic-link sign-in creates the user in auth.users; this keeps public.profiles in sync.
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

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

-- 2) weekly_summaries: weekly summary history (pace/archetype + light metrics + optional weekly note)
create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Store the week anchor day (e.g., Monday). Enforce one summary per week per user.
  week_start date not null,

  -- Maps well to the app's computed fields:
  -- - pace      ~ avgPace
  -- - archetype ~ weekType
  pace text check (pace in ('rest', 'gentle', 'light', 'steady', 'capable', 'brave')),
  archetype text check (archetype in ('Recovering Week', 'Resting Week', 'Gentle Week', 'Steady Week', 'Capable Week', 'Brave Week')),

  -- Weekly note ("This week’s note" in the UI)
  summary text,

  -- Light, flexible metrics (counts, small aggregates).
  -- Suggested keys: presence, completions, momentum, avgPaceIndex
  metrics jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint weekly_summaries_user_week_unique unique (user_id, week_start)
);

drop trigger if exists trg_weekly_summaries_set_updated_at on public.weekly_summaries;
create trigger trg_weekly_summaries_set_updated_at
before update on public.weekly_summaries
for each row execute function public.set_updated_at();

create index if not exists weekly_summaries_user_id_idx
  on public.weekly_summaries (user_id);

create index if not exists weekly_summaries_user_week_start_idx
  on public.weekly_summaries (user_id, week_start);

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

-- 3) note_memory: optional saved notes for personalization
create table if not exists public.note_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  note text not null,
  pinned boolean not null default false,
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_note_memory_set_updated_at on public.note_memory;
create trigger trg_note_memory_set_updated_at
before update on public.note_memory
for each row execute function public.set_updated_at();

create index if not exists note_memory_user_id_idx
  on public.note_memory (user_id);

create index if not exists note_memory_user_created_at_idx
  on public.note_memory (user_id, created_at desc);

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

-- 4) ai_usage: immutable per-request events (for quotas + abuse prevention)
-- Recommendation: write rows from server-side (Edge Function / API) using the Service Role key.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  occurred_at timestamptz not null default now(),
  kind text not null default 'generate_board', -- e.g. generate_board, summarize_week, etc.
  model text,

  prompt_tokens int,
  completion_tokens int,
  total_tokens int,

  success boolean not null default true,
  error_code text,

  meta jsonb not null default '{}'::jsonb
);

create index if not exists ai_usage_user_id_idx
  on public.ai_usage (user_id);

create index if not exists ai_usage_user_occurred_at_idx
  on public.ai_usage (user_id, occurred_at desc);

-- Useful for daily quotas without adding a separate date column
create index if not exists ai_usage_user_day_expr_idx
  on public.ai_usage (user_id, ((occurred_at at time zone 'utc')::date));

alter table public.ai_usage enable row level security;

-- Users can read their own usage (for UI transparency).
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
on public.ai_usage for select
using (auth.uid() = user_id);

-- No insert/update/delete policies on purpose:
-- - client cannot forge/erase quota events
-- - service role bypasses RLS and can write safely

commit;
