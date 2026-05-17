import { validateGeneratedAiTextSafety } from "./aiPromptSecurity.js";

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
]);

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

const sillyFragments = [
  "cosmic",
  "vibes",
  "manifest",
  "boss mode",
  "beast mode",
  "crush your",
  "hack your",
  "level up your life",
];

const unrealisticFragments = [
  "entire home",
  "whole home",
  "whole house",
  "every unread message",
  "all unread messages",
  "biggest goal",
  "fix your life",
  "change your life",
];

const actionVerbs = [
  "sit",
  "hold",
  "listen",
  "look",
  "open",
  "put",
  "watch",
  "send",
  "light",
  "wash",
  "smell",
  "pick",
  "stretch",
  "make",
  "water",
  "write",
  "fold",
  "step",
  "drop",
  "relax",
  "organize",
  "tidy",
  "reply",
  "start",
  "turn",
  "clear",
  "sort",
  "read",
  "set",
  "choose",
  "plan",
  "prepare",
  "call",
  "share",
  "cook",
  "wrap",
  "breathe",
  "unclench",
  "lengthen",
  "reset",
  "practice",
  "draft",
];

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return [
    ...new Set(
      normalized
        .split(" ")
        .filter((word) => word.length >= 3)
        .filter((word) => !commonWords.has(word)),
    ),
  ];
}

function overlapRatio(left, right) {
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  let hits = 0;
  for (const token of right) if (leftSet.has(token)) hits += 1;
  return hits / Math.max(1, Math.min(left.length, right.length));
}

function hasAny(text, fragments) {
  const t = String(text || "").toLowerCase();
  return fragments.some((fragment) => t.includes(fragment));
}

function normalizeHistoryList(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => clampString(typeof item === "string" ? item : item?.text, 140))
    .filter(Boolean);
}

function makeHistorySet(value) {
  return new Set(normalizeHistoryList(value).map(normalizeText));
}

function categoryForTask(text) {
  const t = normalizeText(text);
  if (/\b(shoulder|jaw|neck|breath|breathe|stretch|body|chest|face|wash|walk|movement)\b/.test(t)) return "body";
  if (/\b(space|surface|desk|counter|room|light|candle|window|plant|tidy|clear|organize)\b/.test(t)) return "environment";
  if (/\b(write|sentence|list|plan|priority|starting point|future)\b/.test(t)) return "practical";
  if (/\b(message|call|voice note|someone|supportive|kind)\b/.test(t)) return "connection";
  if (/\b(song|music|photo|warm drink|blanket|snack|hobby|podcast|nature)\b/.test(t)) return "comfort";
  return "regulation";
}

