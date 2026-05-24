export async function persistVerifiedPlayPurchase({ supabaseAdmin, userId, verification }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const existingPurchaseResult = await supabaseAdmin
    .from("play_store_purchases")
    .select("user_id")
    .eq("purchase_token", verification.purchaseToken)
    .maybeSingle();

  if (existingPurchaseResult.error) throw new Error("billing_purchase_lookup_failed");
  if (existingPurchaseResult.data?.user_id && existingPurchaseResult.data.user_id !== userId) {
    const error = new Error("google_play_purchase_already_linked");
    error.code = "google_play_purchase_already_linked";
    throw error;
  }

  const entitlementPayload = {
    user_id: userId,
    plan_id: verification.planId,
    status: verification.status,
    source: "play_store",
    provider_subscription_id: verification.providerSubscriptionId,
    current_period_start: verification.currentPeriodStart,
    current_period_end: verification.currentPeriodEnd,
  };

  const purchasePayload = {
    user_id: userId,
    package_name: verification.packageName,
    product_id: verification.productId,
    purchase_token: verification.purchaseToken,
    linked_purchase_token: verification.linkedPurchaseToken,
    order_id: verification.providerOrderId,
    plan_id: verification.planId,
    status: verification.status,
    acknowledged: verification.acknowledged === true,
    auto_renew_enabled: verification.autoRenewEnabled === true,
    current_period_start: verification.currentPeriodStart,
    current_period_end: verification.currentPeriodEnd,
    latest_payload: verification.raw,
  };

  const [entitlementResult, purchaseResult] = await Promise.all([
    supabaseAdmin
      .from("user_entitlements")
      .upsert(entitlementPayload, { onConflict: "user_id" })
      .select("user_id")
      .single(),
    supabaseAdmin
      .from("play_store_purchases")
      .upsert(purchasePayload, { onConflict: "purchase_token" })
      .select("id")
      .single(),
  ]);

  if (entitlementResult.error) throw new Error("billing_entitlement_upsert_failed");
  if (purchaseResult.error) throw new Error("billing_purchase_upsert_failed");
}
