begin;

drop policy if exists "Users can update own device state" on public.user_device_state;

create policy "Users can update own device state"
  on public.user_device_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_device_state
  drop constraint if exists user_device_state_date_chk,
  drop constraint if exists user_device_state_level_chk,
  drop constraint if exists user_device_state_cap_chk,
  drop constraint if exists user_device_state_options_source_chk,
  drop constraint if exists user_device_state_json_shapes_chk,
  drop constraint if exists user_device_state_payload_size_chk;

alter table public.user_device_state
  add constraint user_device_state_date_chk
    check (date ~ '^\d{4}-\d{2}-\d{2}$') not valid,
  add constraint user_device_state_level_chk
    check (level in ('rest', 'gentle', 'light', 'steady', 'capable', 'brave')) not valid,
  add constraint user_device_state_cap_chk
    check (my_day_cap in (5, 10)) not valid,
  add constraint user_device_state_options_source_chk
    check (options_source in ('default', 'ai')) not valid,
  add constraint user_device_state_json_shapes_chk
    check (
      jsonb_typeof(checkin) = 'object'
      and jsonb_typeof(board_assigned) = 'array'
      and jsonb_typeof(my_day) = 'array'
      and jsonb_typeof(options) = 'array'
      and jsonb_typeof(events) = 'object'
      and jsonb_array_length(board_assigned) <= 15
      and jsonb_array_length(my_day) <= 10
      and jsonb_array_length(options) <= 15
    ) not valid,
  add constraint user_device_state_payload_size_chk
    check (
      pg_column_size(checkin) <= 2048
      and pg_column_size(board_assigned) <= 8192
      and pg_column_size(my_day) <= 8192
      and pg_column_size(options) <= 8192
      and pg_column_size(events) <= 65536
    ) not valid;

commit;
