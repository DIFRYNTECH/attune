begin;

-- Snapshot writers serialize on the user row. Merge learning here so an offline
-- device cannot erase another device's outcomes, exposures or preference removals.
create or replace function public.merge_activity_event_snapshots(previous jsonb, incoming jsonb)
returns jsonb language plpgsql stable
set search_path = pg_catalog, public
as $$
declare
  now_ms numeric := extract(epoch from now()) * 1000;
  records jsonb;
  result jsonb := '{}';
  preferences jsonb;
  item record;
  used_bytes integer;
  item_bytes integer;
begin
  if octet_length(coalesce(incoming, '{}')::text) > 524288 then
    raise exception 'activity_events_too_large';
  end if;
  with buckets as (
    select key as day, value from jsonb_each(case when jsonb_typeof(previous) = 'object' then previous else '{}' end)
    union all
    select key as day, value from jsonb_each(case when jsonb_typeof(incoming) = 'object' then incoming else '{}' end)
  ), expanded as (
    select day, event,
      case when event->>'ts' ~ '^[0-9]{1,15}$' then (event->>'ts')::numeric else 0 end as ts
    from buckets cross join lateral jsonb_array_elements(case when jsonb_typeof(value) = 'array' then value else '[]' end) as event
  ), valid as (
    select distinct on (event->>'id') day, event, ts
    from expanded
    where jsonb_typeof(event) = 'object' and jsonb_typeof(event->'id') = 'string'
      and length(event->>'id') between 1 and 80 and ts > 0 and ts <= now_ms + 300000
      and (event->>'type' = 'activityPreference' or (day ~ '^\d{4}-\d{2}-\d{2}$' and ts > now_ms - 7776000000))
    order by event->>'id', ts desc, event::text desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'event', event, 'ts', ts)), '[]') into records from valid;

  with choices as (
    select distinct on (identity, event->>'preference') event, ts
    from (
      select value->'event' as event, (value->>'ts')::numeric as ts,
        trim(regexp_replace(lower(coalesce(nullif(value->'event'->>'canonicalKey', ''), value->'event'->>'text')), '[^a-z0-9]+', ' ', 'g')) as identity
      from jsonb_array_elements(records)
    ) as source
    where event->>'type' = 'activityPreference' and event->>'preference' in ('favorite', 'hidden')
      and jsonb_typeof(event->'value') = 'boolean' and length(event->>'text') > 0 and length(identity) > 0
    order by identity, event->>'preference', ts desc, (event->>'id') collate "C" desc
  )
  select coalesce(jsonb_agg(event order by ts, event->>'id'), '[]') into preferences from choices;
  if jsonb_array_length(preferences) > 0 then result := jsonb_build_object('_preferences', preferences); end if;
  used_bytes := octet_length(result::text);
  if used_bytes > 131072 then raise exception 'activity_preferences_too_large'; end if;

  -- Protect the last week of exposures first, then outcomes, then older views.
  for item in
    select value->>'day' as day, value->'event' as event
    from jsonb_array_elements(records)
    where value->'event'->>'type' <> 'activityPreference'
    order by case when value->'event'->>'type' in ('activityViewed', 'activityShown') then
      case when (value->>'ts')::numeric > now_ms - 7 * 86400000 then 0 else 2 end else 1 end,
      (value->>'ts')::numeric desc, value->'event'->>'id'
  loop
    if jsonb_array_length(coalesce(result->item.day, '[]')) >= 250 then continue; end if;
    item_bytes := octet_length(item.event::text) + length(item.day) + 8;
    if used_bytes + item_bytes > 131072 then continue; end if;
    result := jsonb_set(result, array[item.day], coalesce(result->item.day, '[]') || jsonb_build_array(item.event));
    used_bytes := used_bytes + item_bytes;
  end loop;
  return result;
end;
$$;

revoke all on function public.merge_activity_event_snapshots(jsonb, jsonb) from public, anon;
grant execute on function public.merge_activity_event_snapshots(jsonb, jsonb) to authenticated, service_role;

create or replace function public.merge_device_activity_learning()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.events := public.merge_activity_event_snapshots(case when tg_op = 'UPDATE' then old.events else '{}' end, new.events);
  return new;
end;
$$;
revoke all on function public.merge_device_activity_learning() from public, anon, authenticated;
drop trigger if exists merge_device_activity_learning on public.user_device_state;
create trigger merge_device_activity_learning before insert or update on public.user_device_state
for each row execute function public.merge_device_activity_learning();

commit;
