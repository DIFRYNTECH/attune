begin;

alter table public.user_device_state
  drop constraint if exists user_device_state_payload_size_chk;

alter table public.user_device_state
  add constraint user_device_state_payload_size_chk
    check (
      pg_column_size(checkin) <= 2048
      and pg_column_size(board_assigned) <= 8192
      and pg_column_size(my_day) <= 8192
      and pg_column_size(options) <= 8192
      and pg_column_size(events) <= 262144
    ) not valid;

alter table public.user_device_state validate constraint user_device_state_date_chk;
alter table public.user_device_state validate constraint user_device_state_level_chk;
alter table public.user_device_state validate constraint user_device_state_cap_chk;
alter table public.user_device_state validate constraint user_device_state_options_source_chk;
alter table public.user_device_state validate constraint user_device_state_json_shapes_chk;
alter table public.user_device_state validate constraint user_device_state_payload_size_chk;

commit;
