import "dotenv/config";

import express from "express";
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openAiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashRedis = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;

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
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;

const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);
app.use(express.json({ limit: "64kb" }));

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
  if (allowedOrigins.includes(origin)) return next();
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
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      next();
    } catch {
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

const limitBoard = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "board" });
const limitNote = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, keyPrefix: "note" });

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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
    res.status(401).json({ error: "missing_bearer_token" });
    return null;
  }

  if (!supabaseAuth) {
    res.status(503).json({ error: "supabase_auth_not_configured" });
    return null;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user?.id) {
      res.status(401).json({ error: "invalid_token" });
      return null;
    }
    return data.user;
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return null;
  }
}

async function recordAiUsage({ userId, kind, success, errorCode, meta }) {
  if (!supabaseAdmin) return;
  if (!userId || typeof userId !== "string") return;

  const payload = {
    user_id: userId,
    kind: typeof kind === "string" && kind ? kind : "unknown",
    model: MODEL,
    success: success !== false,
    error_code: typeof errorCode === "string" ? errorCode : null,
    meta: meta && typeof meta === "object" ? meta : {},
  };

  try {
    await supabaseAdmin.from("ai_usage").insert(payload);
  } catch {
    // Ignore usage logging failures.
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

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
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
  const { data: planRow, error: planError } = await supabaseAdmin
    .from("plan_catalog")
    .select("plan_id, ai_daily_request_limit, ai_monthly_request_limit, is_active")
    .eq("plan_id", requestedPlanId)
    .maybeSingle();

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

async function countBillableAiUsageSince(userId, sinceIso) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const rpcResult = await supabaseAdmin.rpc("count_billable_ai_usage", {
    p_user_id: userId,
    p_since: sinceIso,
  });

  if (!rpcResult.error) {
    return Number(rpcResult.data) || 0;
  }

  const fallbackResult = await supabaseAdmin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("success", true)
    .gte("occurred_at", sinceIso);

  if (fallbackResult.error) throw new Error("quota_lookup_failed");
  return Number(fallbackResult.count) || 0;
}

async function getAiQuotaState({ userId, dailyLimit, monthlyLimit }) {
  if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);

  const dailyQuery = Number.isInteger(dailyLimit)
    ? countBillableAiUsageSince(userId, dayStart.toISOString())
    : Promise.resolve(0);

  const monthlyQuery = Number.isInteger(monthlyLimit)
    ? countBillableAiUsageSince(userId, monthStart.toISOString())
    : Promise.resolve(0);

  const [dailyUsed, monthlyUsed] = await Promise.all([dailyQuery, monthlyQuery]);

  if (Number.isInteger(dailyLimit) && dailyUsed >= dailyLimit) {
    return {
      allowed: false,
      error: "ai_daily_limit_reached",
      period: "day",
      limit: dailyLimit,
      used: dailyUsed,
      resetAt: addUtcDays(dayStart, 1).toISOString(),
      dailyUsed,
      monthlyUsed,
    };
  }

  if (Number.isInteger(monthlyLimit) && monthlyUsed >= monthlyLimit) {
    return {
      allowed: false,
      error: "ai_monthly_limit_reached",
      period: "month",
      limit: monthlyLimit,
      used: monthlyUsed,
      resetAt: addUtcMonths(monthStart, 1).toISOString(),
      dailyUsed,
      monthlyUsed,
    };
  }

  return {
    allowed: true,
    dailyUsed,
    monthlyUsed,
  };
}

