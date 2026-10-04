import { reconcileGooglePlayEntitlement } from "./googlePlayService.js";

export function normalizePlanId(planId) {
  return planId === "plus" ? "plus" : "free";
}

export function hasPlusEntitlement(entitlement, nowMs = Date.now()) {
  if (normalizePlanId(entitlement?.plan_id) !== "plus") return false;

  const status = String(entitlement?.status || "").toLowerCase();
  if (!["active", "grace", "canceled"].includes(status)) return false;
  const currentPeriodEndMs = Date.parse(String(entitlement?.current_period_end || ""));
  // Play can report ACTIVE during silent grace. Only a recent provider refresh
  // can extend access beyond the cached expiry, never a stale active flag.
  const verifiedAt = Date.parse(entitlement?.provider_verified_at || "");
  if (entitlement?.source === "play_store" && ["active", "grace"].includes(status) &&
    verifiedAt <= nowMs && verifiedAt > nowMs - 5 * 60000) return true;
  if (Number.isFinite(currentPeriodEndMs)) return currentPeriodEndMs > nowMs;
  return status === "active" && ["manual", "promo"].includes(entitlement?.source) && !entitlement?.current_period_end;
}

export async function getUserEntitlementState({ supabaseAdmin, userId, reconcile = reconcileGooglePlayEntitlement }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const [entitlementResult, purchaseResult] = await Promise.all([
    supabaseAdmin
      .from("user_entitlements")
      .select("plan_id, status, source, current_period_start, current_period_end, provider_subscription_id, provider_customer_id, provider_verified_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("play_store_purchases")
      .select("product_id, status, acknowledged, current_period_end, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (entitlementResult.error) throw new Error("entitlement_lookup_failed");
  if (purchaseResult.error) throw new Error("purchase_lookup_failed");

  let entitlement = entitlementResult.data || {
    plan_id: "free",
    status: "active",
    source: "manual",
    current_period_start: null,
    current_period_end: null,
    provider_subscription_id: null,
  };

  if (await reconcile({ supabaseAdmin, userId, entitlement })) {
    const refreshed = await supabaseAdmin.from("user_entitlements")
      .select("plan_id, status, source, current_period_start, current_period_end, provider_subscription_id, provider_customer_id, provider_verified_at")
      .eq("user_id", userId).maybeSingle();
    if (refreshed.error || !refreshed.data) throw new Error("entitlement_lookup_failed");
    entitlement = refreshed.data;
  }
  const planId = hasPlusEntitlement(entitlement) ? "plus" : "free";

  return {
    planId,
    status: typeof entitlement.status === "string" ? entitlement.status : "active",
    source: typeof entitlement.source === "string" ? entitlement.source : "manual",
    currentPeriodStart: entitlement.current_period_start || null,
    currentPeriodEnd: entitlement.current_period_end || null,
    providerSubscriptionId: entitlement.provider_subscription_id || null,
    providerCustomerId: entitlement.provider_customer_id || null,
    productId: purchaseResult.data?.product_id || null,
    purchaseStatus: purchaseResult.data?.status || null,
    acknowledged: purchaseResult.data?.acknowledged === true,
    isPlus: planId === "plus",
  };
}
