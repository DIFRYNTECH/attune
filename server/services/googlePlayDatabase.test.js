import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

test("Play billing migration executes atomically and enforces entitlement boundaries in PostgreSQL", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
    `);
    // gen_random_uuid is built into PostgreSQL; Supabase's pgcrypto installation
    // statement is the sole platform-specific statement omitted in this harness.
    await db.exec(migration("20260328110216_attune_minimal_v1.sql").replace("create extension if not exists pgcrypto;", ""));
    await db.exec(migration("20260401153000_play_store_purchases.sql"));
    await db.exec(migration("20260403153000_user_entitlements_add_paddle_source.sql"));
    await db.exec(migration("20260403130000_note_memory_plus_only.sql"));
    await db.exec(migration("20261004120000_authoritative_play_entitlements.sql"));
    await db.exec(migration("20261004120000_authoritative_play_entitlements.sql"));
    await db.query("insert into auth.users(id, email) values ($1, 'one@example.test'), ($2, 'two@example.test')", [user, other]);
    const nowMs = Number((await db.query("select extract(epoch from now()) * 1000 as ms")).rows[0].ms);
    const iso = offset => new Date(nowMs + offset).toISOString();
    const purchase = (token, patch = {}) => ({ package_name: "test.app", product_id: "plus", purchase_token: token,
      plan_id: "plus", status: "active", acknowledged: true, auto_renew_enabled: true,
      current_period_start: iso(-86400000), current_period_end: iso(86400000), latest_payload: {}, ...patch });
    const save = (owner, value, verified = iso(-1000)) => db.query("select public.persist_verified_play_purchase($1, $2::jsonb, $3::timestamptz)", [owner, JSON.stringify(value), verified]);
    const entitlement = async owner => (await db.query("select * from public.user_entitlements where user_id = $1", [owner])).rows[0];

    await t.test("purchase and entitlement commit together", async () => {
      await save(user, purchase("first"));
      assert.equal((await entitlement(user)).provider_subscription_id, "first");
      assert.equal((await entitlement(user)).plan_id, "plus");
    });
    await t.test("older provider observations cannot resurrect revoked access", async () => {
      await save(user, purchase("first", { status: "expired", current_period_end: iso(-10000) }), iso(-500));
      await save(user, purchase("first"), iso(-1000));
      assert.equal((await entitlement(user)).status, "expired");
    });
    await t.test("another user cannot claim an existing token", async () => {
      await assert.rejects(save(other, purchase("first")), /google_play_purchase_already_linked/);
      assert.equal((await entitlement(other)).plan_id, "free");
    });
    await t.test("old-token notifications cannot revoke a newer valid subscription", async () => {
      await save(user, purchase("second", { linked_purchase_token: "first", current_period_end: iso(172800000) }), iso(-300));
      await save(user, purchase("first", { status: "expired", current_period_end: iso(-10000) }), iso(-100));
      assert.equal((await entitlement(user)).provider_subscription_id, "second");
    });
    await t.test("an invalid entitlement rolls back the purchase insert", async () => {
      await assert.rejects(save(other, purchase("invalid-period", { current_period_start: iso(172800000), current_period_end: iso(86400000) })), /user_entitlements_period_chk/);
      assert.equal((await db.query("select count(*)::int as n from public.play_store_purchases where purchase_token = 'invalid-period'")).rows[0].n, 0);
    });
    await t.test("explicit manual grants are not overwritten by store notifications", async () => {
      await db.query("update public.user_entitlements set plan_id='plus', source='manual' where user_id=$1", [other]);
      await save(other, purchase("other-expired", { status: "expired", current_period_end: iso(-10000) }));
      assert.equal((await entitlement(other)).source, "manual");
    });
    await t.test("browser roles cannot call the service-only purchase writer", async () => {
      const signature = "public.persist_verified_play_purchase(uuid,jsonb,timestamp with time zone)";
      for (const role of ["anon", "authenticated"]) {
        const result = await db.query("select has_function_privilege($1, $2, 'execute') as allowed", [role, signature]);
        assert.equal(result.rows[0].allowed, false);
      }
    });
    await t.test("database access helper agrees on stale expiry and manual grants", async () => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.query("update public.user_entitlements set status='active', current_period_end=$2, provider_verified_at=$3 where user_id=$1", [user, iso(-10000), iso(-3600000)]);
      assert.equal((await db.query("select public.current_user_has_plus() as allowed")).rows[0].allowed, false);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
      assert.equal((await db.query("select public.current_user_has_plus() as allowed")).rows[0].allowed, true);
    });
    await t.test("authenticated RLS denies expired note reads and prevents cross-user reads", async () => {
      await db.query("insert into public.note_memory(user_id, note_date, note) values ($1, current_date, 'private one'), ($2, current_date, 'private two')", [user, other]);
      await db.exec("grant select on public.user_entitlements to authenticated; grant select, delete on public.note_memory to authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select * from public.note_memory")).rows.length, 0);
      assert.equal((await db.query("select public.delete_own_note_memory() as deleted")).rows[0].deleted, 1);
      await db.exec("reset role");
      assert.equal((await db.query("select count(*)::int as n from public.note_memory where user_id=$1", [user])).rows[0].n, 0);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
      await db.exec("set role authenticated");
      const notes = (await db.query("select * from public.note_memory")).rows;
      assert.equal(notes.length, 1);
      assert.equal(notes[0].user_id, other);
      await db.exec("reset role");
    });
  } finally {
    await db.close();
  }
});
