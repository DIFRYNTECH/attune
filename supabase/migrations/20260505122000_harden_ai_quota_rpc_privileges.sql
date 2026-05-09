begin;

revoke execute on function public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer) from public;
revoke execute on function public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer) from anon;
revoke execute on function public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer) from authenticated;

grant execute on function public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer) to service_role;

commit;
