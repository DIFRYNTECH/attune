import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultBillingState,
  getBillingErrorMessage,
  getBillingPlanIdFromState,
  hasVerifiedPlusNoteMemoryAccess,
  normalizeBillingState,
} from "./billingState.js";

test("normalizeBillingState preserves only supported plan ids", () => {
  assert.equal(normalizeBillingState({ planId: "plus" }).planId, "plus");
  assert.equal(normalizeBillingState({ planId: "enterprise" }).planId, "free");
  assert.deepEqual(normalizeBillingState(null), defaultBillingState());
});

test("hasVerifiedPlusNoteMemoryAccess requires a synced plus state without errors", () => {
  assert.equal(hasVerifiedPlusNoteMemoryAccess({ planId: "plus", lastSyncedAt: 1, error: "" }), true);
  assert.equal(hasVerifiedPlusNoteMemoryAccess({ planId: "plus", lastSyncedAt: 0, error: "" }), false);
  assert.equal(hasVerifiedPlusNoteMemoryAccess({ planId: "plus", lastSyncedAt: 1, error: "failed" }), false);
  assert.equal(hasVerifiedPlusNoteMemoryAccess({ planId: "free", lastSyncedAt: 1, error: "" }), false);
});

test("getBillingPlanIdFromState defaults to free", () => {
  assert.equal(getBillingPlanIdFromState({ billing: { planId: "plus" } }), "plus");
  assert.equal(getBillingPlanIdFromState({ billing: { planId: "other" } }), "free");
  assert.equal(getBillingPlanIdFromState(null), "free");
});

test("getBillingErrorMessage maps known billing errors", () => {
  assert.equal(getBillingErrorMessage("google_play_not_configured"), "Google Play billing is not configured yet.");
  assert.equal(getBillingErrorMessage("paddle_customer_missing"), "No web subscription was found for this account.");
  assert.equal(
    getBillingErrorMessage("google_play_missing_account_binding"),
    "This purchase is missing the required account binding. Start the upgrade again from this account.",
  );
  assert.equal(getBillingErrorMessage("unknown_code"), "Billing is unavailable right now.");
});