async function rejectForQuota(res, { userId, kind, planId, quota }) {
  await recordAiUsage({
    userId,
    kind,
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

function makeFallbackTask(text) {
  return {
    text: clampString(text, 120),
  };
}

function fillAndSanitizeTasks(tasks) {
  const safePool = [
    "Take 5 slow breaths and drop your shoulders.",
    "Tidy one small surface for 8 minutes.",
    "Step outside or to a window for 3 minutes of fresh air.",
    "Do a gentle stretch for your neck and shoulders.",
    "Put on one song and move lightly for its length.",
    "Write a tiny list: 2 priorities and 1 treat.",
    "Make a simple snack and sit to eat it.",
    "Send one kind message if that feels easy.",
    "Set a 10-minute timer and do one calm task.",
    "Do a short walk in place or around the room.",
    "Put a glass of water somewhere you'll see it.",
    "Do a quick reset and clear one small pile.",
    "Read 2 pages of something you like.",
    "Do a 60-second body scan: forehead, jaw, shoulders.",
    "Pick one tiny future-you setup like charger, clothes, or keys.",
  ];

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

  for (const s of safePool) {
    if (out.length >= 15) break;
    const text = clampString(s, 120);
    if (!text) continue;
    if (looksWeeklyReflectionTask(text)) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(makeFallbackTask(text));
  }

  return out.slice(0, 15);
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
  const t = String(text || "").toLowerCase();
  if (!t) return true;
  return forbiddenFragments.some((frag) => t.includes(frag));
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
      response_format: { type: "json_object" },
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

function validateBoardPayload(payload, allowedContextLower, groundingFragments) {
  const warnings = [];
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };

  const tasks = payload.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: "Missing tasks[]" };
  if (tasks.length !== 15) return { ok: false, error: "tasks[] must have length 15" };

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
    if (groundedCount < 8) warnings.push("Board text is only lightly grounded in the check-in.");
  }

  return { ok: true, warnings };
}

async function generateBoardWithRetries(client, { system, userPayload, model }) {
  const maxAttempts = 1;
  let lastError = "";
  let lastWarnings = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: { type: "json_object" },
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

    const groundingFragments = Array.isArray(userPayload?.grounding?.fragments)
      ? userPayload.grounding.fragments
      : [];

    const sanitizedTasks = fillAndSanitizeTasks(parsed?.tasks);

    const sanitizedPayload = { ...parsed, tasks: sanitizedTasks };

    const validated = validateBoardPayload(sanitizedPayload, allowedContextLower, groundingFragments);
    if (!validated.ok) {
      lastError = validated.error || "Invalid board";
      continue;
    }

    lastWarnings = Array.isArray(validated.warnings) ? validated.warnings : [];
    const removed = Array.isArray(parsed?.tasks) ? parsed.tasks.length - sanitizedTasks.length : 0;
    if (removed > 0) lastWarnings = [...lastWarnings, "Removed week-level reflection tasks from today's board."];
    if (sanitizedTasks.length < 15) lastWarnings = [...lastWarnings, "Filled missing tasks with today-focused fallbacks."];
    return { ok: true, tasks: sanitizedTasks, warnings: lastWarnings };
  }

  return { ok: false, error: lastError || "Invalid board", warnings: lastWarnings };
}

