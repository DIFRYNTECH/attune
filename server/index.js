import "dotenv/config";

import express from "express";
import OpenAI from "openai";

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

function makeRateLimiter({ windowMs, max, keyPrefix }) {
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

    const ip = req.ip || "unknown";
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

function makeFallbackTask(text, { pace, energy, body }) {
  const lvl = String(pace || "").toLowerCase();
  const e = String(energy || "").toLowerCase();
  const b = String(body || "").toLowerCase();
  const why =
    lvl && e && b
      ? `Given your pace is ${lvl} with ${e} energy and ${b} body, this is a doable step for today.`
      : "A doable step for today, with no pressure.";

  return {
    text,
    minutes: 10,
    intensity: "low",
    category: "mind",
    why,
  };
}

function fillAndSanitizeTasks(tasks, { pace, energy, body }) {
  const safePool = [
    { text: "Take 5 slow breaths and drop your shoulders.", minutes: 2, intensity: "low", category: "rest" },
    { text: "Tidy one small surface for 8 minutes.", minutes: 8, intensity: "medium", category: "home" },
    { text: "Step outside (or to a window) for 3 minutes of fresh air.", minutes: 3, intensity: "low", category: "rest" },
    { text: "Do a gentle stretch for your neck and shoulders.", minutes: 5, intensity: "low", category: "body" },
    { text: "Put on one song and move lightly for its length.", minutes: 4, intensity: "medium", category: "body" },
    { text: "Write a tiny list: 2 priorities + 1 treat.", minutes: 5, intensity: "low", category: "admin" },
    { text: "Make a simple snack and sit to eat it.", minutes: 10, intensity: "low", category: "home" },
    { text: "Send one kind message (optional).", minutes: 3, intensity: "low", category: "connection" },
    { text: "Set a 10-minute timer and do one calm task.", minutes: 10, intensity: "medium", category: "admin" },
    { text: "Do a short walk in place or around the room.", minutes: 6, intensity: "medium", category: "body" },
    { text: "Put a glass of water somewhere you'll see it.", minutes: 2, intensity: "low", category: "home" },
    { text: "Do a quick reset: clear one small pile.", minutes: 10, intensity: "medium", category: "home" },
    { text: "Read 2 pages of something you like.", minutes: 6, intensity: "low", category: "mind" },
    { text: "Do a 60-second body scan: forehead, jaw, shoulders.", minutes: 2, intensity: "low", category: "rest" },
    { text: "Pick a tiny 'future-you' setup (charger, clothes, keys).", minutes: 8, intensity: "medium", category: "admin" },
  ];

  const out = [];
  const seen = new Set();

  for (const t of Array.isArray(tasks) ? tasks : []) {
    const text = clampString(t?.text, 120);
    if (!text) continue;
    if (looksWeeklyReflectionTask(text)) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    const minutes = clampInt(t?.minutes, 1, 45, 10);
    const intensityRaw = String(t?.intensity || "low").toLowerCase();
    const intensity = intensityRaw === "low" || intensityRaw === "medium" || intensityRaw === "high" ? intensityRaw : "low";
    const categoryRaw = String(t?.category || "mind").toLowerCase();
    const allowedCategories = ["rest", "mind", "body", "home", "connection", "admin"];
    const category = allowedCategories.includes(categoryRaw) ? categoryRaw : "mind";
    const why = clampString(t?.why, 160) || makeFallbackTask(text, { pace, energy, body }).why;

    // Only keep the keys we expect.
    out.push({ text, minutes, intensity, category, why });
  }

  for (const s of safePool) {
    if (out.length >= 15) break;
    const text = s.text;
    if (!text) continue;
    if (looksWeeklyReflectionTask(text)) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      ...makeFallbackTask(text, { pace, energy, body }),
      minutes: s.minutes,
      intensity: s.intensity,
      category: s.category,
    });
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

function validateBoardPayload(payload, allowedContextLower, preferences, groundingFragments) {
  const warnings = [];
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };

  const tasks = payload.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: "Missing tasks[]" };
  if (tasks.length !== 15) return { ok: false, error: "tasks[] must have length 15" };

  const seen = new Set();
  const tokenLists = [];
  const categoryCounts = { rest: 0, mind: 0, body: 0, home: 0, connection: 0, admin: 0 };

  const intensityCounts = { low: 0, medium: 0, high: 0 };

  const maxPerCategory = 5;
  const minDistinctCategories = 4;
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

    const minutes = task?.minutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 1 || minutes > 45) {
      return { ok: false, error: "Each task needs minutes (1-45)" };
    }

    const intensity = task?.intensity;
    if (intensity !== "low" && intensity !== "medium" && intensity !== "high") {
      return { ok: false, error: "Each task needs intensity low|medium|high" };
    }
    intensityCounts[intensity] = (intensityCounts[intensity] || 0) + 1;

    const category = task?.category;
    const allowedCategories = ["rest", "mind", "body", "home", "connection", "admin"];
    if (!allowedCategories.includes(category)) {
      return { ok: false, error: "Each task needs a valid category" };
    }
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (categoryCounts[category] > maxPerCategory) {
      return { ok: false, error: `Too many tasks in category '${category}'` };
    }

    const why = clampString(task?.why, 160);
    if (!why) return { ok: false, error: "Each task needs why" };
    if (looksUnsafe(why)) return { ok: false, error: "Unsafe rationale detected" };
    if (looksAssumptive(why, allowedContextLower)) return { ok: false, error: "Rationale makes assumptions not in user input" };

    // Grounding: prefer rationales that reference a check-in signal.
    // Keep this soft so we don't fail the whole board after the user waits.
    if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
      if (containsAnyFragment(why, groundingFragments)) groundedCount += 1;
    }
  }

  const distinctCategories = Object.values(categoryCounts).filter((n) => n > 0).length;
  if (distinctCategories < minDistinctCategories) {
    return { ok: false, error: "Not enough variety across categories" };
  }

  if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
    if (groundedCount < 10) warnings.push("Board rationales are not strongly grounded in the check-in.");
  }

  if (preferences && typeof preferences === "object") {
    if (Number.isFinite(preferences.maxMinutes)) {
      const maxMinutes = preferences.maxMinutes;
      for (const t of tasks) {
        if (typeof t?.minutes === "number" && t.minutes > maxMinutes) {
          return { ok: false, error: "Task duration too long for today's pace" };
        }
      }
    }

    if (Number.isFinite(preferences.minMedium) && intensityCounts.medium < preferences.minMedium) {
      warnings.push("Board intensity mix skews lighter than today's pace.");
    }
    if (Number.isFinite(preferences.minHigh) && intensityCounts.high < preferences.minHigh) {
      warnings.push("Board has fewer high-intensity options than preferred for today's pace.");
    }
    if (Number.isFinite(preferences.maxHigh) && intensityCounts.high > preferences.maxHigh) {
      return { ok: false, error: "Too many high-intensity tasks for today's pace" };
    }
  }

  return { ok: true, warnings };
}

