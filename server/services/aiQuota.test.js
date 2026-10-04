import assert from "node:assert/strict";
import test from "node:test";

import { buildQuotaRejectionBody, createAiQuotaService, isRecoverableAiLookupError } from "./aiQuota.js";

test("usage-record insert errors returned by Supabase are logged", async () => {
  const logged = [];
  const service = createAiQuotaService({ supabaseAdmin: { from: () => ({ insert: async () => ({ error: { message: "insert failed" } }) }) },
    defaultModel: "test", logEvent: (...args) => logged.push(args), summarizeError: error => ({ message: error.message }) });
  await service.recordAiUsage({ userId: "user", kind: "generate_board", success: false });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], "ai_usage_record_failed");
});

test("finalizing a failed reservation preserves token metadata but releases the user quota", async () => {
  let written;
  const supabaseAdmin = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { meta: { planId: "plus", quotaState: "reserved" } } }) }) }),
    update: data => { written = data; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "usage" } }) }) }) }; },
  }) };
  const service = createAiQuotaService({ supabaseAdmin });
  const providerUsage = { schemaVersion: 1, knownTokens: { totalTokens: 120 }, usageComplete: false };
  await service.finalizeReservedAiUsage({ usageId: "usage", success: false, errorCode: "model_request_failed", meta: { providerUsage } });
  assert.equal(written.meta.quotaState, "released");
  assert.equal(written.meta.planId, "plus");
  assert.deepEqual(written.meta.providerUsage, providerUsage);
  assert.equal(written.success, false);
  assert.equal(written.total_tokens, null);
  await service.finalizeReservedAiUsage({ usageId: "usage", success: true, meta: { providerUsage: {
    usageComplete: true, knownTokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  } } });
  assert.equal(written.prompt_tokens, 100);
  assert.equal(written.completion_tokens, 20);
  assert.equal(written.total_tokens, 120);
  await service.finalizeReservedAiUsage({ usageId: "usage", success: true, meta: { providerUsage: {
    usageComplete: true, knownTokens: { inputTokens: 2147483647, outputTokens: 20, totalTokens: 2147483667 },
  } } });
  assert.equal(written.total_tokens, null);
});

test("isRecoverableAiLookupError identifies configuration and lookup failures", () => {
  assert.equal(isRecoverableAiLookupError("supabase_admin_not_configured"), true);
  assert.equal(isRecoverableAiLookupError("profile_lookup_failed"), true);
  assert.equal(isRecoverableAiLookupError("entitlement_lookup_failed"), true);
  assert.equal(isRecoverableAiLookupError("plan_lookup_failed"), true);
  assert.equal(isRecoverableAiLookupError("quota_lookup_failed"), true);
  assert.equal(isRecoverableAiLookupError("invalid_board"), false);
  assert.equal(isRecoverableAiLookupError(""), false);
});

test("buildQuotaRejectionBody preserves the existing 429 response contract", () => {
  const body = buildQuotaRejectionBody({
    planId: "plus",
    quota: {
      error: "ai_daily_limit_reached",
      period: "day",
      limit: 20,
      used: 20,
      resetAt: "2026-05-25T00:00:00.000Z",
    },
  });

  assert.deepEqual(body, {
    error: "ai_daily_limit_reached",
    planId: "plus",
    period: "day",
    limit: 20,
    used: 20,
    remaining: 0,
    resetAt: "2026-05-25T00:00:00.000Z",
  });
});
