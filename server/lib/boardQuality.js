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
  "do",
  "try",
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
  "pause",
  "close",
  "rest",
  "sip",
  "place",
  "lean",
  "notice",
  "let",
  "move",
  "create",
  "finish",
  "review",
  "ask",
  "clean",
  "walk",
  "take",
  "spend",
  "pack",
  "rinse",
  "wipe",
  "play",
  "name",
  "soften",
  "update",
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
  const t = normalizeText(text);
  return fragments.some((fragment) => {
    const clean = normalizeText(fragment);
    if (!clean) return false;
    const pattern = new RegExp(`(^|\\s)${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
    return pattern.test(t);
  });
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeKey(value) {
  return normalizeText(clampString(value, 80));
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "support" || mode === "stretch") return mode;
  if (mode === "steady") return "support";
  if (mode === "challenge") return "stretch";
  return "";
}

function normalizeDomain(value, text) {
  const domain = String(value || "").trim().toLowerCase();
  if (["body", "environment", "practical", "connection", "comfort", "regulation"].includes(domain)) return domain;
  return categoryForTask(text);
}

function inferEffortFromText(text) {
  const t = normalizeText(text);
  const minutes = Number(t.match(/\b(\d+)\s*(minute|minutes|min)\b/)?.[1]);
  let effort = 2;
  if (Number.isFinite(minutes) && minutes > 0) {
    if (minutes <= 3) effort = 1;
    else if (minutes <= 8) effort = 2;
    else if (minutes <= 15) effort = 3;
    else if (minutes <= 25) effort = 4;
    else effort = 5;
  }
  if (/\b(focused|hard|uncomfortable|brave|goal|call|reply|draft|practice|run)\b/.test(t)) effort += 1;
  if (/\b(sit|quiet|breath|warm|soft|gentle|smallest|easiest|rest)\b/.test(t)) effort -= 1;
  return clampNumber(effort, 1, 5, 2);
}

function normalizeCandidateMetadata(item, text, quality) {
  const effort = clampNumber(item?.effort, 1, 5, inferEffortFromText(text));
  const friction = clampNumber(item?.friction, 1, 5, effort);
  const mode = normalizeMode(item?.mode || item?.boardStyle || item?.style) || (effort >= 3 ? "stretch" : "support");
  const domain = normalizeDomain(item?.domain, text);
  const pace = clampString(item?.pace || item?.level, 24);
  const canonicalKey = clampString(item?.canonicalKey || item?.canonical_key, 80);
  const repetitionFamily = clampString(item?.repetitionFamily || item?.repetition_family || item?.family, 80);

  return {
    mode,
    domain,
    effort,
    friction,
    ...(pace ? { pace } : {}),
    ...(canonicalKey ? { canonicalKey } : {}),
    ...(repetitionFamily ? { repetitionFamily } : {}),
    familyKey: normalizeKey(repetitionFamily || canonicalKey || quality?.category || text),
    canonicalKeyNormalized: normalizeKey(canonicalKey),
  };
}

function makeHistoryIndex(value) {
  const list = Array.isArray(value) ? value : [];
  const text = new Set();
  const canonical = new Set();
  const family = new Set();

  for (const item of list) {
    const rawText = typeof item === "string" ? item : item?.text;
    const cleanText = clampString(rawText, 140);
    if (cleanText) text.add(normalizeText(cleanText));

    if (item && typeof item === "object") {
      const canonicalKey = normalizeKey(item.canonicalKey || item.canonical_key);
      const repetitionFamily = normalizeKey(item.repetitionFamily || item.repetition_family || item.family);
      if (canonicalKey) canonical.add(canonicalKey);
      if (repetitionFamily) family.add(repetitionFamily);
    }
  }

  return { text, canonical, family };
}

function historyMatches(index, text, metadata) {
  const normalized = normalizeText(text);
  return {
    exact: index.text.has(normalized),
    canonical: !!metadata?.canonicalKeyNormalized && index.canonical.has(metadata.canonicalKeyNormalized),
    family: !!metadata?.familyKey && index.family.has(metadata.familyKey),
  };
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
  const metadata = normalizeCandidateMetadata(
    textOrTask && typeof textOrTask === "object" ? textOrTask : {},
    text,
    { category: categoryForTask(text) },
  );
  const recentShown = makeHistoryIndex(history.recentShown);
  const recentPicked = makeHistoryIndex(history.recentPicked);
  const recentCompleted = makeHistoryIndex(history.recentCompleted);
  const recentRemoved = makeHistoryIndex(history.recentRemoved);

  const shownMatch = historyMatches(recentShown, text, metadata);
  const pickedMatch = historyMatches(recentPicked, text, metadata);
  const completedMatch = historyMatches(recentCompleted, text, metadata);
  const removedMatch = historyMatches(recentRemoved, text, metadata);

  if (shownMatch.exact) score -= 28;
  else if (shownMatch.canonical || shownMatch.family) score -= 18;

  if (pickedMatch.exact) score -= 22;
  else if (pickedMatch.canonical || pickedMatch.family) score -= 14;

  if (completedMatch.exact) score -= 8;
  else if (completedMatch.canonical || completedMatch.family) score += 5;

  if (removedMatch.exact) score -= 44;
  else if (removedMatch.canonical || removedMatch.family) score -= 40;

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

function effortCapForCheckin(checkin) {
  const c = checkin && typeof checkin === "object" ? checkin : {};
  const pace = String(c.pace || c.level || "").toLowerCase();
  const energy = String(c.energy || "").toLowerCase();
  const body = String(c.body || "").toLowerCase();
  const state = `${pace} ${energy} ${body} ${(Array.isArray(c.moodWords) ? c.moodWords : []).join(" ")}`.toLowerCase();

  if (pace === "rest" || energy === "verylow" || body === "tender" || /\bworn|exhausted|overwhelmed\b/.test(state)) return 2;
  if (pace === "gentle" || energy === "low" || /\btired|irritable|restless\b/.test(state)) return 3;
  if (pace === "capable" || pace === "brave" || energy === "high") return 4;
  return 3;
}

function desiredModeMix(target, checkin) {
  const c = checkin && typeof checkin === "object" ? checkin : {};
  const style = String(c.boardStyle || c.style || "").toLowerCase();
  const energy = String(c.energy || "").toLowerCase();
  const body = String(c.body || "").toLowerCase();
  const pace = String(c.pace || c.level || "").toLowerCase();

  let stretch = style === "challenge" ? Math.round(target * 0.45) : Math.round(target * 0.25);
  if (pace === "rest" || energy === "verylow" || body === "tender") {
    stretch = style === "challenge"
      ? Math.max(2, Math.round(target * 0.33))
      : Math.min(stretch, Math.max(1, Math.floor(target * 0.25)));
  }
  stretch = clampNumber(stretch, target >= 4 ? 1 : 0, Math.max(0, target - 1), style === "challenge" ? 2 : 1);
  return { support: target - stretch, stretch };
}

function selectedTaskForEntry(entry) {
  const out = { text: entry.text };
  for (const key of ["level", "mode", "domain", "effort", "friction", "pace", "canonicalKey", "repetitionFamily"]) {
    if (entry[key] !== undefined && entry[key] !== "") out[key] = entry[key];
  }
  return out;
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

    const quality = evaluateTaskQuality(item, { checkin, boardHistory });
    if (quality.rejected) {
      if (source === "ai") rejectedCount += 1;
      continue;
    }
    const metadata = normalizeCandidateMetadata(item, text, quality);
    const effortCap = effortCapForCheckin(checkin);
    const overCap = Math.max(0, metadata.effort - effortCap) + Math.max(0, metadata.friction - (effortCap + 1));
    const supportBias = metadata.mode === "support" && effortCap <= 3 ? 4 : 0;
    const stretchBias = metadata.mode === "stretch" && String(checkin?.boardStyle || "").toLowerCase() === "challenge" ? 4 : 0;

    evaluated.push({
      source,
      index: i,
      text,
      level: typeof item?.level === "string" ? item.level : undefined,
      mode: metadata.mode,
      domain: metadata.domain,
      effort: metadata.effort,
      friction: metadata.friction,
      pace: metadata.pace,
      canonicalKey: metadata.canonicalKey,
      repetitionFamily: metadata.repetitionFamily,
      familyKey: metadata.familyKey,
      quality,
      score: quality.score + supportBias + stretchBias - (overCap * 32),
    });
  }

  evaluated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.source !== b.source) return a.source === "ai" ? -1 : 1;
    return a.index - b.index;
  });

  const selected = [];
  const selectedTokens = [];
  const selectedFamilies = new Set();
  const categoryCounts = new Map();
  const domainCounts = new Map();
  const modeCounts = new Map();
  let fallbackCount = 0;
  const availableDomains = new Set(evaluated.map((entry) => entry.domain).filter(Boolean));
  const minDomains = Math.min(target, 4, availableDomains.size);
  const maxPerDomain = Math.max(1, Math.min(5, Math.ceil(target * 0.5)));
  const desiredModes = desiredModeMix(target, checkin);

  function canSelect(entry, { enforceDomainCap = true, enforceModeCap = true } = {}) {
    if (selected.length >= target) return false;
    if (selectedFamilies.has(entry.familyKey)) return false;
    if (selectedTokens.some((tokens) => overlapRatio(tokens, entry.quality.tokens) >= 0.72)) return false;
    const domainCount = domainCounts.get(entry.domain) || 0;
    if (enforceDomainCap && domainCount >= maxPerDomain) return false;
    if (enforceModeCap && entry.mode === "stretch" && (modeCounts.get("stretch") || 0) >= desiredModes.stretch) {
      const hasSupport = evaluated.some((candidate) => !selectedFamilies.has(candidate.familyKey) && candidate.mode === "support");
      if (hasSupport) return false;
    }
    return true;
  }

  function addEntry(entry) {
    selected.push(selectedTaskForEntry(entry));
    selectedTokens.push(entry.quality.tokens);
    selectedFamilies.add(entry.familyKey);
    categoryCounts.set(entry.quality.category, (categoryCounts.get(entry.quality.category) || 0) + 1);
    domainCounts.set(entry.domain, (domainCounts.get(entry.domain) || 0) + 1);
    modeCounts.set(entry.mode, (modeCounts.get(entry.mode) || 0) + 1);
    if (entry.source === "fallback") fallbackCount += 1;
  }

  if (String(checkin?.boardStyle || checkin?.style || "").toLowerCase() === "challenge") {
    for (const entry of evaluated) {
      if ((modeCounts.get("stretch") || 0) >= desiredModes.stretch) break;
      if (entry.mode !== "stretch") continue;
      if (!canSelect(entry)) continue;
      addEntry(entry);
    }
  }

  for (const domain of availableDomains) {
    if (selected.length >= minDomains) break;
    const entry = evaluated.find((candidate) => candidate.domain === domain && canSelect(candidate));
    if (entry) addEntry(entry);
  }

  for (const entry of evaluated) {
    if (selected.length >= target) break;
    if (!canSelect(entry)) continue;
    addEntry(entry);
  }

  for (const entry of evaluated) {
    if (selected.length >= target) break;
    if (!canSelect(entry, { enforceDomainCap: false, enforceModeCap: false })) continue;
    addEntry(entry);
  }

  return {
    tasks: selected,
    meta: {
      rejectedCount,
      fallbackCount,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      selectedCount: selected.length,
      categoryMix: Object.fromEntries(categoryCounts),
      domainMix: Object.fromEntries(domainCounts),
      modeMix: Object.fromEntries(modeCounts),
    },
  };
}
