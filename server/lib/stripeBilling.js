import Stripe from "stripe";

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\/+$/, "");
}

const stripeConfig = {
  secretKey: String(process.env.STRIPE_SECRET_KEY || "").trim(),
  webhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
  plusPriceId: String(process.env.STRIPE_PLUS_PRICE_ID || "").trim(),
  appUrl: normalizeBaseUrl(process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL),
};

let stripeClient = null;

export function getStripeBillingConfig() {
  return {
    configured: !!stripeConfig.secretKey && !!stripeConfig.plusPriceId && !!stripeConfig.appUrl,
    portalConfigured: !!stripeConfig.secretKey && !!stripeConfig.appUrl,
    webhookConfigured: !!stripeConfig.secretKey && !!stripeConfig.webhookSecret,
    plusPriceId: stripeConfig.plusPriceId,
    appUrl: stripeConfig.appUrl,
  };
}

export function getStripeClient() {
  if (!stripeConfig.secretKey) {
    const error = new Error("stripe_not_configured");
    error.code = "stripe_not_configured";
    throw error;
  }

  if (!stripeClient) stripeClient = new Stripe(stripeConfig.secretKey);
  return stripeClient;
}

export function ensureStripeCheckoutConfigured() {
  const config = getStripeBillingConfig();
  if (!config.configured) {
    const error = new Error("stripe_not_configured");
    error.code = "stripe_not_configured";
    throw error;
  }
  return config;
}

export function ensureStripeWebhookConfigured() {
  const config = getStripeBillingConfig();
  if (!config.webhookConfigured) {
    const error = new Error("stripe_webhook_not_configured");
    error.code = "stripe_webhook_not_configured";
    throw error;
  }
  return config;
}

export function buildStripeReturnUrl(status) {
  const config = ensureStripeCheckoutConfigured();
  const url = new URL(`${config.appUrl}/`);
  url.searchParams.set("billing", status);
  url.searchParams.set("provider", "stripe");
  return url.toString();
}