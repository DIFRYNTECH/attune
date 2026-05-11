import "dotenv/config";

import { randomUUID } from "node:crypto";
import express from "express";
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { TASKS } from "../src/data/tasks.js";
import { getAiBoardAccessError, getAiDailyNoteAccessError } from "./lib/aiAccess.js";
import {
  BOARD_RESPONSE_FORMAT,
  DAILY_NOTE_RESPONSE_FORMAT,
  UNTRUSTED_CONTEXT_INSTRUCTION,
  sanitizeUntrustedAiText,
  validateGeneratedAiTextSafety,
} from "./lib/aiPromptSecurity.js";
import { selectQualityBoard } from "./lib/boardQuality.js";
import { getGooglePlayBillingConfig, verifyGooglePlaySubscriptionPurchase } from "./lib/googlePlayBilling.js";
import { getDistributedRateLimitConfigError } from "./lib/rateLimitConfig.js";
import {
  ensurePaddlePortalConfigured,
  ensurePaddleWebhookConfigured,
  getPaddleBillingConfig,
  paddleApiFetch,
  verifyPaddleWebhookSignature,
} from "./lib/paddleBilling.js";

const PORT = Number(process.env.PORT || 8787);
const ATTUNE_ENV = process.env.ATTUNE_ENV || process.env.NODE_ENV || "development";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const BOARD_TOTAL_TASK_COUNT = 15;
const BOARD_MODEL = process.env.OPENAI_BOARD_MODEL || MODEL;
const BOARD_FALLBACK_MODEL = process.env.OPENAI_BOARD_FALLBACK_MODEL || MODEL;
const BOARD_MODEL_CANDIDATES = Array.from(
  new Set([BOARD_MODEL, BOARD_FALLBACK_MODEL].map((value) => String(value || "").trim()).filter(Boolean))
);
const BOARD_AI_CANDIDATE_COUNT = 24;
const BOARD_MAX_COMPLETION_TOKENS = Math.max(360, Math.min(900, Number(process.env.OPENAI_BOARD_MAX_COMPLETION_TOKENS) || 620));
const openAiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashRedis = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;

const rateLimitConfigError = getDistributedRateLimitConfigError({
  attuneEnv: ATTUNE_ENV,
  hasDistributedStore: Boolean(upstashRedis),
  allowMemoryOverride: process.env.ALLOW_MEMORY_RATE_LIMITING === "1",
});

if (rateLimitConfigError) {
  throw new Error(rateLimitConfigError);
}

const supabaseAuth = SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

// Used for writing ai_usage rows (RLS is intentionally restrictive there).
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim() === "1";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "https://uat.useattune.co",
  "https://www.useattune.co",
  "https://useattune.co",
];
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...ALLOWED_ORIGINS]));
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/attune-[a-z0-9-]+-difryngrouppgmailcoms-projects\.vercel\.app$/,
];
function isOriginAllowed(origin) {
  if (allowedOrigins.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function createRequestId() {
  try {
    return randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function logEvent(level, event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function summarizeError(error) {
  const err = error && typeof error === "object" ? error : null;
  const stack = typeof err?.stack === "string"
    ? err.stack.split("\n").slice(0, 6).join("\n")
    : undefined;

  return {
    name: typeof err?.name === "string" ? err.name : undefined,
    message: typeof err?.message === "string" ? err.message : String(error || "unknown_error"),
    stack,
  };
}

function getRequestLogContext(req) {
  if (!req.attuneRequestLog) {
    req.attuneRequestLog = {
      requestId: createRequestId(),
      startMs: Date.now(),
      route: req.path,
      userId: null,
      errorCode: null,
    };
  }
  return req.attuneRequestLog;
}

function setRequestUserId(req, userId) {
  if (!userId || typeof userId !== "string") return;
  getRequestLogContext(req).userId = userId;
}

function setRequestErrorCode(req, errorCode) {
  if (!errorCode || typeof errorCode !== "string") return;
  getRequestLogContext(req).errorCode = errorCode;
}

const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  const context = getRequestLogContext(req);
  res.setHeader("X-Request-Id", context.requestId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    let nextBody = body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      if (typeof body.error === "string") setRequestErrorCode(req, body.error);
      nextBody = { ...body, requestId: context.requestId };
    }
    return originalJson(nextBody);
  };

  res.on("finish", () => {
    const current = getRequestLogContext(req);
    logEvent("info", "api_request", {
      requestId: current.requestId,
      method: req.method,
      route: req.path,
      status: res.statusCode,
      durationMs: Date.now() - current.startMs,
      userId: current.userId,
      errorCode: current.errorCode,
    });
  });

  next();
});

app.post("/api/billing/paddle/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = typeof req.headers["paddle-signature"] === "string" ? req.headers["paddle-signature"] : "";
    ensurePaddleWebhookConfigured();
    verifyPaddleWebhookSignature(req.body, signature);
    const event = JSON.parse(req.body.toString("utf8"));
    await handlePaddleWebhookEvent(event);
    res.json({ received: true });
  } catch (error) {
    const errorCode = typeof error?.code === "string" ? error.code : "paddle_webhook_invalid";
    setRequestErrorCode(req, errorCode);
    logEvent("error", "paddle_webhook_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      errorCode,
      error: summarizeError(error),
    });
    res.status(400).json({ error: errorCode });
  }
});

app.use(express.json({ limit: "64kb" }));

app.use((error, req, res, next) => {
  if (!req.path?.startsWith?.("/api/")) {
    next(error);
    return;
  }

  const errorType = typeof error?.type === "string" ? error.type : "";
  const errorCode =
    errorType === "entity.too.large"
      ? "payload_too_large"
      : error instanceof SyntaxError || errorType === "entity.parse.failed"
        ? "malformed_json"
        : "";

  if (!errorCode) {
    next(error);
    return;
  }

  setRequestErrorCode(req, errorCode);
  logEvent("warn", "api_json_payload_rejected", {
    requestId: getRequestLogContext(req).requestId,
    route: req.path,
    errorCode,
    error: summarizeError(error),
  });

  res.status(errorCode === "payload_too_large" ? 413 : 400).json({ error: errorCode });
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

// Basic hardening for API responses.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  // These endpoints may include user-entered note snippets; avoid caching.
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});

function enforceAllowedOrigin(req, res, next) {
  // Browser requests include Origin; enforce it to reduce accidental cross-site use.
  // Non-browser clients may omit Origin; rate limiting is the primary control.
  const origin = req.headers.origin;
  if (!origin) return next();
  if (isOriginAllowed(origin)) return next();
  setRequestErrorCode(req, "forbidden_origin");
  logEvent("warn", "origin_rejected", {
    requestId: getRequestLogContext(req).requestId,
    route: req.path,
    origin,
  });
  res.status(403).json({ error: "forbidden_origin" });
}

function getClientIp(req) {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.ip || "unknown";
}

function makeMemoryRateLimiter({ windowMs, max, keyPrefix }) {
  const hits = new Map();
  const cleanupEveryMs = Math.max(10_000, Math.floor(windowMs / 2));
  let lastCleanup = 0;

  function cleanup(now) {
    if (now - lastCleanup < cleanupEveryMs) return;
    lastCleanup = now;
    for (const [key, entry] of hits.entries()) {
      if (!entry || entry.resetAt <= now) hits.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);

    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    cur.count += 1;
    if (cur.count > max) {
      const retryAfter = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      setRequestErrorCode(req, "rate_limited");
      logEvent("warn", "rate_limit_rejected", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        limiter: keyPrefix,
        retryAfter,
      });
      return res.status(429).json({ error: "rate_limited" });
    }
    next();
  };
}

