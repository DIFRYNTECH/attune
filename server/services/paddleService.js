import { getPaddleBillingConfig, paddleApiFetch } from "../lib/paddleBilling.js";
import { getUserEntitlementState } from "./entitlements.js";

export function paddleSubscriptionDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function mapPaddleSubscriptionStatus(subscription) {
  const status = String(subscription?.status || "").trim().toLowerCase();
  const currentPeriodEndMs = Date.parse(String(subscription?.current_billing_period?.ends_at || ""));
  const activeByDate = Number.isFinite(currentPeriodEndMs) && currentPeriodEndMs >= Date.now();

  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "paused":
      return "past_due";
    case "canceled":
      return activeByDate ? "canceled" : "expired";
    default:
      return activeByDate ? "active" : "expired";
  }
}

export function paddleSubscriptionHasPlusPrice(subscription) {
  const plusPriceId = getPaddleBillingConfig().plusPriceId;
  return Array.isArray(subscription?.items)
    ? subscription.items.some((item) => item?.price?.id === plusPriceId)
    : false;
}

export async function upsertPaddleEntitlement({ supabaseAdmin, userId, customerId, subscription }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");
  if (!userId) throw new Error("paddle_user_not_found");

  const status = mapPaddleSubscriptionStatus(subscription);
  const currentPeriodEnd = paddleSubscriptionDate(subscription?.current_billing_period?.ends_at);
  const currentPeriodEndMs = Date.parse(String(currentPeriodEnd || ""));
  const hasActiveCanceledAccess = status === "canceled" && Number.isFinite(currentPeriodEndMs) && currentPeriodEndMs >= Date.now();
  const planId = paddleSubscriptionHasPlusPrice(subscription) && (status === "active" || hasActiveCanceledAccess)
    ? "plus"
    : "free";

  const result = await supabaseAdmin
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      plan_id: planId,
      status,
      source: "paddle",
      provider_customer_id: customerId || null,
      provider_subscription_id: subscription?.id || null,
      current_period_start: paddleSubscriptionDate(subscription?.current_billing_period?.starts_at),
      current_period_end: currentPeriodEnd,
    }, { onConflict: "user_id" })
    .select("user_id")
    .single();

  if (result.error) throw new Error("paddle_entitlement_upsert_failed");
}

export async function setPaddleCustomerReference({ supabaseAdmin, userId, customerId }) {
  if (!supabaseAdmin || !userId || !customerId) return;

  const existing = await getUserEntitlementState({ supabaseAdmin, userId }).catch(() => null);
  const result = await supabaseAdmin
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      plan_id: existing?.planId === "plus" ? "plus" : "free",
      status: typeof existing?.status === "string" ? existing.status : "active",
      source: typeof existing?.source === "string" && existing.source ? existing.source : "manual",
      provider_customer_id: customerId,
      provider_subscription_id: existing?.providerSubscriptionId || null,
      current_period_start: existing?.currentPeriodStart || null,
      current_period_end: existing?.currentPeriodEnd || null,
    }, { onConflict: "user_id" })
    .select("user_id")
    .single();

  if (result.error) throw new Error("paddle_customer_reference_upsert_failed");
}

export async function resolvePaddleUserId({ supabaseAdmin, subscription, customerId }) {
  const customDataUserId = typeof subscription?.custom_data?.userId === "string" ? subscription.custom_data.userId.trim() : "";
  if (customDataUserId) return customDataUserId;
  if (!supabaseAdmin) return "";

  const filters = [];
  if (subscription?.id) filters.push(`provider_subscription_id.eq.${subscription.id}`);
  if (customerId) filters.push(`provider_customer_id.eq.${customerId}`);
  if (!filters.length) return "";

  const result = await supabaseAdmin
    .from("user_entitlements")
    .select("user_id")
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error("paddle_user_lookup_failed");
  return typeof result.data?.user_id === "string" ? result.data.user_id : "";
}

export async function findPaddleCustomerByEmail(email) {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) return null;

  const response = await paddleApiFetch("/customers", {
    searchParams: {
      email: normalizedEmail,
      per_page: 50,
    },
  });

  const customers = Array.isArray(response?.data) ? response.data : [];
  return customers.find((customer) => String(customer?.email || "").trim().toLowerCase() === normalizedEmail.toLowerCase()) || null;
}

export async function findPaddleSubscriptionForCustomer(customerId) {
  const config = getPaddleBillingConfig();
  if (!config.configured || !customerId) return null;

  const response = await paddleApiFetch("/subscriptions", {
    searchParams: {
      customer_id: customerId,
      price_id: config.plusPriceId,
      per_page: 50,
    },
  });

  const subscriptions = Array.isArray(response?.data) ? response.data : [];
  const matches = subscriptions.filter((subscription) => paddleSubscriptionHasPlusPrice(subscription));
  matches.sort((left, right) => {
    const leftMs = Date.parse(String(left?.current_billing_period?.ends_at || left?.next_billed_at || "")) || 0;
    const rightMs = Date.parse(String(right?.current_billing_period?.ends_at || right?.next_billed_at || "")) || 0;
    return rightMs - leftMs;
  });
  return matches[0] || null;
}

export async function reconcilePaddleBillingForUser({ supabaseAdmin, userId, customerId, email }) {
  const config = getPaddleBillingConfig();
  if (!config.configured) return null;

  let resolvedCustomerId = typeof customerId === "string" ? customerId.trim() : "";
  if (!resolvedCustomerId && email) {
    const customer = await findPaddleCustomerByEmail(email).catch(() => null);
    resolvedCustomerId = typeof customer?.id === "string" ? customer.id : "";
    if (resolvedCustomerId) {
      await setPaddleCustomerReference({ supabaseAdmin, userId, customerId: resolvedCustomerId }).catch(() => null);
    }
  }

  if (!resolvedCustomerId) return null;

  const subscription = await findPaddleSubscriptionForCustomer(resolvedCustomerId);
  if (!subscription) {
    const result = await supabaseAdmin
      .from("user_entitlements")
      .upsert({
        user_id: userId,
        plan_id: "free",
        status: "expired",
        source: "paddle",
        provider_customer_id: resolvedCustomerId,
        provider_subscription_id: null,
        current_period_start: null,
        current_period_end: null,
      }, { onConflict: "user_id" })
      .select("user_id")
      .single();
    if (result.error) throw new Error("paddle_entitlement_upsert_failed");
    return null;
  }

  await upsertPaddleEntitlement({ supabaseAdmin, userId, customerId: resolvedCustomerId, subscription });
  return subscription;
}

export async function handlePaddleWebhookEvent({ supabaseAdmin, event }) {
  switch (event?.event_type) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.activated":
    case "subscription.trialing":
    case "subscription.past_due":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.canceled": {
      const subscription = event?.data;
      const customerId = typeof subscription?.customer_id === "string" ? subscription.customer_id : "";
      const userId = await resolvePaddleUserId({ supabaseAdmin, subscription, customerId });
      if (!userId || !customerId) return;
      await setPaddleCustomerReference({ supabaseAdmin, userId, customerId }).catch(() => null);
      await upsertPaddleEntitlement({ supabaseAdmin, userId, customerId, subscription });
      return;
    }
    default:
      return;
  }
}
