import {
  DAILY_NOTE_RESPONSE_FORMAT,
  UNTRUSTED_CONTEXT_INSTRUCTION,
  sanitizeUntrustedAiText,
} from "../lib/aiPromptSecurity.js";
import { clampString, looksAssumptive, looksUnsafe, stableHash } from "./aiText.js";

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

export function pickDailyTheme(today) {
  const idx = stableHash(today) % dailyThemes.length;
  return dailyThemes[idx];
}

export function validateDailyNotePayload(payload, allowedContextLower) {
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

export function buildDailyNoteRequest({ userId, checkin, level, today, useNoteForAi }) {
  const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
  const mood = clampString(checkin.mood, 12) || "okay";
  const energy = clampString(checkin.energy, 12) || "okay";
  const body = clampString(checkin.body, 16) || "manageable";
  const noteGuard = useNoteForAi
    ? sanitizeUntrustedAiText(checkin.note, { maxLength: 200 })
    : { text: "", omitted: false, flags: [] };
  const note = noteGuard.text;
  const theme = pickDailyTheme(today || new Date().toISOString().slice(0, 10));

  const cacheKey = JSON.stringify({
    kind: "note",
    userId,
    level,
    today,
    moodWords,
    mood,
    energy,
    body,
    note,
    noteOmitted: !!noteGuard.omitted,
  });

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

  return {
    cacheKey,
    noteGuard,
    system,
    userPayload,
    meta: {
      optionalNoteOmitted: !!noteGuard.omitted,
    },
  };
}

export async function generateDailyNoteWithRetries(client, { system, userPayload, model }) {
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