function checkinText(checkin) {
  const c = checkin && typeof checkin === "object" ? checkin : {};
  return [
    ...(Array.isArray(c.moodWords) ? c.moodWords : []),
    c.mood,
    c.energy,
    c.body,
    c.pace,
    c.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countSpecificitySignals(text) {
  const t = normalizeText(text);
  let count = 0;
  if (/\b\d+\b/.test(t)) count += 1;
  if (/\bminute|minutes|breath|breaths|sentence|sentences|song|photo|photos|page|pages\b/.test(t)) count += 1;
  if (/\bshoulder|jaw|neck|chest|warm|fresh|window|blanket|drink|light|surface|desk|plant\b/.test(t)) count += 1;
  return count;
}

export function evaluateTaskQuality(textOrTask, ctx = {}) {
  const text = clampString(typeof textOrTask === "string" ? textOrTask : textOrTask?.text, 120);
  const normalized = normalizeText(text);
  const reasons = [];

  if (!text) reasons.push("empty");
  if (text.length > 120) reasons.push("too_long");
  if (looksWeeklyReflectionTask(text)) reasons.push("weekly_reflection");
  const safety = validateGeneratedAiTextSafety(text, { unsafeFragments });
  if (safety.flags.includes("unsafe_fragment")) reasons.push("unsafe");
  if (safety.flags.includes("prompt_injection")) reasons.push("prompt_injection");
  if (safety.flags.includes("model_language")) reasons.push("model_language");
  if (hasAny(text, sillyFragments)) reasons.push("silly");
  if (hasAny(text, unrealisticFragments)) reasons.push("too_large");
  if (/\b(60|75|90|120)\s*(minute|minutes|min)\b/.test(normalized)) reasons.push("too_long_duration");

  const firstWord = normalized.split(" ")[0] || "";
  const hasActionVerb = actionVerbs.includes(firstWord) || actionVerbs.some((verb) => normalized.startsWith(`${verb} `));
  if (!hasActionVerb && normalized.split(" ").length > 3) reasons.push("not_actionable");

  const rejected = reasons.length > 0;
  let score = 50;

  const specificity = countSpecificitySignals(text);
  score += specificity * 7;
  if (hasActionVerb) score += 8;
  if (text.length >= 28 && text.length <= 86) score += 5;
  if (/\b(entire|every|all|perfect|must|should)\b/.test(normalized)) score -= 14;

  const cText = checkinText(ctx.checkin);
  if (cText.includes("tired") || cText.includes("low") || cText.includes("verylow") || cText.includes("tender")) {
    if (/\b(gently|slow|quiet|warm|small|sit|breath|soft|rest|shoulder|shoulders|jaw|unclench)\b/.test(normalized)) score += 10;
    if (/\b(walk|workout|run|clean|every|biggest)\b/.test(normalized)) score -= 16;
  }

  const history = ctx.boardHistory && typeof ctx.boardHistory === "object" ? ctx.boardHistory : {};
  const recentShown = makeHistorySet(history.recentShown);
  const recentPicked = makeHistorySet(history.recentPicked);
  const recentCompleted = makeHistorySet(history.recentCompleted);
  const recentRemoved = makeHistorySet(history.recentRemoved);

  if (recentShown.has(normalized)) score -= 28;
  if (recentPicked.has(normalized)) score -= 18;
  if (recentCompleted.has(normalized)) score -= 8;
  if (recentRemoved.has(normalized)) score -= 36;

  return {
    text,
    score: rejected ? -999 : score,
    rejected,
    reasons,
    category: categoryForTask(text),
    tokens: tokenize(text),
  };
}

function looksWeeklyReflectionTask(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (t.includes("week") && (t.includes("reflect") || t.includes("journal") || t.includes("review"))) return true;
  return false;
}

function sourceText(item) {
  return clampString(typeof item === "string" ? item : item?.text, 120);
}

export function selectQualityBoard({ candidates, fallbackTasks, checkin, boardHistory, targetCount = 15 } = {}) {
  const target = Math.max(1, Math.floor(Number(targetCount) || 15));
  const inputs = [
    ...(Array.isArray(candidates) ? candidates.map((item) => ({ item, source: "ai" })) : []),
    ...(Array.isArray(fallbackTasks) ? fallbackTasks.map((item) => ({ item, source: "fallback" })) : []),
  ];

  const seen = new Set();
  const evaluated = [];
  let rejectedCount = 0;

  for (let i = 0; i < inputs.length; i += 1) {
    const { item, source } = inputs[i];
    const text = sourceText(item);
    const key = normalizeText(text);
    if (!key || seen.has(key)) {
      if (source === "ai") rejectedCount += 1;
      continue;
    }
    seen.add(key);

    const quality = evaluateTaskQuality(text, { checkin, boardHistory });
    if (quality.rejected) {
      if (source === "ai") rejectedCount += 1;
      continue;
    }

    evaluated.push({
      source,
      index: i,
      text,
      level: typeof item?.level === "string" ? item.level : undefined,
      quality,
    });
  }

  evaluated.sort((a, b) => {
    if (b.quality.score !== a.quality.score) return b.quality.score - a.quality.score;
    if (a.source !== b.source) return a.source === "ai" ? -1 : 1;
    return a.index - b.index;
  });

  const selected = [];
  const selectedTokens = [];
  const categoryCounts = new Map();
  let fallbackCount = 0;

  for (const entry of evaluated) {
    if (selected.length >= target) break;
    if (selectedTokens.some((tokens) => overlapRatio(tokens, entry.quality.tokens) >= 0.72)) continue;

    const categoryCount = categoryCounts.get(entry.quality.category) || 0;
    if (categoryCount >= 5 && selected.length < target - 2) continue;

    selected.push({ text: entry.text, ...(entry.level ? { level: entry.level } : {}) });
    selectedTokens.push(entry.quality.tokens);
    categoryCounts.set(entry.quality.category, categoryCount + 1);
    if (entry.source === "fallback") fallbackCount += 1;
  }

  return {
    tasks: selected,
    meta: {
      rejectedCount,
      fallbackCount,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      selectedCount: selected.length,
      categoryMix: Object.fromEntries(categoryCounts),
    },
  };
}
