import "dotenv/config";

import express from "express";
import OpenAI from "openai";

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const app = express();
app.use(express.json({ limit: "64kb" }));

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

  if (!title || !body) return { ok: false, error: "Note must include title and body" };
  if (looksUnsafe(title) || looksUnsafe(body) || (focus && looksUnsafe(focus))) return { ok: false, error: "Unsafe note detected" };
  if (looksAssumptive(title, allowedContextLower) || looksAssumptive(body, allowedContextLower) || (focus && looksAssumptive(focus, allowedContextLower))) {
    return { ok: false, error: "Note makes assumptions not in user input" };
  }

  return { ok: true, note: { title, body, focus } };
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

    const validated = validateBoardPayload(parsed, allowedContextLower, preferences, groundingFragments);
    if (!validated.ok) {
      lastError = validated.error || "Invalid board";
      continue;
    }

    lastWarnings = Array.isArray(validated.warnings) ? validated.warnings : [];
    return { ok: true, tasks: parsed.tasks, warnings: lastWarnings };
  }

  return { ok: false, error: lastError || "Invalid board", warnings: lastWarnings };
}

app.post("/api/generate-board", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
      return;
    }

    const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
    const level = clampString(req.body?.level, 24) || "gentle";

    const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
    const mood = clampString(checkin.mood, 12) || "okay";
    const energy = clampString(checkin.energy, 12) || "okay";
    const body = clampString(checkin.body, 16) || "manageable";
    const note = clampString(checkin.note, 200);

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
      "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. " +
      "Avoid near-duplicate tasks. Prefer variety across categories. " +
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
        style: "short, actionable, matched to today's pace",
        maxTextChars: 120,
        avoidAssumptions: true,
        avoidNearDuplicates: true,
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

    res.json({
      tasks: generated.tasks,
      meta: {
        model: MODEL,
        createdAt: new Date().toISOString(),
        warnings: Array.isArray(generated.warnings) ? generated.warnings : [],
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to generate board" });
  }
});

app.post("/api/daily-note", async (req, res) => {
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

    const theme = pickDailyTheme(today || new Date().toISOString().slice(0, 10));

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system =
      "You write a very short, gentle daily note for a wellbeing app. " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Do NOT infer emotions or problems the user did not state. " +
      "Do NOT shame, scold, or pressure. Avoid absolute language (never/always). " +
      "Make it feel fresh daily, but still grounded in the check-in. " +
      "Keep it practical and kind; not inspirational fluff.";

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
      outputSchema: "{\"note\":{\"title\":string,\"body\":string,\"focus\":string}}",
      guidance:
        "Write 1 title + 1 body sentence (or 2 short sentences). Include a tiny focus phrase. Tie back to pace/energy/body/moodWords/note without copying the note verbatim.",
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

    res.json({
      note: generated.note,
      meta: { model: MODEL, createdAt: new Date().toISOString() },
    });
  } catch {
    res.status(500).json({ error: "Failed to generate daily note" });
  }
});

app.listen(PORT, () => {
  console.log(`AI API listening on http://localhost:${PORT}`);
});
