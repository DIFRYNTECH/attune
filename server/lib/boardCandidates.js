import {
  sanitizeUntrustedAiText,
  validateGeneratedAiTextSafety,
} from "./aiPromptSecurity.js";

const domains = ["body", "environment", "practical", "connection", "comfort", "regulation"];
const paces = ["rest", "gentle", "light", "steady", "capable", "brave"];
const modes = ["support", "stretch"];

const unsafeFragments = [
  "suicide",
  "self-harm",
  "self harm",
  "kill yourself",
  "kill myself",
  "cut yourself",
  "cut myself",
  "overdose",
  "harm yourself",
  "weapon",
  "medication",
  "medicine",
  "pill",
  "dosage",
  "dose",
  "prescription",
  "diagnose",
  "diagnosis",
  "treatment plan",
  "extreme workout",
  "intense workout",
];

export const BOARD_CANDIDATE_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "attune_board_task_candidates",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tasks: {
          type: "array",
          minItems: 40,
          maxItems: 60,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string", minLength: 1, maxLength: 120 },
              mode: { type: "string", enum: modes },
              domain: { type: "string", enum: domains },
              effort: { type: "integer", minimum: 1, maximum: 5 },
              friction: { type: "integer", minimum: 1, maximum: 5 },
              pace: { type: "string", enum: paces },
              canonicalKey: { type: "string", minLength: 1, maxLength: 80 },
              repetitionFamily: { type: "string", minLength: 1, maxLength: 80 },
            },
            required: [
              "text",
              "mode",
              "domain",
              "effort",
              "friction",
              "pace",
              "canonicalKey",
              "repetitionFamily",
            ],
          },
        },
      },
      required: ["tasks"],
    },
  },
};

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeEnum(value, allowed, fallback = "") {
  const clean = String(value || "").trim().toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

function looksWeeklyReflectionTask(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  if (t.includes("week") && (t.includes("reflect") || t.includes("journal") || t.includes("review"))) return true;
  return false;
}

function sanitizeMetadataKey(value) {
  return clampString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sanitizeGeneratedTaskCandidates(tasks, { targetCount = 60 } = {}) {
  const out = [];
  const seen = new Set();
  const limit = Math.max(1, Math.min(60, Math.floor(Number(targetCount) || 60)));

  for (const item of Array.isArray(tasks) ? tasks : []) {
    const textGuard = sanitizeUntrustedAiText(typeof item === "string" ? item : item?.text, { maxLength: 120 });
    const text = textGuard.text;
    if (!text || textGuard.omitted || looksWeeklyReflectionTask(text)) continue;

    const safety = validateGeneratedAiTextSafety(text, { unsafeFragments });
    if (!safety.ok) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const mode = normalizeEnum(item?.mode || item?.boardStyle || item?.style, modes);
    const domain = normalizeEnum(item?.domain, domains);
    const effort = clampInt(item?.effort, 1, 5, 2);
    const friction = clampInt(item?.friction, 1, 5, effort);
    const pace = normalizeEnum(item?.pace || item?.level, paces, "gentle");
    const canonicalKey = sanitizeMetadataKey(item?.canonicalKey || item?.canonical_key || text);
    const repetitionFamily = sanitizeMetadataKey(item?.repetitionFamily || item?.repetition_family || item?.family || canonicalKey);

    out.push({
      text,
      mode: mode || (effort >= 3 ? "stretch" : "support"),
      domain: domain || "regulation",
      effort,
      friction,
      pace,
      canonicalKey: canonicalKey || sanitizeMetadataKey(text),
      repetitionFamily: repetitionFamily || canonicalKey || sanitizeMetadataKey(text),
    });

    if (out.length >= limit) break;
  }

  return out;
}

export function sanitizeBoardHistoryForQuality(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const cleanList = (list, limit) =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        const textGuard = sanitizeUntrustedAiText(typeof item === "string" ? item : item?.text, { maxLength: 120 });
        const text = textGuard.text;
        if (!text || textGuard.omitted) return null;

        const out = { text };
        if (item && typeof item === "object") {
          const canonicalKey = sanitizeMetadataKey(item.canonicalKey || item.canonical_key);
          const repetitionFamily = sanitizeMetadataKey(item.repetitionFamily || item.repetition_family || item.family);
          if (canonicalKey) out.canonicalKey = canonicalKey;
          if (repetitionFamily) out.repetitionFamily = repetitionFamily;
        }
        return out;
      })
      .filter(Boolean)
      .slice(0, limit);

  return {
    recentShown: cleanList(input.recentShown, 45),
    recentPicked: cleanList(input.recentPicked, 30),
    recentCompleted: cleanList(input.recentCompleted, 30),
    recentRemoved: cleanList(input.recentRemoved, 30),
  };
}
