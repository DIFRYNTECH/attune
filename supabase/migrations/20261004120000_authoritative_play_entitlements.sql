begin;

alter table public.user_entitlements add column if not exists provider_verified_at timestamptz;
alter table public.play_store_purchases add column if not exists provider_verified_at timestamptz;

create or replace function public.persist_verified_play_purchase(
  p_user_id uuid, p_purchase jsonb, p_verified_at timestamptz
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  current_entitlement public.user_entitlements%rowtype;
  existing_purchase public.play_store_purchases%rowtype;
  selected_purchase public.play_store_purchases%rowtype;
  inserted_id uuid;
begin
  if p_user_id is null or p_verified_at is null or p_verified_at > now() + interval '5 minutes'
    or jsonb_typeof(p_purchase) <> 'object' or coalesce(p_purchase->>'purchase_token', '') = '' then
    raise exception 'invalid_verified_play_purchase';
  end if;

  insert into public.user_entitlements(user_id, plan_id, status, source)
  values (p_user_id, 'free', 'active', 'manual') on conflict(user_id) do nothing;
  -- Serialize all subscription changes for this user, including token replacements.
  select * into current_entitlement from public.user_entitlements where user_id = p_user_id for update;
  select * into existing_purchase from public.play_store_purchases
    where purchase_token = p_purchase->>'purchase_token' for update;
  if found then
    if existing_purchase.user_id <> p_user_id then raise exception 'google_play_purchase_already_linked'; end if;
    if existing_purchase.provider_verified_at >= p_verified_at then return false; end if;
  end if;

  insert into public.play_store_purchases as stored (
    user_id, package_name, product_id, purchase_token, linked_purchase_token, order_id,
    plan_id, status, acknowledged, auto_renew_enabled, current_period_start, current_period_end,
    latest_payload, provider_verified_at
  ) values (
    p_user_id, p_purchase->>'package_name', p_purchase->>'product_id', p_purchase->>'purchase_token',
    p_purchase->>'linked_purchase_token', p_purchase->>'order_id', p_purchase->>'plan_id', p_purchase->>'status',
    coalesce((p_purchase->>'acknowledged')::boolean, false), coalesce((p_purchase->>'auto_renew_enabled')::boolean, false),
    (p_purchase->>'current_period_start')::timestamptz, (p_purchase->>'current_period_end')::timestamptz,
    coalesce(p_purchase->'latest_payload', '{}'::jsonb), p_verified_at
  ) on conflict (purchase_token) do update set
    package_name = excluded.package_name, product_id = excluded.product_id,
    linked_purchase_token = excluded.linked_purchase_token, order_id = excluded.order_id,
    plan_id = excluded.plan_id, status = excluded.status, acknowledged = excluded.acknowledged,
    auto_renew_enabled = excluded.auto_renew_enabled, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, latest_payload = excluded.latest_payload,
    provider_verified_at = excluded.provider_verified_at
  where stored.user_id = p_user_id
  returning id into inserted_id;
  -- Also closes the race where two users first present the same token together.
  if inserted_id is null then raise exception 'google_play_purchase_already_linked'; end if;

  -- Keep explicit grants and other current provider subscriptions separate.
  if current_entitlement.source <> 'play_store' and current_entitlement.plan_id = 'plus'
    and current_entitlement.status in ('active', 'grace', 'canceled')
    and (current_entitlement.current_period_end > now()
      or (current_entitlement.source in ('manual', 'promo') and current_entitlement.status = 'active'
        and current_entitlement.current_period_end is null)) then
    return true;
  end if;

  -- An old token's cancellation must not revoke a newer valid purchase.
  select * into selected_purchase from public.play_store_purchases
  where user_id = p_user_id
  order by (plan_id = 'plus' and status in ('active', 'grace', 'canceled') and
    (current_period_end > now() or (status in ('active', 'grace') and provider_verified_at > now() - interval '5 minutes'))) desc nulls last,
    current_period_end desc nulls last, provider_verified_at desc nulls last, id
  limit 1;

  update public.user_entitlements set
    plan_id = selected_purchase.plan_id, status = selected_purchase.status, source = 'play_store',
    provider_subscription_id = selected_purchase.purchase_token, provider_customer_id = null,
    current_period_start = selected_purchase.current_period_start, current_period_end = selected_purchase.current_period_end,
    provider_verified_at = selected_purchase.provider_verified_at
  where user_id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.persist_verified_play_purchase(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.persist_verified_play_purchase(uuid, jsonb, timestamptz) to service_role;

-- Enforce the same paid-period policy for direct database access as for API calls.
create or replace function public.current_user_has_plus() returns boolean
language sql stable security invoker set search_path = public
as $$
  select exists (
    select 1 from public.user_entitlements ue
    where ue.user_id = (select auth.uid()) and ue.plan_id = 'plus'
      and ue.status in ('active', 'grace', 'canceled')
      and (ue.current_period_end > now()
        or (ue.source in ('manual', 'promo') and ue.status = 'active' and ue.current_period_end is null)
        or (ue.source = 'play_store' and ue.status in ('active', 'grace')
          and ue.provider_verified_at <= now() and ue.provider_verified_at > now() - interval '5 minutes'))
  );
$$;
revoke execute on function public.current_user_has_plus() from public, anon;
grant execute on function public.current_user_has_plus() to authenticated, service_role;

drop policy if exists "note_memory_select_plus_only" on public.note_memory;
create policy "note_memory_select_plus_only" on public.note_memory for select to authenticated
using ((select auth.uid()) = user_id and (select public.current_user_has_plus()));
drop policy if exists "note_memory_insert_plus_only" on public.note_memory;
create policy "note_memory_insert_plus_only" on public.note_memory for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.current_user_has_plus()));
drop policy if exists "note_memory_update_plus_only" on public.note_memory;
create policy "note_memory_update_plus_only" on public.note_memory for update to authenticated
using ((select auth.uid()) = user_id and (select public.current_user_has_plus()))
with check ((select auth.uid()) = user_id and (select public.current_user_has_plus()));
drop policy if exists "note_memory_delete_plus_only" on public.note_memory;
create policy "note_memory_delete_plus_only" on public.note_memory for delete to authenticated
using ((select auth.uid()) = user_id);

-- SELECT RLS also applies to filtered deletes. This narrow, parameterless RPC
-- lets expired users erase only their own notes without reopening paid reads.
create or replace function public.delete_own_note_memory() returns integer
language plpgsql security definer set search_path = public
as $$
declare deleted_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  delete from public.note_memory where user_id = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.delete_own_note_memory() from public, anon;
grant execute on function public.delete_own_note_memory() to authenticated;

commit;
