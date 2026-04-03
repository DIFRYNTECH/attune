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