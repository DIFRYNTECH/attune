-- Cross-device sync: one row per user storing today's board, myDay, checkin, and events.
create table if not exists public.user_device_state (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  date        text        not null,          -- 'YYYY-MM-DD' of the stored day
  checkin     jsonb       not null default '{}',
  level       text        not null default 'gentle',
  checked_in_today boolean not null default false,
  board_assigned  jsonb   not null default '[]',
  my_day      jsonb       not null default '[]',
  my_day_cap  integer     not null default 5,
  options     jsonb       not null default '[]',
  options_source text     not null default 'default',
  events      jsonb       not null default '{}',
  updated_at  timestamptz not null default now()
);

-- One row per user (not per day — we only care about the latest snapshot).
create unique index if not exists user_device_state_user_id_idx
  on public.user_device_state(user_id);

alter table public.user_device_state enable row level security;

create policy "Users can read own device state"
  on public.user_device_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own device state"
  on public.user_device_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update own device state"
  on public.user_device_state for update
  using (auth.uid() = user_id);
