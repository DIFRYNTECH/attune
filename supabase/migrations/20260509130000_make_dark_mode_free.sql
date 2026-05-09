-- Dark mode is a comfort/accessibility preference, not a paid entitlement.
update public.plan_catalog
set entitlements = jsonb_set(coalesce(entitlements, '{}'::jsonb), '{darkMode}', 'true'::jsonb, true)
where plan_id = 'free';
