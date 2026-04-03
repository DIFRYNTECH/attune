begin;

alter table public.user_entitlements
  drop constraint if exists user_entitlements_source_check;

alter table public.user_entitlements
  add constraint user_entitlements_source_check
  check (source in ('manual', 'app_store', 'play_store', 'revenuecat', 'promo', 'stripe', 'paddle'));

commit;