async function generateBoardWithRetries(client, { system, userPayload, model }) {
  const maxAttempts = 2;
  let lastError = "";
  let lastWarnings = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      attempt === 1
        ? userPayload
        : {
            ...userPayload,
            correction:
              "Your previous output had issues: " +
              lastError +
              ". Return a corrected JSON object that follows the schema exactly. Ensure variety and avoid near-duplicates and emotional assumptions.",
          };

    const completion = await client.chat.completions.create({
      model,
      temperature: attempt === 1 ? 0.6 : 0.3,
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

    const preferences =
      userPayload?.preferences && typeof userPayload.preferences === "object" ? userPayload.preferences : null;

    const groundingFragments = Array.isArray(userPayload?.grounding?.fragments)
      ? userPayload.grounding.fragments
      : [];

    // Filter out week-level journaling/reflection tasks (Weekly screen covers that)
    // and fill any gaps with safe, today-focused fallbacks.
    const sanitizedTasks = fillAndSanitizeTasks(parsed?.tasks, {
      pace: checkin?.pace,
      energy: checkin?.energy,
      body: checkin?.body,
    });

    const sanitizedPayload = { ...parsed, tasks: sanitizedTasks };

    const validated = validateBoardPayload(sanitizedPayload, allowedContextLower, preferences, groundingFragments);
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
    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const allowedLevels = new Set(["rest", "gentle", "light", "steady", "capable", "brave"]);
    const levelRaw = (clampString(req.body?.level, 24) || "gentle").toLowerCase();
    const level = allowedLevels.has(levelRaw) ? levelRaw : "gentle";

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const note = clampString(checkin.note, 200);

    const cacheKey = JSON.stringify({ kind: "board", level, moodWords, mood, energy, body, note });
    const cached = boardCache.get(cacheKey);
    if (cached) {
      res.json(cached);
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

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system =
      "You generate a calm, emotionally-safe list of micro-activities for a wellbeing app. " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Do NOT infer emotions or problems the user did not state. " +
      "The board MUST match the user's check-in (pace, energy, body, moodWords, and optional note). Avoid generic wellness lists. " +
      "Keep tasks small, doable, and non-punitive. " +
      "Task text should feel like Attune, not a blunt task list: add 3-8 words of micro-context at the start that ties to a REAL check-in signal, then the action. " +
      "Use patterns like: 'If your energy is low, …', 'With a gentle pace, …', 'If your body feels tight, …', or 'If you're feeling {moodWord}, …'. " +
      "Do NOT add micro-context that introduces new emotional assumptions (e.g., don't say 'If you're anxious' unless the user said anxious). " +
      "Keep task text concise and within maxTextChars. " +
      "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. " +
      "Avoid near-duplicate tasks. Prefer variety across categories. " +
      "Do NOT include week-level journaling/reflection (the app has a Weekly screen for that). Focus on today. " +
      "Every task 'why' should explicitly reference at least one check-in signal (pace/energy/body/moodWords/note) using plain language (e.g., 'Given your pace is capable...' or 'With manageable body...'). " +
      "Follow intensityMixHint as closely as possible: meet or exceed minMedium and minHigh, and do not exceed maxHigh. " +
      "Align minutes to intensity: low ~1-10, medium ~8-20, high ~15-45. " +
      "Rationales must be neutral and not presume loneliness/anxiety/etc unless the user explicitly said it.";

    const user = {
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
        // Use these as anchors to ensure each task explains how it fits the check-in.
        fragments: groundingFragments,
      },
      taskRequirements: {
        count: 15,
        style: "short, actionable, micro-context lead-in, matched to today's pace",
        maxTextChars: 120,
        avoidAssumptions: true,
        avoidNearDuplicates: true,
        microContext: {
          required: true,
          rule: "Start each task with a short conditional/context clause grounded in the check-in (pace/energy/body/moodWords/note), then the action. Do not introduce new assumptions.",
          examples: [
            "With low energy, do a 3-minute tidy of one surface.",
            "If your body feels tight, do a gentle neck stretch for 2 minutes.",
            "With a gentle pace, write down one small next step.",
          ],
        },
        variety: {
          minDistinctCategories: 4,
          maxPerCategory: 5,
        },
        categories: ["rest", "mind", "body", "home", "connection", "admin"],
        intensity: ["low", "medium", "high"],
        minutesRange: [1, 45],
        intensityMixHint: preferences,
      },
      outputSchema:
        "{\"tasks\":[{\"text\":string,\"minutes\":number,\"intensity\":\"low\"|\"medium\"|\"high\",\"category\":\"rest\"|\"mind\"|\"body\"|\"home\"|\"connection\"|\"admin\",\"why\":string}]}" ,
    };

    const generated = await generateBoardWithRetries(client, {
      system,
      userPayload: user,
      model: MODEL,
    });

    if (!generated.ok) {
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

    boardCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to generate board" });
  }
});

app.post("/api/daily-note", enforceAllowedOrigin, limitNote, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const level = clampString(req.body?.level, 24) || "gentle";
    const today = clampString(req.body?.today, 20) || "";

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const note = clampString(checkin.note, 200);

    const cacheKey = JSON.stringify({ kind: "note", level, today, moodWords, mood, energy, body, note });
    const cached = noteCache.get(cacheKey);
    if (cached) {
      res.json(cached);
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

    const user = {
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
      userPayload: user,
      model: MODEL,
    });

    if (!generated.ok) {
      res.status(502).json({ error: generated.error || "Invalid note" });
      return;
    }

    const payload = {
      note: generated.note,
      meta: { model: MODEL, createdAt: new Date().toISOString(), cached: false },
    };
    noteCache.set(cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to generate daily note" });
  }
});

app.listen(PORT, () => {
  console.log(`AI API listening on http://localhost:${PORT}`);
});
