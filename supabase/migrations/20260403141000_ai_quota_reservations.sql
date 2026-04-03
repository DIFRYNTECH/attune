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