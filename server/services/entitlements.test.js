import assert from "node:assert/strict";
import test from "node:test";

import { hasPlusEntitlement, normalizePlanId } from "./entitlements.js";

test("normalizePlanId only treats plus as plus", () => {
  assert.equal(normalizePlanId("plus"), "plus");
  assert.equal(normalizePlanId("free"), "free");
  assert.equal(normalizePlanId("enterprise"), "free");
  assert.equal(normalizePlanId(null), "free");
});

test("hasPlusEntitlement accepts active and grace plus entitlements", () => {
  assert.equal(hasPlusEntitlement({ plan_id: "plus", status: "active" }), true);
  assert.equal(hasPlusEntitlement({ plan_id: "plus", status: "grace" }), true);
});

test("hasPlusEntitlement keeps canceled plus access until the period ends", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  assert.equal(hasPlusEntitlement({ plan_id: "plus", status: "canceled", current_period_end: future }), true);
  assert.equal(hasPlusEntitlement({ plan_id: "plus", status: "canceled", current_period_end: past }), false);
  assert.equal(hasPlusEntitlement({ plan_id: "plus", status: "expired", current_period_end: future }), false);
  assert.equal(hasPlusEntitlement({ plan_id: "free", status: "active", current_period_end: future }), false);
});
