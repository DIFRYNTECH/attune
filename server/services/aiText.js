import { validateGeneratedAiTextSafety } from "../lib/aiPromptSecurity.js";

export const forbiddenFragments = [
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

export const commonWords = new Set([
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

export const genericNoteTokens = new Set(["today", "feeling", "feel", "super", "really", "lets", "let"]);

export const avoidAssumptionsUnlessUserSaid = [
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

export function stableHash(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function looksUnsafe(text) {
  return !validateGeneratedAiTextSafety(text, { unsafeFragments: forbiddenFragments }).ok;
}

export function normalizeForSimilarity(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/['']/g, "")
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

export function overlapRatio(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  let hit = 0;
  for (const t of bTokens) if (a.has(t)) hit++;
  return hit / Math.max(1, Math.min(aTokens.length, bTokens.length));
}

export function looksAssumptive(text, allowedContextLower) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  for (const frag of avoidAssumptionsUnlessUserSaid) {
    if (t.includes(frag) && !allowedContextLower.includes(frag)) return true;
  }
  return false;
}

export function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function clampInt(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}
