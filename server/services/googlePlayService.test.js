import assert from "node:assert/strict";
import test from "node:test";
import { mapGooglePlayStatus } from "../lib/googlePlayBilling.js";
import { persistVerifiedPlayPurchase, reconcileGooglePlayEntitlement, processPlayNotification } from "./googlePlayService.js";
import { authenticatePlayNotification } from "../routes/googlePlayNotifications.js";
import { hasPlusEntitlement } from "./entitlements.js";

const nowMs = Date.parse("2026-10-04T12:00:00Z");
const future = new Date(nowMs + 86400000).toISOString();
const past = new Date(nowMs - 86400000).toISOString();

test("Play states fail closed for pending, on-hold, paused, revoked and unknown values", () => {
  for (const state of ["ON_HOLD", "PAUSED", "PENDING", "EXPIRED", "PENDING_PURCHASE_CANCELED", "UNKNOWN"]) {
    const status = mapGooglePlayStatus(`SUBSCRIPTION_STATE_${state}`, future, nowMs);
    assert.equal(hasPlusEntitlement({ plan_id: "plus", source: "play_store", status, current_period_end: future }, nowMs), false, state);
  }
  assert.equal(mapGooglePlayStatus("SUBSCRIPTION_STATE_CANCELED", future, nowMs), "canceled");
  assert.equal(mapGooglePlayStatus("SUBSCRIPTION_STATE_CANCELED", past, nowMs), "expired");
});

test("only fresh authoritative Play status can bridge silent grace", () => {
  const base = { plan_id: "plus", source: "play_store", status: "active", current_period_end: past };
  assert.equal(hasPlusEntitlement(base, nowMs), false);
  assert.equal(hasPlusEntitlement({ ...base, provider_verified_at: new Date(nowMs - 60000).toISOString() }, nowMs), true);
  assert.equal(hasPlusEntitlement({ ...base, provider_verified_at: new Date(nowMs - 360000).toISOString() }, nowMs), false);
  assert.equal(hasPlusEntitlement({ ...base, provider_verified_at: future }, nowMs), false);
  assert.equal(hasPlusEntitlement({ ...base, status: "expired", provider_verified_at: new Date(nowMs).toISOString() }, nowMs), false);
});

test("stale Play entitlements refresh before access decisions; fresh and other providers do not", async () => {
  let calls = 0;
  const args = { supabaseAdmin: {}, userId: "u", nowMs, entitlement: { source: "play_store", provider_subscription_id: "token" },
    verify: async ({ purchaseToken }) => { assert.equal(purchaseToken, "token"); calls++; return { status: "active" }; },
    persist: async ({ userId, verification }) => { assert.equal(userId, "u"); assert.equal(verification.status, "active"); } };
  assert.equal(await reconcileGooglePlayEntitlement(args), true);
  assert.equal(await reconcileGooglePlayEntitlement({ ...args, entitlement: { ...args.entitlement, provider_verified_at: new Date(nowMs).toISOString() } }), false);
  assert.equal(await reconcileGooglePlayEntitlement({ ...args, entitlement: { source: "paddle" } }), false);
  assert.equal(await reconcileGooglePlayEntitlement({ ...args, entitlement: { ...args.entitlement, status: "expired",
    current_period_end: new Date(nowMs - 61 * 86400000).toISOString() } }), false);
  assert.equal(calls, 1);
  await assert.rejects(reconcileGooglePlayEntitlement({ ...args, verify: async () => { throw new Error("provider_unavailable"); } }), /provider_unavailable/);
});

test("purchase persistence validates ownership, acknowledges and writes one atomic RPC", async () => {
  const verification = { purchaseToken: "token", packageName: "test.app", productId: "plus", planId: "plus", status: "active",
    currentPeriodStart: past, currentPeriodEnd: future, verifiedAt: new Date(nowMs).toISOString(), obfuscatedExternalAccountId: "u", raw: {} };
  let written = 0;
  const supabaseAdmin = { rpc: async (name, args) => {
    written++;
    assert.equal(name, "persist_verified_play_purchase");
    assert.equal(args.p_user_id, "u");
    assert.equal(args.p_purchase.acknowledged, true);
    return { error: null };
  } };
  const acknowledge = async value => ({ ...value, acknowledged: true });
  await assert.rejects(persistVerifiedPlayPurchase({ supabaseAdmin, userId: "other", verification, acknowledge }), /account_mismatch/);
  assert.equal(written, 0);
  await persistVerifiedPlayPurchase({ supabaseAdmin, userId: "u", verification, acknowledge });
  assert.equal(written, 1);
  await assert.rejects(persistVerifiedPlayPurchase({ supabaseAdmin: { rpc: async () => ({ error: { message: "db error" } }) },
    userId: "u", verification, acknowledge }), /billing_purchase_persist_failed/);
});

test("a long-expired Play token returning 410 is retired without downgrading a newer period", async () => {
  const filters = {};
  const writer = { eq(key, value) { filters[key] = value; return this; }, then(resolve) { resolve({ error: null }); } };
  const args = { userId: "u", nowMs,
    entitlement: { source: "play_store", status: "active", provider_subscription_id: "old-token",
      current_period_end: new Date(nowMs - 61 * 86400000).toISOString() },
    supabaseAdmin: { from: () => ({ update: patch => { assert.equal(patch.status, "expired"); return writer; } }) },
    verify: async () => { throw Object.assign(new Error("gone"), { code: 410 }); } };
  assert.equal(await reconcileGooglePlayEntitlement(args), true);
  assert.equal(filters.provider_subscription_id, "old-token");
  assert.equal(filters.current_period_end, args.entitlement.current_period_end);
  await assert.rejects(reconcileGooglePlayEntitlement({ ...args, entitlement: { ...args.entitlement, current_period_end: past } }), /gone/);
});

test("notifications re-fetch provider truth, not the potentially delayed event status", async () => {
  const supabaseAdmin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u" } }) }) }) }) };
  let status;
  const args = { supabaseAdmin, packageName: "test.app", notification: { packageName: "test.app", subscriptionNotification: { purchaseToken: "token", notificationType: 3 } },
    verify: async () => ({ status: "active" }), persist: async ({ verification }) => { status = verification.status; } };
  assert.deepEqual(await processPlayNotification(args), { reconciled: true });
  assert.equal(status, "active");
  await assert.rejects(processPlayNotification({ ...args, notification: { ...args.notification, packageName: "other" } }), /package_name_mismatch/);
});

test("notification authentication pins audience, verified email and Google issuer", async () => {
  const payload = { email: "push@test.iam.gserviceaccount.com", email_verified: true, iss: "https://accounts.google.com" };
  const args = { audience: "https://example.test/api/billing/google-play/rtdn", email: payload.email,
    client: { verifyIdToken: async input => { assert.equal(input.audience, args.audience); return { getPayload: () => payload }; } } };
  await authenticatePlayNotification("Bearer signed-token", args);
  await assert.rejects(authenticatePlayNotification("", args), /invalid_notification_identity/);
  await assert.rejects(authenticatePlayNotification("Bearer signed-token", { ...args, email: "attacker@example.test" }), /invalid_notification_identity/);
  payload.email_verified = false;
  await assert.rejects(authenticatePlayNotification("Bearer signed-token", args), /invalid_notification_identity/);
});
