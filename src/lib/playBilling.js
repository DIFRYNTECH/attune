import { registerPlugin } from "@capacitor/core";

import { isAndroid, isNativePlatform } from "./platform";

const PlayBilling = registerPlugin("PlayBilling");

const PLAY_PRODUCT_ID = String(import.meta.env.VITE_PLAY_BILLING_PRODUCT_ID || "").trim();
const PLAY_PACKAGE_NAME = String(import.meta.env.VITE_PLAY_BILLING_PACKAGE_NAME || "com.attune.app").trim();

function ensurePlayBillingSupported() {
  if (!isNativePlatform() || !isAndroid()) {
    throw new Error("play_billing_unavailable");
  }

  if (!PLAY_PRODUCT_ID) {
    throw new Error("play_billing_missing_product_id");
  }
}

export function getPlayBillingProductId() {
  return PLAY_PRODUCT_ID;
}

export function getPlayBillingPackageName() {
  return PLAY_PACKAGE_NAME;
}

export async function getPlayBillingProducts() {
  ensurePlayBillingSupported();
  const result = await PlayBilling.getProducts({ productIds: [PLAY_PRODUCT_ID] });
  return Array.isArray(result?.products) ? result.products : [];
}

export async function purchasePlayBillingSubscription(accountId) {
  ensurePlayBillingSupported();
  const normalizedAccountId = typeof accountId === "string" ? accountId.trim() : "";
  if (!normalizedAccountId) throw new Error("missing_account_id");
  return PlayBilling.purchase({ productId: PLAY_PRODUCT_ID, accountId: normalizedAccountId });
}

export async function restorePlayBillingPurchases() {
  ensurePlayBillingSupported();
  const result = await PlayBilling.restorePurchases();
  return Array.isArray(result?.purchases) ? result.purchases : [];
}

export async function acknowledgePlayBillingPurchase(purchaseToken) {
  ensurePlayBillingSupported();
  const token = typeof purchaseToken === "string" ? purchaseToken.trim() : "";
  if (!token) throw new Error("missing_purchase_token");
  return PlayBilling.acknowledgePurchase({ purchaseToken: token });
}

export function isPlayBillingSupported() {
  return isNativePlatform() && isAndroid() && !!PLAY_PRODUCT_ID;
}