app.post("/api/generate-board", enforceAllowedOrigin, limitBoard, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;

    if (!supabaseAdmin) {
      res.status(503).json({ error: "supabase_admin_not_configured" });
      return;
    }

    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const allowedLevels = new Set(["rest", "gentle", "light", "steady", "capable", "brave"]);
    const levelRaw = (clampString(req.body?.level, 24) || "gentle").toLowerCase();
    const level = allowedLevels.has(levelRaw) ? levelRaw : "gentle";
    const aiContext = await getUserAiContext(authedUser.id);

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const note = aiContext.useNoteForAi ? clampString(checkin.note, 200) : "";

    const cacheKey = JSON.stringify({ kind: "board", userId: authedUser.id, level, moodWords, mood, energy, body, note });
    const cached = boardCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const quota = await getAiQuotaState({
      userId: authedUser.id,
      dailyLimit: aiContext.dailyLimit,
      monthlyLimit: aiContext.monthlyLimit,
    });
    if (!quota.allowed) {
      await rejectForQuota(res, {
        userId: authedUser.id,
        kind: "generate_board",
        planId: aiContext.planId,
        quota,
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

    const system =
      "You generate a calm, emotionally-safe list of micro-activities for a wellbeing app. " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Do NOT infer emotions or problems the user did not state. " +
      "The board MUST match the user's check-in (pace, energy, body, moodWords, and optional note). Avoid generic wellness lists. " +
      "Keep tasks small, doable, varied, and non-punitive. " +
      "Each task must be a single short line that starts with a brief grounding clause tied to a REAL check-in signal, then the action. " +
      "Use patterns like: 'With low energy, ...', 'With a gentle pace, ...', 'If your body feels tight, ...', or 'If you're feeling {moodWord}, ...'. " +
      "Do NOT add grounding that introduces new emotional assumptions. " +
      "Keep task text concise and within maxTextChars. " +
      "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. Avoid near-duplicate tasks. " +
      "Do NOT include week-level journaling/reflection (the app has a Weekly screen for that). Focus on today. " +
      "Return only the 15 task strings the app needs. No explanations, labels, categories, or metadata.";

    const userPayload = {
      checkin: {
        moodWords,
        mood,
        energy,
        body,
        pace: level,
        note,
      },
      preferences,
      grounding: {
        fragments: groundingFragments,
      },
      taskRequirements: {
        count: 15,
        style: "short, actionable, grounded in today's check-in",
        maxTextChars: 120,
        avoidAssumptions: true,
        avoidNearDuplicates: true,
        pacingHint: preferences,
        examples: [
          "With low energy, tidy one small surface.",
          "If your body feels tight, do a gentle neck stretch.",
          "With a gentle pace, write down one small next step.",
        ],
      },
      outputSchema: "{\"tasks\":[string]}"
    };

    const generated = await generateBoardWithRetries(openAiClient, {
      system,
      userPayload,
      model: MODEL,
    });

    if (!generated.ok) {
      recordAiUsage({
        userId: authedUser.id,
        kind: "generate_board",
        success: false,
        errorCode: generated.error || "invalid_board",
        meta: { cached: false, planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
      }).catch(() => {});
      res.status(502).json({ error: generated.error || "Invalid board" });
      return;
    }

    const payload = {
      tasks: generated.tasks,
      meta: {
        model: MODEL,
        createdAt: new Date().toISOString(),
        warnings: Array.isArray(generated.warnings) ? generated.warnings : [],
        cached: false,
      },
    };

    recordAiUsage({
      userId: authedUser.id,
      kind: "generate_board",
      success: true,
      meta: { cached: false, planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
    }).catch(() => {});

    boardCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
    res.json(payload);
  } catch (err) {
    const errorCode = String(err?.message || "");
    if (isRecoverableAiLookupError(errorCode)) {
      res.status(503).json({ error: errorCode });
      return;
    }
    res.status(500).json({ error: "Failed to generate board" });
  }
});

app.post("/api/daily-note", enforceAllowedOrigin, limitNote, async (req, res) => {
  try {
    const authedUser = await requireAuthedUser(req, res);
    if (!authedUser) return;

    if (!supabaseAdmin) {
      res.status(503).json({ error: "supabase_admin_not_configured" });
      return;
    }

    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const level = clampString(req.body?.level, 24) || "gentle";
    const today = clampString(req.body?.today, 20) || "";
    const aiContext = await getUserAiContext(authedUser.id);

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const note = aiContext.useNoteForAi ? clampString(checkin.note, 200) : "";

    const cacheKey = JSON.stringify({ kind: "note", userId: authedUser.id, level, today, moodWords, mood, energy, body, note });
    const cached = noteCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const quota = await getAiQuotaState({
      userId: authedUser.id,
      dailyLimit: aiContext.dailyLimit,
      monthlyLimit: aiContext.monthlyLimit,
    });
    if (!quota.allowed) {
      await rejectForQuota(res, {
        userId: authedUser.id,
        kind: "daily_note",
        planId: aiContext.planId,
        quota,
      });
      return;
    }

    const theme = pickDailyTheme(today || new Date().toISOString().slice(0, 10));

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system =
      "You write a very short, calm daily note for a wellbeing app. " +
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
      recordAiUsage({
        userId: authedUser.id,
        kind: "daily_note",
        success: false,
        errorCode: generated.error || "invalid_note",
        meta: { cached: false, planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
      }).catch(() => {});
      res.status(502).json({ error: generated.error || "Invalid note" });
      return;
    }

    const payload = {
      note: generated.note,
      meta: { model: MODEL, createdAt: new Date().toISOString(), cached: false },
    };

    recordAiUsage({
      userId: authedUser.id,
      kind: "daily_note",
      success: true,
      meta: { cached: false, planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
    }).catch(() => {});

    noteCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
    res.json(payload);
  } catch (err) {
    const errorCode = String(err?.message || "");
    if (isRecoverableAiLookupError(errorCode)) {
      res.status(503).json({ error: errorCode });
      return;
    }
    res.status(500).json({ error: "Failed to generate daily note" });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`AI API listening on http://localhost:${PORT}`);
  });
}

export default app;
