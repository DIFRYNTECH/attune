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

function looksUnsafe(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return true;
  return forbiddenFragments.some((frag) => t.includes(frag));
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function validateBoardPayload(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };

  const tasks = payload.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: "Missing tasks[]" };
  if (tasks.length !== 15) return { ok: false, error: "tasks[] must have length 15" };

  const seen = new Set();
  for (const task of tasks) {
    const text = clampString(task?.text, 120);
    if (!text) return { ok: false, error: "Each task needs text" };
    if (looksUnsafe(text)) return { ok: false, error: "Unsafe task detected" };
    if (seen.has(text.toLowerCase())) return { ok: false, error: "Duplicate task detected" };
    seen.add(text.toLowerCase());

    const minutes = task?.minutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 1 || minutes > 45) {
      return { ok: false, error: "Each task needs minutes (1-45)" };
    }

    const intensity = task?.intensity;
    if (intensity !== "low" && intensity !== "medium" && intensity !== "high") {
      return { ok: false, error: "Each task needs intensity low|medium|high" };
    }

    const category = task?.category;
    const allowedCategories = ["rest", "mind", "body", "home", "connection", "admin"];
    if (!allowedCategories.includes(category)) {
      return { ok: false, error: "Each task needs a valid category" };
    }

    const why = clampString(task?.why, 160);
    if (!why) return { ok: false, error: "Each task needs why" };
    if (looksUnsafe(why)) return { ok: false, error: "Unsafe rationale detected" };
  }

  return { ok: true };
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
    const note = clampString(checkin.note, 100);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system =
      "You generate a calm, emotionally-safe list of micro-activities for a wellbeing app. " +
      "Return ONLY valid JSON. No markdown. No extra keys. " +
      "Do NOT suggest anything harmful, illegal, or risky. " +
      "Do NOT mention self-harm. " +
      "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
      "Keep tasks small, doable, and non-punitive. " +
      "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. ";

    const user = {
      checkin: {
        moodWords,
        mood,
        energy,
        body,
        pace: level,
        note,
      },
      taskRequirements: {
        count: 15,
        style: "short, gentle, actionable",
        maxTextChars: 120,
        categories: ["rest", "mind", "body", "home", "connection", "admin"],
        intensity: ["low", "medium", "high"],
        minutesRange: [1, 45],
      },
      outputSchema:
        "{\"tasks\":[{\"text\":string,\"minutes\":number,\"intensity\":\"low\"|\"medium\"|\"high\",\"category\":\"rest\"|\"mind\"|\"body\"|\"home\"|\"connection\"|\"admin\",\"why\":string}]}" ,
    };

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      res.status(502).json({ error: "Empty model response" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(502).json({ error: "Model did not return valid JSON" });
      return;
    }

    const validated = validateBoardPayload(parsed);
    if (!validated.ok) {
      res.status(502).json({ error: validated.error || "Invalid board" });
      return;
    }

    res.json({
      tasks: parsed.tasks,
      meta: { model: MODEL, createdAt: new Date().toISOString() },
    });
  } catch {
    res.status(500).json({ error: "Failed to generate board" });
  }
});

app.listen(PORT, () => {
  console.log(`AI API listening on http://localhost:${PORT}`);
});
