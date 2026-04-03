import { google } from "googleapis";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePrivateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\\n/g, "\n");
}

function parseProductPlanMap(value) {
  const entries = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const mapping = new Map();
  for (const entry of entries) {
    const [productId, rawPlanId] = entry.split(":").map((part) => part.trim());
    if (!productId) continue;
    const planId = rawPlanId === "plus" ? "plus" : "free";
    mapping.set(productId, planId);
  }

  return mapping;
}

const googlePlayConfig = {
  packageName: String(process.env.GOOGLE_PLAY_PACKAGE_NAME || "").trim(),
  serviceAccountEmail: String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || "").trim(),
  privateKey: normalizePrivateKey(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY),
  allowedProductIds: parseCsv(
    process.env.GOOGLE_PLAY_ALLOWED_PRODUCT_IDS || process.env.GOOGLE_PLAY_PRODUCT_ID,
  ),
  productPlanMap: parseProductPlanMap(process.env.GOOGLE_PLAY_PRODUCT_PLAN_MAP),
};

let androidPublisherClientPromise = null;

export function getGooglePlayBillingConfig() {
  return {
    packageName: googlePlayConfig.packageName,
    allowedProductIds: googlePlayConfig.allowedProductIds.slice(),
    configured:
      !!googlePlayConfig.packageName &&
      !!googlePlayConfig.serviceAccountEmail &&
      !!googlePlayConfig.privateKey,
  };
}

function ensureGooglePlayConfigured() {
  const config = getGooglePlayBillingConfig();
  if (!config.configured) {
    const error = new Error("google_play_not_configured");
    error.code = "google_play_not_configured";
    throw error;
  }
  return config;
}

async function getAndroidPublisherClient() {
  ensureGooglePlayConfigured();

  if (!androidPublisherClientPromise) {
    androidPublisherClientPromise = (async () => {
      const auth = new google.auth.JWT({
        email: googlePlayConfig.serviceAccountEmail,
        key: googlePlayConfig.privateKey,
        scopes: [ANDROID_PUBLISHER_SCOPE],
      });

      await auth.authorize();
      return google.androidpublisher({ version: "v3", auth });
    })().catch((error) => {
      androidPublisherClientPromise = null;
      throw error;
    });
  }

  return androidPublisherClientPromise;
}

function toIsoOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function toBoolean(value) {
  return value === true;
}

function getLatestLineItem(lineItems) {
  const list = Array.isArray(lineItems) ? lineItems : [];
  let latest = null;
  let latestTs = 0;

  for (const item of list) {
    const expiryTs = Date.parse(String(item?.expiryTime || ""));
    if (Number.isFinite(expiryTs) && expiryTs >= latestTs) {
      latest = item;
      latestTs = expiryTs;
      continue;
    }

    if (!latest && item && typeof item === "object") latest = item;
  }

  return latest;
}

function mapGooglePlayStatus(subscriptionState, currentPeriodEnd) {
  const state = String(subscriptionState || "").trim().toUpperCase();
  const endTs = Date.parse(String(currentPeriodEnd || ""));
  const isActiveByEnd = Number.isFinite(endTs) && endTs >= Date.now();

  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace";
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
    case "SUBSCRIPTION_STATE_PENDING":
      return "past_due";
    case "SUBSCRIPTION_STATE_CANCELED":
      return isActiveByEnd ? "canceled" : "expired";
    case "SUBSCRIPTION_STATE_EXPIRED":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return "expired";
    default:
      return isActiveByEnd ? "active" : "expired";
  }
}

function resolvePlanId(productId) {
  const explicit = googlePlayConfig.productPlanMap.get(productId);
  if (explicit) return explicit;
  return productId ? "plus" : "free";
}

export async function verifyGooglePlaySubscriptionPurchase({ packageName, purchaseToken }) {
  const config = ensureGooglePlayConfigured();
  const token = String(purchaseToken || "").trim();
  const requestedPackageName = String(packageName || "").trim();
  const resolvedPackageName = String(config.packageName || "").trim();

  if (!token) {
    const error = new Error("missing_purchase_token");
    error.code = "missing_purchase_token";
    throw error;
  }

  if (!resolvedPackageName) {
    const error = new Error("missing_package_name");
    error.code = "missing_package_name";
    throw error;
  }

  if (requestedPackageName && requestedPackageName !== resolvedPackageName) {
    const error = new Error("google_play_package_name_mismatch");
    error.code = "google_play_package_name_mismatch";
    throw error;
  }

  const client = await getAndroidPublisherClient();
  const response = await client.purchases.subscriptionsv2.get({
    packageName: resolvedPackageName,
    token,
  });

  const purchase = response?.data || {};
  const latestLineItem = getLatestLineItem(purchase.lineItems);
  const productId = String(latestLineItem?.productId || "").trim();

  if (config.allowedProductIds.length && !config.allowedProductIds.includes(productId)) {
    const error = new Error("google_play_product_not_allowed");
    error.code = "google_play_product_not_allowed";
    throw error;
  }

  const currentPeriodStart = toIsoOrNull(purchase.startTime);
  const currentPeriodEnd = toIsoOrNull(latestLineItem?.expiryTime);
  const status = mapGooglePlayStatus(purchase.subscriptionState, currentPeriodEnd);
  const obfuscatedExternalAccountId = String(purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || "").trim() || null;

  return {
    packageName: resolvedPackageName,
    productId,
    planId: resolvePlanId(productId),
    purchaseToken: token,
    providerSubscriptionId: token,
    providerOrderId: String(purchase.latestOrderId || "").trim() || null,
    linkedPurchaseToken: String(purchase.linkedPurchaseToken || "").trim() || null,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    acknowledged: String(purchase.acknowledgementState || "") === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    autoRenewEnabled: toBoolean(latestLineItem?.autoRenewingPlan?.autoRenewEnabled),
    subscriptionState: String(purchase.subscriptionState || "").trim() || null,
    obfuscatedExternalAccountId,
    raw: purchase,
  };
}