import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("usage reporting includes failed-response spend and exposes unknown and unfinished usage", async () => {
  const doc = readFileSync(new URL("../../docs/AI_USAGE_OPERATIONS.md", import.meta.url), "utf8");
  const queries = [...doc.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map(match => match[1]);
  assert.equal(queries.length, 2);
  const db = new PGlite();
  try {
    await db.exec("create table ai_usage(occurred_at timestamptz, kind text, success boolean, meta jsonb);");
    const insert = (success, meta, minutesAgo = 0) => db.query(
      "insert into ai_usage values (now() - ($1::int * interval '1 minute'), $2, $3, $4)",
      [minutesAgo, "generate_board", success, JSON.stringify(meta)],
    );
    await insert(false, { quotaState: "released", providerUsage: { attempts: [
      { model: "test", usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, totalTokens: 120 } },
      { requestedModel: "test", usage: null },
    ] } });
    await insert(false, { quotaState: "reserved" }, 20);
    await insert(false, { planId: "plus" });
    await insert(true, { quotaState: "billed", providerUsage: null });
    const usage = (await db.query(queries[0])).rows[0];
    assert.equal(usage.observed_sdk_calls, 2);
    assert.equal(usage.calls_without_usage, 1);
    assert.equal(usage.calls_without_cache_breakdown, 1);
    assert.equal(Number(usage.known_input_tokens), 100);
    assert.equal(Number(usage.known_output_tokens), 20);
    assert.equal(Number(usage.known_cached_input_tokens), 40);
    const gaps = (await db.query(queries[1])).rows[0];
    assert.equal(gaps.stale_reservations, 1);
    assert.equal(gaps.rows_missing_telemetry, 2);
  } finally {
    await db.close();
  }
});