function formatRateLimitWindow(windowMs) {
  const totalSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  if (totalSeconds % 86_400 === 0) return `${totalSeconds / 86_400} d`;
  if (totalSeconds % 3_600 === 0) return `${totalSeconds / 3_600} h`;
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} m`;
  return `${totalSeconds} s`;
}

function makeRateLimiter({ windowMs, max, keyPrefix }) {
  const memoryFallback = makeMemoryRateLimiter({ windowMs, max, keyPrefix });

  if (!upstashRedis) return memoryFallback;

  const ratelimit = new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.slidingWindow(max, formatRateLimitWindow(windowMs)),
    prefix: `attune:${keyPrefix}`,
    analytics: false,
  });

  return async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      const { success, limit, remaining, reset } = await ratelimit.limit(ip);

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
      if (reset) {
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(reset / 1000)));
      }

      if (!success) {
        const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;
        res.setHeader("Retry-After", String(retryAfter));
        setRequestErrorCode(req, "rate_limited");
        logEvent("warn", "rate_limit_rejected", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          limiter: keyPrefix,
          retryAfter,
        });
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      next();
    } catch (error) {
      logEvent("warn", "rate_limit_fallback", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        limiter: keyPrefix,
        error: summarizeError(error),
      });
      memoryFallback(req, res, next);
    }
  };
}

function makeTtlCache({ ttlMs, maxEntries }) {
  const cache = new Map();

  function get(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key, value) {
    // Simple FIFO eviction.
    if (cache.size >= maxEntries) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  }

  return { get, set };
}

const boardCache = makeTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 250 });
const noteCache = makeTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 400 });
const planCatalogCache = makeTtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 8 });

const limitBoard = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "board" });
const limitNote = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, keyPrefix: "note" });
const limitClientError = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 20, keyPrefix: "client-error" });
const limitBilling = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "billing" });

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

function redactClientErrorText(value, maxLen) {
  const text = typeof value === "string" ? value.trim().slice(0, maxLen) : "";
  if (!text) return undefined;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(access_token|refresh_token|code|token|otp)=([^&#\s]+)/gi, "$1=[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-jwt]");
}

app.post("/api/client-error", enforceAllowedOrigin, limitClientError, (req, res) => {
  const payload = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  const message = redactClientErrorText(payload.message, 300) || "client_error";
  const stack = redactClientErrorText(payload.stack, 1200);
  const source = typeof payload.source === "string" ? payload.source.trim().slice(0, 100) : "window.error";
  const pathname = typeof payload.pathname === "string" ? payload.pathname.trim().slice(0, 200) : undefined;
  const userAgent = typeof payload.userAgent === "string" ? payload.userAgent.trim().slice(0, 200) : undefined;

  setRequestErrorCode(req, "client_runtime_error");
  logEvent("error", "client_error", {
    requestId: getRequestLogContext(req).requestId,
    route: req.path,
    source,
    message,
    stack,
    pathname,
    userAgent,
  });

  res.status(202).json({ ok: true });
});

async function getUserEntitlementState(userId) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const [entitlementResult, purchaseResult] = await Promise.all([
    supabaseAdmin
      .from("user_entitlements")
      .select("plan_id, status, source, current_period_start, current_period_end, provider_subscription_id, provider_customer_id")
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

  const entitlement = entitlementResult.data || {
    plan_id: "free",
    status: "active",
    source: "manual",
    current_period_start: null,
    current_period_end: null,
    provider_subscription_id: null,
  };

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

function paddleSubscriptionDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function mapPaddleSubscriptionStatus(subscription) {
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

function paddleSubscriptionHasPlusPrice(subscription) {
  const plusPriceId = getPaddleBillingConfig().plusPriceId;
  return Array.isArray(subscription?.items)
    ? subscription.items.some((item) => item?.price?.id === plusPriceId)
    : false;
}

async function upsertPaddleEntitlement({ userId, customerId, subscription }) {
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

async function setPaddleCustomerReference({ userId, customerId }) {
  if (!supabaseAdmin || !userId || !customerId) return;

  const existing = await getUserEntitlementState(userId).catch(() => null);
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

async function resolvePaddleUserId({ subscription, customerId }) {
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

async function findPaddleCustomerByEmail(email) {
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

async function findPaddleSubscriptionForCustomer(customerId) {
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

async function reconcilePaddleBillingForUser({ userId, customerId, email }) {
  const config = getPaddleBillingConfig();
  if (!config.configured) return null;

  let resolvedCustomerId = typeof customerId === "string" ? customerId.trim() : "";
  if (!resolvedCustomerId && email) {
    const customer = await findPaddleCustomerByEmail(email).catch(() => null);
    resolvedCustomerId = typeof customer?.id === "string" ? customer.id : "";
    if (resolvedCustomerId) {
      await setPaddleCustomerReference({ userId, customerId: resolvedCustomerId }).catch(() => null);
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

  await upsertPaddleEntitlement({ userId, customerId: resolvedCustomerId, subscription });
  return subscription;
}

async function handlePaddleWebhookEvent(event) {
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
      const userId = await resolvePaddleUserId({ subscription, customerId });
      if (!userId || !customerId) return;
      await setPaddleCustomerReference({ userId, customerId }).catch(() => null);
      await upsertPaddleEntitlement({ userId, customerId, subscription });
      return;
    }
    default:
      return;
  }
}

async function persistVerifiedPlayPurchase({ userId, verification }) {
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

app.get("/api/billing/entitlements", enforceAllowedOrigin, limitBilling, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;

    const initialEntitlement = await getUserEntitlementState(authedUser.id);
    if (getPaddleBillingConfig().configured) {
      await reconcilePaddleBillingForUser({
        userId: authedUser.id,
        customerId: initialEntitlement.providerCustomerId,
        email: authedUser.email || "",
      }).catch(() => null);
    }

    const entitlement = await getUserEntitlementState(authedUser.id);
    setRequestUserId(req, authedUser.id);
    res.json({
      entitlement,
      configured: {
        googlePlay: getGooglePlayBillingConfig().configured,
        paddle: getPaddleBillingConfig().configured,
        paddlePortal: getPaddleBillingConfig().portalConfigured,
      },
    });
  } catch (error) {
    setRequestUserId(req, req.attuneRequestLog?.userId || null);
    setRequestErrorCode(req, "billing_entitlement_lookup_failed");
    logEvent("error", "billing_entitlement_lookup_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      error: summarizeError(error),
    });
    res.status(500).json({ error: "billing_entitlement_lookup_failed" });
  }
});

app.post("/api/billing/paddle/portal", enforceAllowedOrigin, limitBilling, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;
    setRequestUserId(req, authedUser.id);

    ensurePaddlePortalConfigured();

    const entitlement = await getUserEntitlementState(authedUser.id);
    let customerId = typeof entitlement.providerCustomerId === "string" ? entitlement.providerCustomerId.trim() : "";
    if (!customerId && authedUser.email) {
      const customer = await findPaddleCustomerByEmail(authedUser.email).catch(() => null);
      customerId = typeof customer?.id === "string" ? customer.id : "";
      if (customerId) {
        await setPaddleCustomerReference({ userId: authedUser.id, customerId }).catch(() => null);
      }
    }

    if (!customerId) {
      const error = new Error("paddle_customer_missing");
      error.code = "paddle_customer_missing";
      throw error;
    }

    const payload = entitlement.providerSubscriptionId
      ? { subscription_ids: [entitlement.providerSubscriptionId] }
      : undefined;
    const session = await paddleApiFetch(`/customers/${customerId}/portal-sessions`, {
      method: "POST",
      body: payload,
    });

    res.json({ ok: true, url: session?.data?.urls?.general?.overview || session?.data?.url || null });
  } catch (error) {
    const errorCode = typeof error?.code === "string" ? error.code : "paddle_portal_failed";
    setRequestErrorCode(req, errorCode);
    logEvent("error", "paddle_portal_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: getRequestLogContext(req).userId,
      errorCode,
      error: summarizeError(error),
    });
    res.status(errorCode === "paddle_portal_not_configured" ? 503 : 400).json({ error: errorCode });
  }
});

app.post("/api/billing/google-play/verify", enforceAllowedOrigin, limitBilling, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;
    setRequestUserId(req, authedUser.id);

    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
    const packageName = typeof body.packageName === "string" ? body.packageName.trim() : "";

    if (!purchaseToken) {
      setRequestErrorCode(req, "missing_purchase_token");
      res.status(400).json({ error: "missing_purchase_token" });
      return;
    }

    const verification = await verifyGooglePlaySubscriptionPurchase({
      packageName,
      purchaseToken,
    });

    if (!verification.obfuscatedExternalAccountId) {
      const error = new Error("google_play_missing_account_binding");
      error.code = "google_play_missing_account_binding";
      throw error;
    }

    if (verification.obfuscatedExternalAccountId !== authedUser.id) {
      const error = new Error("google_play_account_mismatch");
      error.code = "google_play_account_mismatch";
      throw error;
    }

    await persistVerifiedPlayPurchase({ userId: authedUser.id, verification });

    const entitlement = await getUserEntitlementState(authedUser.id);

    logEvent("info", "billing_google_play_verified", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: authedUser.id,
      productId: verification.productId,
      planId: verification.planId,
      status: verification.status,
      acknowledged: verification.acknowledged,
    });

    res.json({
      ok: true,
      entitlement,
      purchase: {
        productId: verification.productId,
        packageName: verification.packageName,
        purchaseToken: verification.purchaseToken,
        acknowledged: verification.acknowledged,
        currentPeriodEnd: verification.currentPeriodEnd,
        status: verification.status,
      },
    });
  } catch (error) {
    const errorCode = typeof error?.code === "string" ? error.code : "google_play_verify_failed";
    setRequestErrorCode(req, errorCode);
    logEvent("error", "billing_google_play_verify_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: getRequestLogContext(req).userId,
      errorCode,
      error: summarizeError(error),
    });

    const status = errorCode === "google_play_not_configured"
      ? 503
      : errorCode === "missing_purchase_token"
        || errorCode === "google_play_product_not_allowed"
        || errorCode === "google_play_package_name_mismatch"
        || errorCode === "google_play_missing_account_binding"
        || errorCode === "google_play_account_mismatch"
        || errorCode === "google_play_purchase_already_linked"
        ? 400
        : 502;

    res.status(status).json({ error: errorCode });
  }
});

function getBearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

async function requireAuthedUser(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    setRequestErrorCode(req, "missing_bearer_token");
    logEvent("warn", "auth_missing_bearer_token", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
    });
    res.status(401).json({ error: "missing_bearer_token" });
    return null;
  }

  if (!supabaseAuth) {
    setRequestErrorCode(req, "supabase_auth_not_configured");
    logEvent("error", "auth_not_configured", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
    });
    res.status(503).json({ error: "supabase_auth_not_configured" });
    return null;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user?.id) {
      setRequestErrorCode(req, "invalid_token");
      logEvent("warn", "auth_invalid_token", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        error: summarizeError(error),
      });
      res.status(401).json({ error: "invalid_token" });
      return null;
    }
    setRequestUserId(req, data.user.id);
    return data.user;
  } catch (error) {
    setRequestErrorCode(req, "invalid_token");
    logEvent("error", "auth_lookup_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      error: summarizeError(error),
    });
    res.status(401).json({ error: "invalid_token" });
    return null;
  }
}

async function recordAiUsage({ userId, kind, model, success, errorCode, meta }) {
  if (!supabaseAdmin) return;
  if (!userId || typeof userId !== "string") return;

  const payload = {
    user_id: userId,
    kind: typeof kind === "string" && kind ? kind : "unknown",
    model: typeof model === "string" && model ? model : MODEL,
    success: success !== false,
    error_code: typeof errorCode === "string" ? errorCode : null,
    meta: meta && typeof meta === "object" ? meta : {},
  };

  try {
    await supabaseAdmin.from("ai_usage").insert(payload);
  } catch (error) {
    logEvent("warn", "ai_usage_record_failed", {
      userId,
      kind: payload.kind,
      success: payload.success,
      errorCode: payload.error_code,
      error: summarizeError(error),
    });
  }
}

const DEFAULT_PLAN_LIMITS = {
  free: { daily: 20, monthly: null },
  plus: { daily: 200, monthly: null },
};

function normalizePlanId(planId) {
  return planId === "plus" ? "plus" : "free";
}

function hasPlusEntitlement(entitlement) {
  if (normalizePlanId(entitlement?.plan_id) !== "plus") return false;

  const status = String(entitlement?.status || "").toLowerCase();
  if (status === "active" || status === "grace") return true;
  if (status !== "canceled") return false;

  const currentPeriodEndMs = Date.parse(String(entitlement?.current_period_end || ""));
  return Number.isFinite(currentPeriodEndMs) && currentPeriodEndMs >= Date.now();
}

async function getUserAiContext(userId) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const [profileResult, entitlementResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("use_note_for_ai")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_entitlements")
      .select("plan_id, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileResult.error) throw new Error("profile_lookup_failed");
  if (entitlementResult.error) throw new Error("entitlement_lookup_failed");

  const requestedPlanId = hasPlusEntitlement(entitlementResult.data) ? "plus" : "free";
  let planRow = planCatalogCache.get(requestedPlanId);
  let planError = null;

  if (!planRow) {
    const planResult = await supabaseAdmin
      .from("plan_catalog")
      .select("plan_id, ai_daily_request_limit, ai_monthly_request_limit, is_active")
      .eq("plan_id", requestedPlanId)
      .maybeSingle();

    planRow = planResult.data || null;
    planError = planResult.error || null;

    if (planRow) planCatalogCache.set(requestedPlanId, planRow);
  }

  if (planError) throw new Error("plan_lookup_failed");

  const planIsUsable =
    !!planRow &&
    planRow.is_active !== false &&
    normalizePlanId(planRow.plan_id) === requestedPlanId;
  const resolvedPlanId = planIsUsable ? requestedPlanId : "free";
  const defaults = DEFAULT_PLAN_LIMITS[resolvedPlanId];

  return {
    useNoteForAi: profileResult.data?.use_note_for_ai !== false,
    planId: resolvedPlanId,
    dailyLimit:
      planIsUsable && Number.isInteger(planRow.ai_daily_request_limit)
        ? planRow.ai_daily_request_limit
        : defaults.daily,
    monthlyLimit:
      planIsUsable &&
      (planRow.ai_monthly_request_limit === null || Number.isInteger(planRow.ai_monthly_request_limit))
        ? planRow.ai_monthly_request_limit
        : defaults.monthly,
  };
}

async function reserveAiQuota({ userId, kind, model, planId, useNoteForAi, dailyLimit, monthlyLimit }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const rpcResult = await supabaseAdmin.rpc("reserve_ai_usage_quota", {
    p_user_id: userId,
    p_kind: kind,
    p_model: typeof model === "string" && model ? model : MODEL,
    p_meta: {
      cached: false,
      planId,
      useNoteForAi,
      quotaState: "reserved",
    },
    p_daily_limit: Number.isInteger(dailyLimit) ? dailyLimit : null,
    p_monthly_limit: Number.isInteger(monthlyLimit) ? monthlyLimit : null,
    p_reservation_ttl_seconds: 900,
  });

  if (rpcResult.error) throw new Error("quota_lookup_failed");

  const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  if (!row) throw new Error("quota_lookup_failed");

  return {
    allowed: row.allowed === true,
    error: typeof row.error === "string" ? row.error : "",
    usageId: typeof row.usage_id === "string" ? row.usage_id : "",
    dailyUsed: Number(row.daily_used) || 0,
    monthlyUsed: Number(row.monthly_used) || 0,
    resetAt: row.reset_at || null,
    period: row.period || null,
    used: row.period === "month" ? Number(row.monthly_used) || 0 : Number(row.daily_used) || 0,
    limit: row.period === "month" ? monthlyLimit : dailyLimit,
  };
}

async function finalizeReservedAiUsage({ usageId, success, errorCode, meta, model }) {
  if (!supabaseAdmin || !usageId) return;

  const current = await supabaseAdmin
    .from("ai_usage")
    .select("meta")
    .eq("id", usageId)
    .maybeSingle();

  if (current.error) throw new Error("ai_usage_finalize_failed");

  const nextMeta = {
    ...(current.data?.meta && typeof current.data.meta === "object" && !Array.isArray(current.data.meta) ? current.data.meta : {}),
    ...(meta && typeof meta === "object" ? meta : {}),
    cached: false,
    quotaState: success ? "billed" : "released",
  };

  const updates = {
    success: success === true,
    error_code: success === true ? null : (typeof errorCode === "string" ? errorCode : null),
    meta: nextMeta,
  };

  if (typeof model === "string" && model) {
    updates.model = model;
  }

  const result = await supabaseAdmin
    .from("ai_usage")
    .update(updates)
    .eq("id", usageId)
    .select("id")
    .single();

  if (result.error) throw new Error("ai_usage_finalize_failed");
}

async function rejectForQuota(req, res, { userId, kind, model, planId, quota }) {
  setRequestUserId(req, userId);
  setRequestErrorCode(req, quota.error);
  logEvent("warn", "ai_quota_rejected", {
    requestId: getRequestLogContext(req).requestId,
    route: req.path,
    userId,
    kind,
    planId,
    errorCode: quota.error,
    period: quota.period,
    limit: quota.limit,
    used: quota.used,
    resetAt: quota.resetAt,
  });

  await recordAiUsage({
    userId,
    kind,
    model,
    success: false,
    errorCode: quota.error,
    meta: {
      cached: false,
      planId,
      dailyUsed: quota.dailyUsed,
      monthlyUsed: quota.monthlyUsed,
      limit: quota.limit,
      period: quota.period,
    },
  });

  res.status(429).json({
    error: quota.error,
    planId,
    period: quota.period,
    limit: quota.limit,
    used: quota.used,
    remaining: 0,
    resetAt: quota.resetAt,
  });
}

function isRecoverableAiLookupError(errorCode) {
  return [
    "supabase_admin_not_configured",
    "profile_lookup_failed",
    "entitlement_lookup_failed",
    "plan_lookup_failed",
    "quota_lookup_failed",
  ].includes(String(errorCode || ""));
}

const forbiddenFragments = [
  "suicide",
  "self-harm",
  "self harm",
  "kill yourself",
  "kill myself",
  "cut yourself",
  "cut myself",
  "overdose",
  "harm yourself",
  "harm myself",
  "weapon",
  "medication",
  "medicine",
  "pill",
  "dosage",
  "dose",
  "prescription",
  "antidepressant",
  "benzodiazepine",
  "opioid",
  "treatment plan",
  "treatment",
  "diagnose",
  "diagnosis",
  "therapy",
  "therapist",
  "psychiatrist",
];

const commonWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "around",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "get",
  "go",
  "have",
  "in",
  "into",
  "is",
  "it",
  "just",
  "like",
  "make",
  "of",
  "on",
  "one",
  "or",
  "our",
  "out",
  "some",
  "take",
  "that",
  "the",
  "then",
  "this",
  "to",
  "today",
  "up",
  "with",
  "your",
  "you",
  "yours",
]);

const genericNoteTokens = new Set(["today", "feeling", "feel", "super", "really", "lets", "let"]);

const avoidAssumptionsUnlessUserSaid = [
  "lonely",
  "loneliness",
  "self-esteem",
  "self esteem",
  "depressed",
  "depression",
  "panic",
  "trauma",
  "ptsd",
  "ocd",
  "adhd",
  "bipolar",
  "eating disorder",
];

const dailyThemes = [
  "Make it simple",
  "Start gently",
  "One thing at a time",
  "A kind pace",
  "Clear one small space",
  "Do the next right tiny step",
  "Steady, not fast",
  "Soft focus",
  "Lower the bar on purpose",
  "Care first, then effort",
  "Make tomorrow easier",
  "Small brave",
  "Warmth over perfection",
  "Finish one loop",
];

// The Weekly screen already supports week-level reflection.
// Keep the Activity Picker board focused on today.
const weeklyReflectionFragments = [
  "reflect on the week",
  "reflect on your week",
  "weekly reflection",
  "weekly review",
  "review your week",
  "journal about the week",
  "journal about your week",
  "week journal",
];

function looksWeeklyReflectionTask(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  if (weeklyReflectionFragments.some((f) => t.includes(f))) return true;
  // Catch common variants without banning all journaling.
  if (t.includes("journal") && t.includes("week")) return true;
  if (t.includes("journaling") && t.includes("week")) return true;
  if (t.includes("reflect") && t.includes("week")) return true;
  return false;
}

function fillAndSanitizeTasks(tasks, targetCount = BOARD_TOTAL_TASK_COUNT) {
  const out = [];
  const seen = new Set();

  for (const t of Array.isArray(tasks) ? tasks : []) {
    const rawText = typeof t === "string" ? t : t?.text;
    const text = clampString(rawText, 120);
    if (!text) continue;
    if (looksWeeklyReflectionTask(text)) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push({ text });
  }

  return out.slice(0, targetCount);
}

function sanitizeBoardHistoryPayload(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const cleanList = (list, limit) =>
    (Array.isArray(list) ? list : [])
      .map((item) => sanitizeUntrustedAiText(typeof item === "string" ? item : item?.text, { maxLength: 120 }).text)
      .filter(Boolean)
      .slice(0, limit);

  return {
    recentShown: cleanList(input.recentShown, 45),
    recentPicked: cleanList(input.recentPicked, 30),
    recentCompleted: cleanList(input.recentCompleted, 30),
    recentRemoved: cleanList(input.recentRemoved, 30),
  };
}

function buildCuratedFallbackTasks(level) {
  const orderByLevel = {
    rest: ["rest", "gentle", "light"],
    gentle: ["gentle", "rest", "light", "steady"],
    light: ["light", "gentle", "steady", "rest"],
    steady: ["steady", "light", "gentle", "capable"],
    capable: ["capable", "steady", "light", "gentle"],
    brave: ["brave", "capable", "steady", "light"],
  };
  const levels = orderByLevel[level] || orderByLevel.gentle;
  const out = [];
  const seen = new Set();

  for (const taskLevel of levels) {
    const tasks = Array.isArray(TASKS[taskLevel]) ? TASKS[taskLevel] : [];
    for (const text of tasks) {
      const clean = clampString(text, 120);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      out.push({ text: clean, level: taskLevel });
    }
  }

  return out;
}

function stableHash(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDailyTheme(today) {
  const idx = stableHash(today) % dailyThemes.length;
  return dailyThemes[idx];
}

function looksUnsafe(text) {
  return !validateGeneratedAiTextSafety(text, { unsafeFragments: forbiddenFragments }).ok;
}

function normalizeForSimilarity(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return [];

  const tokens = t
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3)
    .filter((w) => !commonWords.has(w));

  return [...new Set(tokens)];
}

function overlapRatio(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  let hit = 0;
  for (const t of bTokens) if (a.has(t)) hit++;
  return hit / Math.max(1, Math.min(aTokens.length, bTokens.length));
}

function looksAssumptive(text, allowedContextLower) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  for (const frag of avoidAssumptionsUnlessUserSaid) {
    if (t.includes(frag) && !allowedContextLower.includes(frag)) return true;
  }
  return false;
}

function validateDailyNotePayload(payload, allowedContextLower) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };
  const note = payload.note;
  if (!note || typeof note !== "object") return { ok: false, error: "Missing note" };

  const title = clampString(note?.title, 64);
  const body = clampString(note?.body, 220);
  const focus = clampString(note?.focus, 80);

  const allowedThemes = ["rest", "overwhelm", "social", "body", "focus"];
  const rawThemes = Array.isArray(note?.themes) ? note.themes : [];
  const themes = rawThemes
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((t) => allowedThemes.includes(t));
  const dedupedThemes = [...new Set(themes)].slice(0, 2);

  if (!title || !body) return { ok: false, error: "Note must include title and body" };
  if (looksUnsafe(title) || looksUnsafe(body) || (focus && looksUnsafe(focus))) return { ok: false, error: "Unsafe note detected" };
  if (looksAssumptive(title, allowedContextLower) || looksAssumptive(body, allowedContextLower) || (focus && looksAssumptive(focus, allowedContextLower))) {
    return { ok: false, error: "Note makes assumptions not in user input" };
  }

  return { ok: true, note: { title, body, focus, themes: dedupedThemes } };
}

async function generateDailyNoteWithRetries(client, { system, userPayload, model }) {
  const maxAttempts = 2;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      attempt === 1
        ? userPayload
        : {
            ...userPayload,
            correction:
              "Your previous output had issues: " +
              lastError +
              ". Return a corrected JSON object that follows the schema exactly. Keep it calm, specific to the check-in, and avoid generic advice.",
          };

    const completion = await client.chat.completions.create({
      model,
      temperature: attempt === 1 ? 0.7 : 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      response_format: DAILY_NOTE_RESPONSE_FORMAT,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      lastError = "Empty model response";
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "Model did not return valid JSON";
      continue;
    }

    const checkin = userPayload?.checkin && typeof userPayload.checkin === "object" ? userPayload.checkin : {};
    const allowedContextLower = String(
      [
        ...(Array.isArray(checkin?.moodWords) ? checkin.moodWords : []),
        checkin?.mood || "",
        checkin?.energy || "",
        checkin?.body || "",
        checkin?.pace || "",
        checkin?.note || "",
      ].join(" ")
    ).toLowerCase();

    const validated = validateDailyNotePayload(parsed, allowedContextLower);
    if (!validated.ok) {
      lastError = validated.error || "Invalid note";
      continue;
    }

    return { ok: true, note: validated.note };
  }

  return { ok: false, error: lastError || "Invalid note" };
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

function computeBoardPreferences({ pace, energy }) {
  const paceLower = String(pace || "").toLowerCase();
  const energyLower = String(energy || "").toLowerCase();

  const baseByPace = {
    rest: { minLow: 12, minMedium: 0, minHigh: 0, maxHigh: 0, maxMinutes: 20 },
    gentle: { minLow: 10, minMedium: 2, minHigh: 0, maxHigh: 0, maxMinutes: 30 },
    light: { minLow: 8, minMedium: 4, minHigh: 1, maxHigh: 1, maxMinutes: 35 },
    steady: { minLow: 6, minMedium: 6, minHigh: 1, maxHigh: 2, maxMinutes: 40 },
    capable: { minLow: 4, minMedium: 7, minHigh: 2, maxHigh: 4, maxMinutes: 45 },
    brave: { minLow: 3, minMedium: 6, minHigh: 3, maxHigh: 5, maxMinutes: 45 },
  };

  const base = baseByPace[paceLower] || baseByPace.gentle;
  const prefs = { ...base };

  if (energyLower === "low") {
    prefs.maxHigh = Math.min(prefs.maxHigh, 1);
    prefs.minHigh = 0;
    prefs.minMedium = Math.max(0, prefs.minMedium - 2);
    prefs.minLow = Math.min(15, prefs.minLow + 2);
    prefs.maxMinutes = Math.min(prefs.maxMinutes, 30);
  } else if (energyLower === "high") {
    prefs.minHigh = clampInt(prefs.minHigh + 1, 0, 6, prefs.minHigh);
    prefs.minLow = clampInt(prefs.minLow - 1, 0, 15, prefs.minLow);
  }

  // Safety: ensure mins do not exceed 15.
  const minTotal = prefs.minLow + prefs.minMedium + prefs.minHigh;
  if (minTotal > 15) {
    // Reduce low first, then medium.
    const overflow = minTotal - 15;
    const reduceLow = Math.min(overflow, prefs.minLow);
    prefs.minLow -= reduceLow;
    const remaining = overflow - reduceLow;
    prefs.minMedium = Math.max(0, prefs.minMedium - remaining);
  }

  return prefs;
}

function containsAnyFragment(text, fragments) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return fragments.some((f) => f && t.includes(f));
}

function validateBoardPayload(payload, allowedContextLower, groundingFragments, expectedCount = BOARD_TOTAL_TASK_COUNT, opts = {}) {
  const warnings = [];
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };

  const tasks = payload.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: "Missing tasks[]" };
  const minCount = Number.isFinite(opts.minCount) ? Math.max(1, Math.floor(opts.minCount)) : expectedCount;
  if (tasks.length < minCount) return { ok: false, error: `tasks[] must have at least ${minCount} items` };
  if (tasks.length > expectedCount) return { ok: false, error: `tasks[] must have no more than ${expectedCount} items` };

  const seen = new Set();
  const tokenLists = [];
  let groundedCount = 0;
  for (const task of tasks) {
    const text = clampString(task?.text, 120);
    if (!text) return { ok: false, error: "Each task needs text" };
    if (looksUnsafe(text)) return { ok: false, error: "Unsafe task detected" };
    if (looksAssumptive(text, allowedContextLower)) return { ok: false, error: "Task text makes assumptions not in user input" };
    if (seen.has(text.toLowerCase())) return { ok: false, error: "Duplicate task detected" };
    seen.add(text.toLowerCase());

    const tokens = normalizeForSimilarity(text);
    for (const prev of tokenLists) {
      if (overlapRatio(tokens, prev) >= 0.72) {
        return { ok: false, error: "Tasks are too similar (near-duplicate)" };
      }
    }
    tokenLists.push(tokens);

    if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
      if (containsAnyFragment(text, groundingFragments)) groundedCount += 1;
    }
  }

  if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
    const minimumGrounded = Math.max(3, Math.ceil(expectedCount * 0.55));
    if (groundedCount < minimumGrounded) warnings.push("Board text is only lightly grounded in the check-in.");
  }

  return { ok: true, warnings };
}

async function generateBoardWithRetries(client, { system, userPayload, models, candidateCount, finalCount, fallbackTasks, boardHistory, maxCompletionTokens }) {
  let lastError = "";
  let lastWarnings = [];
  const desiredCandidateCount = Math.max(BOARD_TOTAL_TASK_COUNT, Number(candidateCount) || BOARD_AI_CANDIDATE_COUNT);
  const desiredFinalCount = Math.max(1, Number(finalCount) || BOARD_TOTAL_TASK_COUNT);
  const modelList = Array.from(
    new Set(
      (Array.isArray(models) ? models : [models])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  const attemptedModels = [];
  const modelErrors = [];

  for (const model of modelList) {
    attemptedModels.push(model);
    lastWarnings = [];

    let content = "";
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_completion_tokens: Math.max(1, Number(maxCompletionTokens) || BOARD_MAX_COMPLETION_TOKENS),
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: BOARD_RESPONSE_FORMAT,
      });
      content = completion.choices?.[0]?.message?.content || "";
    } catch (error) {
      lastError = summarizeError(error).message || "Model request failed";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    if (typeof content !== "string" || !content.trim()) {
      lastError = "Empty model response";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "Model did not return valid JSON";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    const checkin = userPayload?.checkin && typeof userPayload.checkin === "object" ? userPayload.checkin : {};
    const allowedContextLower = String(
      [
        ...(Array.isArray(checkin?.moodWords) ? checkin.moodWords : []),
        checkin?.mood || "",
        checkin?.energy || "",
        checkin?.body || "",
        checkin?.pace || "",
        checkin?.note || "",
      ].join(" ")
    ).toLowerCase();

    const groundingFragments = Array.isArray(userPayload?.grounding?.fragments)
      ? userPayload.grounding.fragments
      : [];

    const sanitizedTasks = fillAndSanitizeTasks(parsed?.tasks, desiredCandidateCount);

    const sanitizedPayload = { ...parsed, tasks: sanitizedTasks };

    const validated = validateBoardPayload(
      sanitizedPayload,
      allowedContextLower,
      groundingFragments,
      desiredCandidateCount,
      { minCount: desiredFinalCount },
    );
    if (!validated.ok) {
      lastError = validated.error || "Invalid board";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    lastWarnings = Array.isArray(validated.warnings) ? validated.warnings : [];
    const selected = selectQualityBoard({
      candidates: sanitizedTasks,
      fallbackTasks,
      checkin: userPayload?.checkin,
      boardHistory,
      targetCount: desiredFinalCount,
    });
    if (!Array.isArray(selected.tasks) || selected.tasks.length !== desiredFinalCount) {
      lastError = "Quality layer could not select enough tasks";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    const removed = Array.isArray(parsed?.tasks) ? parsed.tasks.length - sanitizedTasks.length : 0;
    if (removed > 0) lastWarnings = [...lastWarnings, "Removed week-level reflection tasks from today's board."];
    if (selected.meta?.fallbackCount > 0) lastWarnings = [...lastWarnings, "Filled weaker AI candidates with curated fallback tasks."];
    if (selected.meta?.rejectedCount > 0) lastWarnings = [...lastWarnings, "Rejected low-quality AI candidates before showing the board."];
    return {
      ok: true,
      tasks: selected.tasks,
      warnings: lastWarnings,
      quality: selected.meta,
      model,
      attemptedModels,
      modelErrors,
    };
  }

  return {
    ok: false,
    error: lastError || "Invalid board",
    warnings: lastWarnings,
    attemptedModels,
    modelErrors,
  };
}

app.post("/api/generate-board", enforceAllowedOrigin, limitBoard, async (req, res) => {
  try {
    const totalStartedMs = Date.now();
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;
    setRequestUserId(req, authedUser.id);

    if (!supabaseAdmin) {
      setRequestErrorCode(req, "supabase_admin_not_configured");
      logEvent("error", "ai_generate_board_admin_missing", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
      });
      res.status(503).json({ error: "supabase_admin_not_configured" });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const allowedLevels = new Set(["rest", "gentle", "light", "steady", "capable", "brave"]);
    const levelRaw = (clampString(req.body?.level, 24) || "gentle").toLowerCase();
    const level = allowedLevels.has(levelRaw) ? levelRaw : "gentle";
    const aiContextStartedMs = Date.now();
    const aiContext = await getUserAiContext(authedUser.id);
    const aiContextMs = Date.now() - aiContextStartedMs;

    const accessError = getAiBoardAccessError(aiContext);
    if (accessError) {
      setRequestErrorCode(req, accessError);
      logEvent("warn", "ai_generate_board_plus_required", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext?.planId,
        aiContextMs,
      });
      res.status(403).json({ error: accessError });
      return;
    }

    if (!OPENAI_API_KEY) {
      setRequestErrorCode(req, "ai_not_configured_openai_key_missing");
      logEvent("error", "ai_generate_board_openai_missing", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext.planId,
        aiContextMs,
      });
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const noteGuard = aiContext.useNoteForAi
      ? sanitizeUntrustedAiText(checkin.note, { maxLength: 200 })
      : { text: "", omitted: false, flags: [] };
    const note = noteGuard.text;
    const boardHistory = sanitizeBoardHistoryPayload(req.body?.boardHistory);

    const cacheKey = JSON.stringify({
      kind: "board",
      userId: authedUser.id,
      level,
      moodWords,
      mood,
      energy,
      body,
      note,
      noteOmitted: !!noteGuard.omitted,
      boardHistory,
    });
    const cached = boardCache.get(cacheKey);
    if (cached) {
      logEvent("info", "ai_generate_board_cache_hit", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext.planId,
      });
      res.json(cached);
      return;
    }

    const quotaReservation = await reserveAiQuota({
      userId: authedUser.id,
      kind: "generate_board",
      model: BOARD_MODEL,
      planId: aiContext.planId,
      useNoteForAi: aiContext.useNoteForAi,
      dailyLimit: aiContext.dailyLimit,
      monthlyLimit: aiContext.monthlyLimit,
    });
    if (!quotaReservation.allowed) {
      await rejectForQuota(req, res, {
        userId: authedUser.id,
        kind: "generate_board",
        model: BOARD_MODEL,
        planId: aiContext.planId,
        quota: quotaReservation,
      });
      return;
    }

    const preferences = computeBoardPreferences({ pace: level, energy });

    const groundingFragments = [
      String(level || "").toLowerCase(),
      String(energy || "").toLowerCase(),
      String(body || "").toLowerCase(),
      ...moodWords.map((w) => String(w || "").toLowerCase()),
    ].filter(Boolean);

    // Add a few note tokens as optional grounding anchors (avoid forcing awkward echoing).
    const noteTokens = normalizeForSimilarity(note)
      .filter((t) => !genericNoteTokens.has(t))
      .slice(0, 4);
    groundingFragments.push(...noteTokens);
    const fallbackTasks = buildCuratedFallbackTasks(level);

    const system =
      "You generate a calm, emotionally-safe list of micro-activities for a wellbeing app. " +
      UNTRUSTED_CONTEXT_INSTRUCTION + " " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Do NOT infer emotions or problems the user did not state. " +
      "The board MUST match the user's check-in (pace, energy, body, moodWords, and optional note). Avoid generic wellness lists. " +
      "Keep tasks small, doable, varied, and non-punitive. " +
        "Each task must be a single short line written as a direct action or invitation. " +
        "Use the check-in as hidden context for choosing the task, not as a required opening clause. " +
        "Only mention pace, energy, body, mood, or note details when they materially sharpen the task, and weave them in naturally. " +
      "Make the board feel bespoke: at least a third of the tasks should visibly reflect a concrete signal from the user's body state, mood words, pace, energy, or note. " +
        "Avoid formulaic lead-ins like 'With low energy, ...', 'With a gentle pace, ...', 'If your body feels tight, ...', or 'If you're feeling {moodWord}, ...'. " +
        "Do NOT add grounding that introduces new emotional assumptions. " +
        "Aim for concise, editorial phrasing that sounds written by a thoughtful coach, not assembled from placeholders. " +
      "Use recent board history to keep the board valuable day after day: avoid repeating recentShown or recentPicked items unless the idea is clearly one the user completes often. " +
      "Treat recentRemoved as a strong signal to avoid that kind of task today. " +
      "Favor specific verbs and concrete details over generic productivity language. " +
      "Do not lean on filler tasks like drinking water, closing tabs, clearing a surface, taking a walk, or setting a timer unless the check-in clearly supports them. " +
      "Vary the mix across body reset, environment reset, emotional regulation, and practical next-step tasks so the board does not collapse into one pattern. " +
      "Keep task text concise and within maxTextChars. " +
      "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. Avoid near-duplicate tasks. " +
      "Do NOT include week-level journaling/reflection (the app has a Weekly screen for that). Focus on today. " +
      "Return only the task strings the app needs for the AI-generated part of the board. No explanations, labels, categories, or metadata.";

    const userPayload = {
      checkin: {
        moodWords,
        mood,
        energy,
        body,
        pace: level,
        note,
      },
      contextSafety: {
        optionalNoteIncluded: !!note,
        optionalNoteOmitted: !!noteGuard.omitted,
        optionalNoteFlags: Array.isArray(noteGuard.flags) ? noteGuard.flags : [],
      },
      preferences,
      grounding: {
        fragments: groundingFragments,
      },
      recentBoardHistory: boardHistory,
      taskRequirements: {
        count: BOARD_AI_CANDIDATE_COUNT,
        finalBoardCountAfterServerCuration: BOARD_TOTAL_TASK_COUNT,
        style: "short, actionable, editorial, grounded in today's check-in",
        maxTextChars: 120,
        avoidAssumptions: true,
        avoidNearDuplicates: true,
        avoidRecentRepeats: true,
        pacingHint: preferences,
        examples: [
          "Drop your shoulders and lengthen the back of your neck.",
          "Turn the next task into a one-line starting point.",
          "Reset the space directly around you.",
        ],
      },
      outputSchema: "{\"tasks\":[string]}"
    };

    const generationStartedMs = Date.now();
    const generated = await generateBoardWithRetries(openAiClient, {
      system,
      userPayload,
      models: BOARD_MODEL_CANDIDATES,
      candidateCount: BOARD_AI_CANDIDATE_COUNT,
      finalCount: BOARD_TOTAL_TASK_COUNT,
      fallbackTasks,
      boardHistory,
      maxCompletionTokens: BOARD_MAX_COMPLETION_TOKENS,
    });
    const generationMs = Date.now() - generationStartedMs;
    const resolvedBoardModel = generated.model || BOARD_MODEL;
    const attemptedBoardModels = Array.isArray(generated.attemptedModels) ? generated.attemptedModels : BOARD_MODEL_CANDIDATES;
    const boardModelErrors = Array.isArray(generated.modelErrors) ? generated.modelErrors : [];
    const boardFallbackUsed = resolvedBoardModel !== BOARD_MODEL;

    if (!generated.ok) {
      setRequestErrorCode(req, generated.error || "invalid_board");
      logEvent("warn", "ai_generate_board_invalid", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        errorCode: generated.error || "invalid_board",
        planId: aiContext.planId,
        model: resolvedBoardModel,
        requestedModel: BOARD_MODEL,
        fallbackModel: BOARD_FALLBACK_MODEL,
        attemptedModels: attemptedBoardModels,
        modelErrors: boardModelErrors,
        aiContextMs,
        generationMs,
      });
      finalizeReservedAiUsage({
        usageId: quotaReservation.usageId,
        success: false,
        errorCode: generated.error || "invalid_board",
        model: resolvedBoardModel,
        meta: {
          planId: aiContext.planId,
          useNoteForAi: aiContext.useNoteForAi,
          model: resolvedBoardModel,
          requestedModel: BOARD_MODEL,
          fallbackModel: BOARD_FALLBACK_MODEL,
          attemptedModels: attemptedBoardModels,
          modelErrors: boardModelErrors,
        },
      }).catch(() => {});
      res.status(502).json({ error: generated.error || "Invalid board" });
      return;
    }

    const warnings = [
      ...(Array.isArray(generated.warnings) ? generated.warnings : []),
      ...(noteGuard.omitted ? ["Omitted unsafe optional note context."] : []),
    ];

    const payload = {
      tasks: generated.tasks,
      meta: {
        model: resolvedBoardModel,
        requestedModel: BOARD_MODEL,
        fallbackModel: BOARD_FALLBACK_MODEL,
        attemptedModels: attemptedBoardModels,
        fallbackUsed: boardFallbackUsed,
        createdAt: new Date().toISOString(),
        warnings,
        quality: generated.quality || null,
        strategy: "ai",
        cached: false,
      },
    };

    finalizeReservedAiUsage({
      usageId: quotaReservation.usageId,
      success: true,
      model: resolvedBoardModel,
      meta: {
        planId: aiContext.planId,
        useNoteForAi: aiContext.useNoteForAi,
        model: resolvedBoardModel,
        requestedModel: BOARD_MODEL,
        fallbackModel: BOARD_FALLBACK_MODEL,
        attemptedModels: attemptedBoardModels,
        fallbackUsed: boardFallbackUsed,
        strategy: "ai",
        quality: generated.quality || null,
      },
    }).catch(() => {});

    boardCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });

    logEvent("info", "ai_generate_board_completed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: authedUser.id,
      planId: aiContext.planId,
      model: resolvedBoardModel,
      requestedModel: BOARD_MODEL,
      fallbackModel: BOARD_FALLBACK_MODEL,
      attemptedModels: attemptedBoardModels,
      fallbackUsed: boardFallbackUsed,
      aiContextMs,
      generationMs,
      totalMs: Date.now() - totalStartedMs,
      aiTaskCount: generated.tasks.length,
      quality: generated.quality || null,
      warnings: warnings.length,
    });

    res.json(payload);
  } catch (err) {
    const errorCode = String(err?.message || "");
    if (isRecoverableAiLookupError(errorCode)) {
      setRequestErrorCode(req, errorCode);
      logEvent("warn", "ai_generate_board_recoverable_error", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(err),
      });
      res.status(503).json({ error: errorCode });
      return;
    }
    setRequestErrorCode(req, "generate_board_failed");
    logEvent("error", "ai_generate_board_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: getRequestLogContext(req).userId,
      errorCode,
      error: summarizeError(err),
    });
    res.status(500).json({ error: "Failed to generate board" });
  }
});

app.post("/api/daily-note", enforceAllowedOrigin, limitNote, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;
    setRequestUserId(req, authedUser.id);

    if (!supabaseAdmin) {
      setRequestErrorCode(req, "supabase_admin_not_configured");
      logEvent("error", "ai_daily_note_admin_missing", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
      });
      res.status(503).json({ error: "supabase_admin_not_configured" });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const level = clampString(req.body?.level, 24) || "gentle";
    const today = clampString(req.body?.today, 20) || "";
    const aiContextStartedMs = Date.now();
    const aiContext = await getUserAiContext(authedUser.id);
    const aiContextMs = Date.now() - aiContextStartedMs;

    const accessError = getAiDailyNoteAccessError(aiContext);
    if (accessError) {
      setRequestErrorCode(req, accessError);
      logEvent("warn", "ai_daily_note_plus_required", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext?.planId,
        aiContextMs,
      });
      res.status(403).json({ error: accessError });
      return;
    }

    if (!OPENAI_API_KEY) {
      setRequestErrorCode(req, "ai_not_configured_openai_key_missing");
      logEvent("error", "ai_daily_note_openai_missing", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext.planId,
        aiContextMs,
      });
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const noteGuard = aiContext.useNoteForAi
      ? sanitizeUntrustedAiText(checkin.note, { maxLength: 200 })
      : { text: "", omitted: false, flags: [] };
    const note = noteGuard.text;

    const cacheKey = JSON.stringify({
      kind: "note",
      userId: authedUser.id,
      level,
      today,
      moodWords,
      mood,
      energy,
      body,
      note,
      noteOmitted: !!noteGuard.omitted,
    });
    const cached = noteCache.get(cacheKey);
    if (cached) {
      logEvent("info", "ai_daily_note_cache_hit", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext.planId,
      });
      res.json(cached);
      return;
    }

    const quotaReservation = await reserveAiQuota({
      userId: authedUser.id,
      kind: "daily_note",
      model: MODEL,
      planId: aiContext.planId,
      useNoteForAi: aiContext.useNoteForAi,
      dailyLimit: aiContext.dailyLimit,
      monthlyLimit: aiContext.monthlyLimit,
    });
    if (!quotaReservation.allowed) {
      await rejectForQuota(req, res, {
        userId: authedUser.id,
        kind: "daily_note",
        model: MODEL,
        planId: aiContext.planId,
        quota: quotaReservation,
      });
      return;
    }

    const theme = pickDailyTheme(today || new Date().toISOString().slice(0, 10));

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system =
      "You write a very short, calm daily note for a wellbeing app. " +
      UNTRUSTED_CONTEXT_INSTRUCTION + " " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Do NOT infer emotions or problems the user did not state. " +
      "Do NOT shame, scold, or pressure. Avoid absolute language (never/always). " +
      "Make it feel fresh daily, but still grounded in the check-in. " +
      "Keep it practical and supportive; not inspirational fluff. " +
      "Avoid awkward phrases like 'gentle task'. Prefer 'small step', 'low-effort', or 'doable'.";

    const userPayload = {
      today,
      theme,
      checkin: {
        moodWords,
        mood,
        energy,
        body,
        pace: level,
        note,
      },
      contextSafety: {
        optionalNoteIncluded: !!note,
        optionalNoteOmitted: !!noteGuard.omitted,
        optionalNoteFlags: Array.isArray(noteGuard.flags) ? noteGuard.flags : [],
      },
      writingRules: {
        titleMaxChars: 60,
        bodyMaxChars: 200,
        focusMaxChars: 80,
        voice: "calm, supportive, specific",
        avoid: [
          "medical advice",
          "therapy language",
          "diagnoses",
          "weight loss or dieting",
          "extreme exercise",
          "assumed loneliness/anxiety unless stated",
        ],
      },
      outputSchema:
        "{\"note\":{\"title\":string,\"body\":string,\"focus\":string,\"themes\":string[]}}",
      guidance:
        "Write 1 title + 1 body sentence (or 2 short sentences). Include a tiny focus phrase. Tie back to pace/energy/body/moodWords/note without copying the note verbatim. " +
        "Also set note.themes to 0-2 items chosen ONLY from: [rest, overwhelm, social, body, focus]. " +
        "Theme mapping hints: if the user expresses motivation, confidence, determination, excitement, or being ready to act, prefer 'focus'. " +
        "If they describe stress/pressure/anxiety/too-much, prefer 'overwhelm'. If they describe tiredness/sleep/rest needs, prefer 'rest'. " +
        "If they mention pain/sickness/symptoms, prefer 'body'. If they mention loneliness/relationships/people, prefer 'social'. " +
        "Choose themes only if clearly supported by the user's check-in (especially their note); otherwise return []. If note is empty, return [].",
    };

    const generated = await generateDailyNoteWithRetries(client, {
      system,
      userPayload,
      model: MODEL,
    });

    if (!generated.ok) {
      setRequestErrorCode(req, generated.error || "invalid_note");
      logEvent("warn", "ai_daily_note_invalid", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        errorCode: generated.error || "invalid_note",
        planId: aiContext.planId,
      });
      finalizeReservedAiUsage({
        usageId: quotaReservation.usageId,
        success: false,
        errorCode: generated.error || "invalid_note",
        meta: { planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
      }).catch(() => {});
      res.status(502).json({ error: generated.error || "Invalid note" });
      return;
    }

    const payload = {
      note: generated.note,
      meta: {
        model: MODEL,
        createdAt: new Date().toISOString(),
        cached: false,
        optionalNoteOmitted: !!noteGuard.omitted,
      },
    };

    finalizeReservedAiUsage({
      usageId: quotaReservation.usageId,
      success: true,
      meta: { planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
    }).catch(() => {});

    noteCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
    res.json(payload);
  } catch (err) {
    const errorCode = String(err?.message || "");
    if (isRecoverableAiLookupError(errorCode)) {
      setRequestErrorCode(req, errorCode);
      logEvent("warn", "ai_daily_note_recoverable_error", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(err),
      });
      res.status(503).json({ error: errorCode });
      return;
    }
    setRequestErrorCode(req, "daily_note_failed");
    logEvent("error", "ai_daily_note_failed", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId: getRequestLogContext(req).userId,
      errorCode,
      error: summarizeError(err),
    });
    res.status(500).json({ error: "Failed to generate daily note" });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`AI API (${ATTUNE_ENV}) listening on http://localhost:${PORT}`);
  });
}

export default app;
