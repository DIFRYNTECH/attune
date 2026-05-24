import assert from "node:assert/strict";
import test from "node:test";

import { buildQuotaRejectionBody, isRecoverableAiLookupError } from "./aiQuota.js";

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
