import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(repoRoot, "supabase", "migrations");

function readMigration(name) {
  return readFileSync(join(migrationsDir, name), "utf8").toLowerCase();
}

test("reserve_ai_usage_quota is not executable by browser-facing roles", () => {
  const sql = readMigration("20260505122000_harden_ai_quota_rpc_privileges.sql").replace(/\s+/g, " ");
  const signature = "public.reserve_ai_usage_quota(uuid, text, text, jsonb, integer, integer, integer)";

  assert.match(sql, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from public`));
  assert.match(sql, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from anon`));
  assert.match(sql, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from authenticated`));
  assert.match(sql, new RegExp(`grant execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to service_role`));
});

test("security definer helper functions are hardened", () => {
  const sql = readMigration("20260506100000_harden_supabase_advisor_warnings.sql").replace(/\s+/g, " ");

  assert.match(sql, /alter function public\.set_updated_at\(\) set search_path = public/);
  assert.match(sql, /revoke execute on function public\.handle_new_user\(\) from public/);
  assert.match(sql, /revoke execute on function public\.handle_new_user\(\) from anon/);
  assert.match(sql, /revoke execute on function public\.handle_new_user\(\) from authenticated/);
  assert.match(sql, /to_regprocedure\('public\.rls_auto_enable\(\)'\)/);
});

test("play store purchase records remain service-only under RLS", () => {
  const sql = readMigration("20260506100000_harden_supabase_advisor_warnings.sql").replace(/\s+/g, " ");

  assert.match(sql, /create policy "play_store_purchases_service_role_all"/);
  assert.match(sql, /on public\.play_store_purchases/);
  assert.match(sql, /to service_role/);
});

test("RLS policies cache auth.uid calls for advisor-clean plans", () => {
  const sql = readMigration("20260506103000_optimize_rls_policy_initplans.sql").replace(/\s+/g, " ");

  assert.match(sql, /create index if not exists play_store_purchases_plan_id_idx/);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  assert.doesNotMatch(sql, /[^t]auth\.uid\(\) = user_id/);
  assert.match(sql, /where ue\.user_id = \(select auth\.uid\(\)\)/);
});
