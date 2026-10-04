import { acknowledgeGooglePlayPurchase, verifyGooglePlaySubscriptionPurchase } from "../lib/googlePlayBilling.js";

export async function persistVerifiedPlayPurchase({ supabaseAdmin, userId, verification,
  acknowledge = acknowledgeGooglePlayPurchase }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");
  if (!userId || verification.obfuscatedExternalAccountId !== userId) {
    throw Object.assign(new Error("google_play_account_mismatch"), { code: "google_play_account_mismatch" });
  }
  const verified = await acknowledge(verification);
  const { error } = await supabaseAdmin.rpc("persist_verified_play_purchase", {
    p_user_id: userId, p_verified_at: verified.verifiedAt,
    p_purchase: {
      package_name: verified.packageName, product_id: verified.productId,
      purchase_token: verified.purchaseToken, linked_purchase_token: verified.linkedPurchaseToken,
      order_id: verified.providerOrderId, plan_id: verified.planId, status: verified.status,
      acknowledged: verified.acknowledged === true, auto_renew_enabled: verified.autoRenewEnabled === true,
      current_period_start: verified.currentPeriodStart, current_period_end: verified.currentPeriodEnd,
      latest_payload: verified.raw,
    },
  });
  if (error) {
    const code = error.message?.includes("google_play_purchase_already_linked")
      ? "google_play_purchase_already_linked" : "billing_purchase_persist_failed";
    throw Object.assign(new Error(code), { code });
  }
  return verified;
}

export async function reconcileGooglePlayEntitlement({ supabaseAdmin, userId, entitlement, nowMs = Date.now(),
  verify = verifyGooglePlaySubscriptionPurchase, persist = persistVerifiedPlayPurchase }) {
  if (entitlement?.source !== "play_store" || !entitlement.provider_subscription_id) return false;
  const periodEnd = Date.parse(entitlement.current_period_end || "");
  // Play stops accepting tokens 60 days after expiry. A new purchase is verified
  // through the signed-in purchase/restore endpoint, not this expired token.
  if (entitlement.status === "expired" && periodEnd < nowMs - 60 * 86400000) return false;
  const verifiedAt = Date.parse(entitlement.provider_verified_at || "");
  if (Number.isFinite(verifiedAt) && verifiedAt <= nowMs && verifiedAt > nowMs - 5 * 60000) return false;
  let verification;
  try {
    verification = await verify({ purchaseToken: entitlement.provider_subscription_id });
  } catch (error) {
    const status = Number(error.response?.status || error.code || error.status);
    if (status !== 410 || !(periodEnd < nowMs - 60 * 86400000)) throw error;
    // A long-expired token is no longer queryable. Match the old period and token
    // so a concurrent renewal or new subscription cannot be downgraded.
    const result = await supabaseAdmin.from("user_entitlements")
      .update({ status: "expired", provider_verified_at: new Date(nowMs).toISOString() })
      .eq("user_id", userId).eq("source", "play_store")
      .eq("provider_subscription_id", entitlement.provider_subscription_id)
      .eq("current_period_end", entitlement.current_period_end);
    if (result.error) throw new Error("entitlement_persist_failed");
    return true;
  }
  await persist({ supabaseAdmin, userId, verification });
  return true;
}

export async function processPlayNotification({ supabaseAdmin, notification, packageName,
  verify = verifyGooglePlaySubscriptionPurchase, persist = persistVerifiedPlayPurchase }) {
  if (notification?.packageName !== packageName) throw Object.assign(new Error("google_play_package_name_mismatch"), { status: 400 });
  if (notification.testNotification) return { test: true };
  const token = notification.subscriptionNotification?.purchaseToken || notification.voidedPurchaseNotification?.purchaseToken;
  if (typeof token !== "string" || !token || token.length > 512) throw Object.assign(new Error("invalid_play_notification"), { status: 400 });
  const lookup = await supabaseAdmin.from("play_store_purchases").select("user_id").eq("purchase_token", token).maybeSingle();
  if (lookup.error) throw new Error("billing_purchase_lookup_failed");
  // The signed-in verification path establishes ownership, never notification data.
  if (!lookup.data?.user_id) return { ignored: "unlinked_purchase" };
  const verification = await verify({ packageName, purchaseToken: token });
  await persist({ supabaseAdmin, userId: lookup.data.user_id, verification });
  return { reconciled: true };
}
