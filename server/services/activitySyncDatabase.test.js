import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { learningPreferences } from "../../src/lib/activityLearning.js";

const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

test("PostgreSQL snapshot writes merge learning instead of erasing other devices", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;`);
    for (const file of ["20260419120000_user_device_state.sql", "20260505120000_harden_user_device_state.sql",
      "20260505121000_validate_user_device_state_constraints.sql", "20261004123000_merge_activity_learning.sql",
      "20261004123000_merge_activity_learning.sql"]) await db.exec(migration(file));
    await db.query("insert into auth.users values ($1), ($2)", [user, other]);
    await db.exec("grant select, insert, update on public.user_device_state to authenticated;");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec("set role authenticated");
    const nowMs = Date.now() - 1000;
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const preference = (id, ts, value) => ({ id, ts, type: "activityPreference", canonicalKey: "attune:doodle-shape",
      text: "Draw one shape", preference: "hidden", value });
    const write = async events => (await db.query(`insert into public.user_device_state(user_id,date,events) values ($1,$2,$3::jsonb)
      on conflict (user_id) do update set events=excluded.events returning events`, [user, day, JSON.stringify(events)])).rows[0].events;

    await t.test("a stale second device cannot undo a hidden choice or its newer removal", async () => {
      const saved = preference("hidden", nowMs - 100, true);
      await write({ [day]: [saved] });
      const hidden = await write({ [day]: [] });
      assert.equal(learningPreferences(hidden).hidden.length, 1);
      await write({ _preferences: [preference("restored", nowMs, false)] });
      const restored = await write({ [day]: [saved] });
      assert.equal(learningPreferences(restored).hidden.length, 0);
      assert.equal(restored._preferences[0].value, false);
    });
    await t.test("independent devices retain both outcomes and recent exposures", async () => {
      await write({ [day]: [{ id: "picked", ts: nowMs, type: "activityPicked", text: "Draw one shape" }] });
      const merged = await write({ [day]: [{ id: "viewed", ts: nowMs, type: "activityViewed", activities: [{ text: "Rest" }] }] });
      assert.deepEqual(merged[day].map(event => event.id).sort(), ["picked", "viewed"]);
    });
    await t.test("old, malformed and future events cannot poison retention", async () => {
      const merged = await write({ [day]: [{ id: "old", ts: nowMs - 91 * 86400000, type: "activityPicked" },
        { id: "future", ts: nowMs + 86400000, type: "activityPicked" }, { id: "bad", ts: "invalid" }, null] });
      assert.deepEqual(merged[day].map(event => event.id).sort(), ["picked", "viewed"]);
    });
    await t.test("high-volume merges remain bounded and preserve preference tombstones", async () => {
      const events = Array.from({ length: 1000 }, (_, index) => ({ id: `volume-${index}`, ts: nowMs - index,
        type: "activityPicked", text: "x".repeat(120) }));
      const merged = await write({ [day]: events });
      assert.ok(merged[day].length <= 250);
      assert.ok(Buffer.byteLength(JSON.stringify(merged)) < 131072);
      assert.equal(merged._preferences[0].value, false);
      assert.ok(merged[day].some(event => event.id === "viewed"));
    });
    await t.test("a browser user cannot write another user's snapshot", async () => {
      await assert.rejects(db.query("insert into public.user_device_state(user_id,date) values ($1,$2)", [other, day]), /row-level security/);
    });
  } finally {
    await db.close();
  }
});
