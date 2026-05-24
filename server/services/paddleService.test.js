import assert from "node:assert/strict";
import test from "node:test";

import { mapPaddleSubscriptionStatus, paddleSubscriptionDate } from "./paddleService.js";

test("paddleSubscriptionDate normalizes valid dates and rejects invalid values", () => {
  assert.equal(paddleSubscriptionDate("2026-05-24T10:00:00.000Z"), "2026-05-24T10:00:00.000Z");
  assert.equal(paddleSubscriptionDate(""), null);
  assert.equal(paddleSubscriptionDate("not-a-date"), null);
});

test("mapPaddleSubscriptionStatus maps active provider statuses", () => {
  assert.equal(mapPaddleSubscriptionStatus({ status: "active" }), "active");
  assert.equal(mapPaddleSubscriptionStatus({ status: "trialing" }), "active");
  assert.equal(mapPaddleSubscriptionStatus({ status: "past_due" }), "past_due");
  assert.equal(mapPaddleSubscriptionStatus({ status: "paused" }), "past_due");
});

test("mapPaddleSubscriptionStatus preserves canceled access while current period is active", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  assert.equal(mapPaddleSubscriptionStatus({ status: "canceled", current_billing_period: { ends_at: future } }), "canceled");
  assert.equal(mapPaddleSubscriptionStatus({ status: "canceled", current_billing_period: { ends_at: past } }), "expired");
  assert.equal(mapPaddleSubscriptionStatus({ status: "unknown", current_billing_period: { ends_at: future } }), "active");
  assert.equal(mapPaddleSubscriptionStatus({ status: "unknown", current_billing_period: { ends_at: past } }), "expired");
});
