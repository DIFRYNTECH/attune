#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { evaluateTaskQuality } from "../server/lib/boardQuality.js";

const SCORE_WEIGHTS = {
  safety: 20,
  specificity: 15,
  fit: 15,
  separation: 15,
  freshness: 15,
  voice: 10,
  coherence: 10,
};

const TARGETS = {
  launchScore: 85,
  premiumScore: 90,
  specificity: 4.3,
  fit: 4.2,
  voice: 4.4,
  coherence: 4.2,
  personalization: 4.0,
  novelty: 4.0,
  minDomains: 5,
  maxDomainShare: 0.35,
  minTasksPerBoard: 15,
  minPickableTasks: 3,
  supportStretchDetection: 0.8,
};

const COMMON_WORDS = new Set([
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

const SUPPORT_TERMS = [
  "soft",
  "slow",
  "quiet",
  "warm",
  "comfort",
  "rest",
  "pause",
  "breath",
  "breathe",
  "blanket",
  "light",
  "sit",
  "settle",
  "unclench",
  "jaw",
  "shoulder",
  "gentle",
  "easiest",
  "smallest",
  "kind",
  "safe",
  "drink",
  "snack",
  "window",
  "music",
];

const STRETCH_TERMS = [
  "start",
  "draft",
  "reply",
  "send",
  "plan",
  "choose",
  "next",
  "goal",
  "forward",
  "focused",
  "focus",
  "practice",
  "skill",
  "rough",
  "version",
  "boundary",
  "ask",
  "setup",
  "tomorrow",
  "visible",
  "progress",
  "avoiding",
];

const SHAME_OR_HUSTLE_TERMS = [
  "crush",
  "grind",
  "dominate",
  "no excuses",
  "push through",
  "fix your life",
  "level up",
  "boss mode",
  "beast mode",
  "win the day",
  "maximize",
  "optimize",
  "must",
  "should",
  "failed",
  "failure",
  "lazy",
];

const CLINICAL_OR_RISK_TERMS = [
  "diagnose",
  "diagnosis",
  "treatment",
  "therapy plan",
  "exposure therapy",
  "medication",
  "dosage",
  "prescription",
  "supplement",
  "cure",
  "heal your trauma",
  "trauma processing",
  "suicide",
  "self harm",
  "self-harm",
  "overdose",
];

const DOMAIN_RULES = [
  ["body", /\b(shoulder|jaw|neck|breath|breathe|stretch|body|face|wash|walk|movement|mobility|hands|chest|eyes)\b/],
  ["environment", /\b(space|surface|desk|counter|room|light|window|plant|tidy|clear|organize|chair|drawer|pile|scent)\b/],
  ["practical", /\b(list|plan|setup|prepare|sort|fold|reply|task|chore|charger|clothes|meal|snack|water|admin)\b/],
  ["connection", /\b(message|call|voice note|someone|supportive|friend|ask|share|text)\b/],
  ["comfort", /\b(song|music|photo|warm drink|blanket|hobby|podcast|nature|comfort|quiet|softer|socks)\b/],
  ["reflection", /\b(write|sentence|note|notice|name|journal|wins|proud|helped|feels)\b/],
  ["meaning", /\b(goal|values|boundary|future|tomorrow|important|meaningful|care about)\b/],
  ["progress", /\b(start|draft|focused|focus|practice|skill|forward|visible|avoiding|rough version)\b/],
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return [
    ...new Set(
      normalizeText(value)
        .split(" ")
        .filter((word) => word.length >= 3)
        .filter((word) => !COMMON_WORDS.has(word)),
    ),
  ];
}

function overlapRatio(left, right) {
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  let hits = 0;
  for (const token of right) {
    if (leftSet.has(token)) hits += 1;
  }
  return hits / Math.max(1, Math.min(left.length, right.length));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function words(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}

function includesAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => {
    const clean = normalizeText(term);
    if (!clean) return false;
    const pattern = new RegExp(`(^|\\s)${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
    return pattern.test(normalized);
  });
}

function taskText(task) {
  return typeof task === "string" ? task : String(task?.text || "");
}

function normalizeMode(value) {
  const mode = String(value || "").toLowerCase();
  if (mode === "support" || mode === "stretch") return mode;
  if (mode === "steady") return "support";
  if (mode === "challenge") return "stretch";
  return "";
}

function inferDomain(task) {
  if (typeof task?.domain === "string" && task.domain.trim()) return task.domain.trim().toLowerCase();
  const text = taskText(task);
  for (const [domain, pattern] of DOMAIN_RULES) {
    if (pattern.test(normalizeText(text))) return domain;
  }
  return "regulation";
}

function inferEffort(task) {
  if (Number.isFinite(Number(task?.effort))) return clamp(Number(task.effort), 1, 5);
  const text = normalizeText(taskText(task));
  let effort = 2;
  const duration = text.match(/\b(\d+)\s*(minute|minutes|min)\b/);
  if (duration) {
    const minutes = Number(duration[1]);
    if (minutes <= 3) effort = 1;
    else if (minutes <= 8) effort = 2;
    else if (minutes <= 15) effort = 3;
    else if (minutes <= 25) effort = 4;
    else effort = 5;
  }
  if (/\b(focused|hard|avoiding|uncomfortable|brave|goal|call|reply|draft|practice)\b/.test(text)) effort += 1;
  if (/\b(sit|quiet|breath|warm|soft|gentle|smallest|easiest|rest)\b/.test(text)) effort -= 1;
  return clamp(effort, 1, 5);
}

function inferMode(task) {
  const explicit = normalizeMode(task?.mode || task?.boardStyle || task?.style);
  if (explicit) return explicit;
  const text = normalizeText(taskText(task));
  const supportScore = SUPPORT_TERMS.filter((term) => text.includes(normalizeText(term))).length;
  const stretchScore = STRETCH_TERMS.filter((term) => text.includes(normalizeText(term))).length;
  const effort = inferEffort(task);
  if (stretchScore > supportScore) return "stretch";
  if (supportScore > stretchScore) return "support";
  return effort >= 3 ? "stretch" : "support";
}

function inferPaceCap(checkin) {
  const pace = String(checkin?.pace || checkin?.level || "").toLowerCase();
  const energy = String(checkin?.energy || "").toLowerCase();
  const body = String(checkin?.body || "").toLowerCase();
  const moodWords = Array.isArray(checkin?.moodWords) ? checkin.moodWords.join(" ").toLowerCase() : "";
  const mood = String(checkin?.mood || "").toLowerCase();
  const state = `${pace} ${energy} ${body} ${moodWords} ${mood}`;

  if (pace === "rest" || energy === "verylow" || body === "tender" || /worn|tired|overwhelmed/.test(state)) return 2;
  if (pace === "gentle" || energy === "low" || /irritable|restless/.test(state)) return 3;
  if (pace === "capable" || pace === "brave" || energy === "high" || /motivated|hopeful/.test(state)) return 4;
  return 3;
}

function specificityScore(task) {
  const text = taskText(task);
  const normalized = normalizeText(text);
  const textWords = words(text);
  let score = 2;

  if (/^\b(sit|hold|listen|look|open|put|send|wash|pick|stretch|make|write|fold|step|drop|relax|organize|tidy|reply|start|turn|clear|sort|read|set|choose|plan|prepare|call|share|breathe|unclench|draft|pause|close|rest|sip|place|lean|notice|let|move|create|finish|review|ask|clean|walk|take|spend|pack|rinse|wipe|play|name|soften|update)\b/.test(normalized)) score += 1;
  if (/\b\d+\b/.test(normalized)) score += 0.8;
  if (/\bminute|minutes|breath|breaths|sentence|surface|message|page|song|item|items|one\b/.test(normalized)) score += 0.8;
  if (/\b(then stop|then pause|small|tiny|one|single|rough|first)\b/.test(normalized)) score += 0.5;
  if (textWords.length >= 5 && textWords.length <= 16) score += 0.5;
  if (/\b(productive|self care|wellness|mindful|better|improve|reset your life)\b/.test(normalized)) score -= 0.8;
  if (/\b(entire|whole|all|every|perfect)\b/.test(normalized)) score -= 1.2;

  return clamp(score, 1, 5);
}

function fitScore(task, checkin) {
  const effort = inferEffort(task);
  const cap = inferPaceCap(checkin);
  const text = normalizeText(taskText(task));
  let score = 5 - Math.max(0, effort - cap) * 1.1;

  const lowCapacity = cap <= 2;
  if (lowCapacity && /\b(gentle|slow|quiet|warm|small|sit|breath|soft|rest|unclench|jaw)\b/.test(text)) score += 0.6;
  if (lowCapacity && /\b(focused|hard|brave|workout|30 minute|goal|uncomfortable)\b/.test(text)) score -= 1.2;
  if (cap >= 4 && /\b(start|draft|goal|forward|practice|focused|tomorrow|setup)\b/.test(text)) score += 0.4;
  if (includesAny(text, SHAME_OR_HUSTLE_TERMS)) score -= 2;

  return clamp(score, 1, 5);
}

function voiceScore(task) {
  const text = taskText(task);
  const normalized = normalizeText(text);
  let score = 4;

  if (specificityScore(task) >= 4) score += 0.5;
  if (/\b(then stop|then pause|if safe|if it feels okay|optional|small|tiny|easiest|rough)\b/.test(normalized)) score += 0.5;
  if (includesAny(text, SHAME_OR_HUSTLE_TERMS)) score -= 2.2;
  if (includesAny(text, CLINICAL_OR_RISK_TERMS)) score -= 2.5;
  if (/\b(cosmic|vibes|beautiful soul|inner rhythm|activate|alignment)\b/.test(normalized)) score -= 1.4;
  if (/\b(should|must|need to)\b/.test(normalized)) score -= 0.9;

  return clamp(score, 1, 5);
}

function personalizationScore(task, checkin) {
  const text = normalizeText(taskText(task));
  const cap = inferPaceCap(checkin);
  let score = 3.2;

  if (cap <= 2 && /\b(rest|quiet|slow|warm|breath|soft|small|tiny|gentle|sit)\b/.test(text)) score += 0.9;
  if (cap >= 4 && /\b(start|focused|goal|practice|draft|tomorrow|forward|setup)\b/.test(text)) score += 0.8;
  if (String(checkin?.body || "").toLowerCase() === "tender" && /\b(gentle|body|jaw|shoulder|warm|rest|sit)\b/.test(text)) score += 0.5;
  if (String(checkin?.body || "").toLowerCase() === "great" && /\b(walk|movement|focused|practice|start)\b/.test(text)) score += 0.4;
  if (String(checkin?.energy || "").toLowerCase() === "verylow" && inferEffort(task) >= 4) score -= 1.2;

  return clamp(score, 1, 5);
}

function taskFamily(task) {
  const text = normalizeText(taskText(task));
  for (const [domain, pattern] of DOMAIN_RULES) {
    if (pattern.test(text)) {
      const tokens = tokenize(text).slice(0, 4).join("_");
      return `${domain}:${tokens}`;
    }
  }
  return tokenize(text).slice(0, 4).join("_") || text.slice(0, 20);
}

function taskRow(task, checkin, boardHistory) {
  const text = taskText(task);
  const quality = evaluateTaskQuality(text, { checkin, boardHistory });
  const safetyFailures = [
    ...quality.reasons,
    ...(includesAny(text, CLINICAL_OR_RISK_TERMS) ? ["clinical_or_risk_language"] : []),
    ...(includesAny(text, SHAME_OR_HUSTLE_TERMS) ? ["shame_or_hustle_language"] : []),
  ];

  return {
    text,
    mode: inferMode(task),
    explicitMode: normalizeMode(task?.mode || task?.boardStyle || task?.style),
    domain: inferDomain(task),
    effort: inferEffort(task),
    family: task?.canonical_key || task?.canonicalKey || task?.family || taskFamily(task),
    specificity: specificityScore(task),
    fit: fitScore(task, checkin),
    voice: voiceScore(task),
    personalization: personalizationScore(task, checkin),
    qualityScore: quality.rejected ? 0 : clamp((quality.score - 40) / 10, 1, 5),
    safetyFailures,
    rejected: quality.rejected || safetyFailures.length > 0,
    tokens: tokenize(text),
  };
}

function gradeAverage(value, target) {
  if (!target) return 0;
  return clamp(value / target, 0, 1);
}

function scoreSafety(rows) {
  if (!rows.length) return 0;
  const failures = rows.filter((row) => row.rejected).length;
  return failures === 0 ? 1 : clamp(1 - failures / rows.length, 0, 1);
}

function scoreDiversity(domainCounts, total) {
  if (!total) return 0;
  const domains = Object.keys(domainCounts).length;
  const maxShare = Math.max(...Object.values(domainCounts).map((count) => count / total), 0);
  const domainScore = clamp(domains / TARGETS.minDomains, 0, 1);
  const shareScore = maxShare <= TARGETS.maxDomainShare ? 1 : clamp(TARGETS.maxDomainShare / maxShare, 0, 1);
  return (domainScore * 0.55) + (shareScore * 0.45);
}

function scoreModeSeparation(board) {
  if (!board.expectedMode) return 0.75;
  const total = board.rows.length || 1;
  const supportCount = board.rows.filter((row) => row.mode === "support").length;
  const stretchCount = board.rows.filter((row) => row.mode === "stretch").length;
  const supportShare = supportCount / total;
  const stretchShare = stretchCount / total;
  if (board.expectedMode === "support") return clamp((supportShare - stretchShare + 0.4) / 1.2, 0, 1);
  if (board.expectedMode === "stretch") return clamp((stretchShare - supportShare + 0.4) / 1.2, 0, 1);
  return 0.75;
}

function freshnessAcrossBoards(boards) {
  const seenExact = new Map();
  const seenFamilies = new Map();
  const nearDuplicates = [];
  const exactRepeats = [];
  const familyRepeats = [];
  const allRows = [];

  boards.forEach((board, boardIndex) => {
    board.rows.forEach((row) => {
      const normalized = normalizeText(row.text);
      const boardId = board.id || `board-${boardIndex + 1}`;
      const previousExact = seenExact.get(normalized);
      if (previousExact && boardIndex - previousExact.index <= 14) {
        exactRepeats.push({ text: row.text, previousBoard: previousExact.id, board: board.id });
      }
      seenExact.set(normalized, { id: boardId, index: boardIndex });

      const previousFamily = seenFamilies.get(row.family);
      if (previousFamily && boardIndex - previousFamily.index <= 7) {
        familyRepeats.push({ family: row.family, text: row.text, previousBoard: previousFamily.id, board: board.id });
      }
      seenFamilies.set(row.family, { id: boardId, index: boardIndex });

      for (const previous of allRows) {
        if (previous.board === board.id) continue;
        if (boardIndex - previous.boardIndex > 7) continue;
        if (overlapRatio(previous.tokens, row.tokens) >= 0.72) {
          nearDuplicates.push({ text: row.text, previousText: previous.text, previousBoard: previous.board, board: board.id });
          break;
        }
      }
      allRows.push({ ...row, board: boardId, boardIndex });
    });
  });

  const totalRows = allRows.length || 1;
  const penalty = exactRepeats.length * 0.18 + nearDuplicates.length * 0.08 + familyRepeats.length * 0.03;
  return {
    score: clamp(1 - penalty / Math.max(1, totalRows / 15), 0, 1),
    exactRepeats,
    nearDuplicates,
    familyRepeats,
  };
}

function evaluateBoard(boardInput, index) {
  const tasks = Array.isArray(boardInput?.tasks) ? boardInput.tasks : [];
  const targetTaskCount = Math.max(1, Number(boardInput?.targetTaskCount || TARGETS.minTasksPerBoard));
  const checkin = boardInput?.checkin && typeof boardInput.checkin === "object" ? boardInput.checkin : {};
  const boardHistory = boardInput?.history && typeof boardInput.history === "object" ? boardInput.history : {};
  const rows = tasks.map((task) => taskRow(task, checkin, boardHistory));
  const domainCounts = {};
  for (const row of rows) domainCounts[row.domain] = (domainCounts[row.domain] || 0) + 1;

  const expectedMode = normalizeMode(boardInput?.mode || boardInput?.boardStyle || boardInput?.style);
  const supportCount = rows.filter((row) => row.mode === "support").length;
  const stretchCount = rows.filter((row) => row.mode === "stretch").length;
  const pickableCount = rows.filter((row) => !row.rejected && row.specificity >= 4 && row.fit >= 4 && row.voice >= 4).length;
  const maxDomainShare = rows.length ? Math.max(...Object.values(domainCounts).map((count) => count / rows.length)) : 0;

  const metrics = {
    safety: scoreSafety(rows),
    specificity: average(rows.map((row) => row.specificity)),
    fit: average(rows.map((row) => row.fit)),
    voice: average(rows.map((row) => row.voice)),
    personalization: average(rows.map((row) => row.personalization)),
    modeSeparation: scoreModeSeparation({ expectedMode, rows }),
    diversity: scoreDiversity(domainCounts, rows.length),
    pickableCount,
    domainCount: Object.keys(domainCounts).length,
    maxDomainShare,
    completeness: clamp(rows.length / targetTaskCount, 0, 1),
  };

  const warnings = [];
  if (rows.length < targetTaskCount) warnings.push(`Board has ${rows.length} tasks; expected ${targetTaskCount}.`);
  if (rows.some((row) => row.rejected)) warnings.push("Safety or quality rejection present.");
  if (metrics.specificity < TARGETS.specificity) warnings.push("Specificity below launch target.");
  if (metrics.fit < TARGETS.fit) warnings.push("Right-sized effort below launch target.");
  if (metrics.voice < TARGETS.voice) warnings.push("Attune voice below launch target.");
  if (metrics.domainCount < TARGETS.minDomains) warnings.push("Not enough task domains represented.");
  if (metrics.maxDomainShare > TARGETS.maxDomainShare) warnings.push("One task domain dominates the board.");
  if (metrics.pickableCount < TARGETS.minPickableTasks) warnings.push("Fewer than 3 clearly pickable tasks.");
  if (expectedMode === "support" && supportCount <= stretchCount) warnings.push("Support board does not read as Support.");
  if (expectedMode === "stretch" && stretchCount <= supportCount) warnings.push("Stretch board does not read as Stretch.");

  return {
    id: boardInput?.id || boardInput?.scenarioId || `board-${index + 1}`,
    scenarioId: boardInput?.scenarioId || "",
    expectedMode,
    targetTaskCount,
    taskCount: rows.length,
    rows,
    domainCounts,
    supportCount,
    stretchCount,
    metrics,
    warnings,
  };
}

function weightedScore(summary) {
  const safety = summary.safetyScore;
  const specificity = gradeAverage(summary.averageSpecificity, TARGETS.specificity);
  const fit = gradeAverage(summary.averageFit, TARGETS.fit);
  const separation = summary.modeDetectionAccuracy;
  const freshness = summary.freshness.score;
  const voice = gradeAverage(summary.averageVoice, TARGETS.voice);
  const coherence = (
    gradeAverage(summary.averageCoherence, TARGETS.coherence) * 0.45
    + summary.averageDiversityScore * 0.35
    + clamp(summary.pickableBoardRate / 0.9, 0, 1) * 0.1
    + summary.boardCompletenessRate * 0.1
  );

  const weighted =
    safety * SCORE_WEIGHTS.safety
    + specificity * SCORE_WEIGHTS.specificity
    + fit * SCORE_WEIGHTS.fit
    + separation * SCORE_WEIGHTS.separation
    + freshness * SCORE_WEIGHTS.freshness
    + voice * SCORE_WEIGHTS.voice
    + coherence * SCORE_WEIGHTS.coherence;

  return Math.round(weighted * 10) / 10;
}

function summarizeBoards(boards) {
  const allRows = boards.flatMap((board) => board.rows);
  const safetyFailures = allRows.filter((row) => row.rejected);
  const modeBoards = boards.filter((board) => board.expectedMode);
  const correctlyDetectedMode = modeBoards.filter((board) => {
    if (board.expectedMode === "support") return board.supportCount > board.stretchCount;
    if (board.expectedMode === "stretch") return board.stretchCount > board.supportCount;
    return false;
  }).length;

  const freshness = freshnessAcrossBoards(boards);
  const averageCoherence = average(boards.map((board) => {
    const diversity = board.metrics.diversity * 5;
    const pickable = clamp(board.metrics.pickableCount / TARGETS.minPickableTasks, 0, 1) * 5;
    const warningPenalty = board.warnings.length * 0.25;
    return clamp((diversity * 0.45) + (pickable * 0.35) + (board.metrics.modeSeparation * 5 * 0.2) - warningPenalty, 1, 5);
  }));

  const summary = {
    boardCount: boards.length,
    taskCount: allRows.length,
    safetyFailureCount: safetyFailures.length,
    safetyScore: allRows.length ? clamp(1 - safetyFailures.length / allRows.length, 0, 1) : 0,
    averageSpecificity: average(allRows.map((row) => row.specificity)),
    averageFit: average(allRows.map((row) => row.fit)),
    averageVoice: average(allRows.map((row) => row.voice)),
    averagePersonalization: average(allRows.map((row) => row.personalization)),
    averageDiversityScore: average(boards.map((board) => board.metrics.diversity)),
    boardCompletenessRate: average(boards.map((board) => board.metrics.completeness)),
    averageCoherence,
    modeDetectionAccuracy: modeBoards.length ? correctlyDetectedMode / modeBoards.length : 0.75,
    pickableBoardRate: boards.length ? boards.filter((board) => board.metrics.pickableCount >= TARGETS.minPickableTasks).length / boards.length : 0,
    freshness,
  };

  summary.attuneTaskQualityScore = weightedScore(summary);
  summary.launchReady = (
    summary.safetyFailureCount === 0
    && summary.attuneTaskQualityScore >= TARGETS.launchScore
    && summary.averageSpecificity >= TARGETS.specificity
    && summary.averageFit >= TARGETS.fit
    && summary.modeDetectionAccuracy >= TARGETS.supportStretchDetection
    && summary.boardCompletenessRate >= 1
    && summary.pickableBoardRate >= 0.9
  );
  summary.premiumReady = summary.launchReady && summary.attuneTaskQualityScore >= TARGETS.premiumScore;

  return summary;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function passFail(condition) {
  return condition ? "PASS" : "FAIL";
}

function markdownReport(result) {
  const { summary, boards } = result;
  const lines = [];

  lines.push("# Attune Step Engine Evaluation");
  lines.push("");
  lines.push(`Overall score: ${summary.attuneTaskQualityScore}/100`);
  lines.push(`Launch ready: ${passFail(summary.launchReady)}`);
  lines.push(`Premium bar: ${passFail(summary.premiumReady)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Boards evaluated: ${summary.boardCount}`);
  lines.push(`- Tasks evaluated: ${summary.taskCount}`);
  lines.push(`- Safety failures: ${summary.safetyFailureCount}`);
  lines.push(`- Average specificity: ${formatNumber(summary.averageSpecificity)} / 5 (target ${TARGETS.specificity})`);
  lines.push(`- Average fit: ${formatNumber(summary.averageFit)} / 5 (target ${TARGETS.fit})`);
  lines.push(`- Average Attune voice: ${formatNumber(summary.averageVoice)} / 5 (target ${TARGETS.voice})`);
  lines.push(`- Average personalization: ${formatNumber(summary.averagePersonalization)} / 5 (target ${TARGETS.personalization})`);
  lines.push(`- Support/Stretch detection: ${formatNumber(summary.modeDetectionAccuracy * 100, 1)}% (target ${TARGETS.supportStretchDetection * 100}%)`);
  lines.push(`- Pickable board rate: ${formatNumber(summary.pickableBoardRate * 100, 1)}%`);
  lines.push(`- Board completeness: ${formatNumber(summary.boardCompletenessRate * 100, 1)}%`);
  lines.push(`- Freshness score: ${formatNumber(summary.freshness.score * 100, 1)}%`);
  lines.push("");
  lines.push("## Board Results");
  lines.push("");

  for (const board of boards) {
    lines.push(`### ${board.id}${board.expectedMode ? ` (${board.expectedMode})` : ""}`);
    lines.push("");
    lines.push(`- Task count: ${board.taskCount}`);
    lines.push(`- Expected task count: ${board.targetTaskCount}`);
    lines.push(`- Support / Stretch mix: ${board.supportCount} / ${board.stretchCount}`);
    lines.push(`- Domains: ${Object.entries(board.domainCounts).map(([domain, count]) => `${domain} ${count}`).join(", ") || "none"}`);
    lines.push(`- Specificity: ${formatNumber(board.metrics.specificity)} / 5`);
    lines.push(`- Fit: ${formatNumber(board.metrics.fit)} / 5`);
    lines.push(`- Voice: ${formatNumber(board.metrics.voice)} / 5`);
    lines.push(`- Pickable tasks: ${board.metrics.pickableCount}`);
    if (board.warnings.length) {
      lines.push(`- Warnings: ${board.warnings.join(" ")}`);
    } else {
      lines.push("- Warnings: none");
    }
    lines.push("");
  }

  if (summary.freshness.exactRepeats.length || summary.freshness.nearDuplicates.length || summary.freshness.familyRepeats.length) {
    lines.push("## Freshness Issues");
    lines.push("");
    for (const repeat of summary.freshness.exactRepeats.slice(0, 10)) {
      lines.push(`- Exact repeat: "${repeat.text}" (${repeat.previousBoard} -> ${repeat.board})`);
    }
    for (const repeat of summary.freshness.nearDuplicates.slice(0, 10)) {
      lines.push(`- Near duplicate: "${repeat.previousText}" -> "${repeat.text}" (${repeat.previousBoard} -> ${repeat.board})`);
    }
    for (const repeat of summary.freshness.familyRepeats.slice(0, 10)) {
      lines.push(`- Family repeat: ${repeat.family} (${repeat.previousBoard} -> ${repeat.board})`);
    }
    lines.push("");
  }

  const rejectedRows = boards.flatMap((board) => board.rows
    .filter((row) => row.rejected)
    .map((row) => ({ board: board.id, row })));

  if (rejectedRows.length) {
    lines.push("## Safety / Quality Failures");
    lines.push("");
    for (const item of rejectedRows.slice(0, 20)) {
      lines.push(`- ${item.board}: "${item.row.text}" (${item.row.safetyFailures.join(", ")})`);
    }
    lines.push("");
  }

  lines.push("## Input Format");
  lines.push("");
  lines.push("Provide JSON as either an array of boards or an object with a `boards` array:");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(sampleInput(), null, 2));
  lines.push("```");
  lines.push("");
  lines.push("Run with:");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/evaluate-task-boards.mjs --input boards.json");
  lines.push("node scripts/evaluate-task-boards.mjs --input boards.json --json");
  lines.push("```");

  return `${lines.join("\n")}\n`;
}

function sampleInput() {
  return {
    boards: [
      {
        id: "sample-support",
        scenarioId: "low-energy-morning",
        mode: "support",
        targetTaskCount: 3,
        checkin: {
          moodWords: ["Tired"],
          energy: "low",
          body: "manageable",
          pace: "gentle",
        },
        tasks: [
          "Make one thing around you softer: light, sound, or clothes",
          "Clear one small surface for 5 minutes, then stop",
          "Write one sentence about what feels loud right now",
        ],
      },
      {
        id: "sample-stretch",
        scenarioId: "low-energy-morning",
        mode: "stretch",
        targetTaskCount: 3,
        checkin: {
          moodWords: ["Tired"],
          energy: "low",
          body: "manageable",
          pace: "gentle",
        },
        tasks: [
          "Make a 5-minute start on one task, then stop",
          "Send the message that moves one thing forward",
          "Draft the rough first version of one small thing",
        ],
      },
    ],
  };
}

async function loadInput(path) {
  if (!path || path === "-") {
    let data = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) data += chunk;
    return JSON.parse(data);
  }

  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = {
    input: "",
    json: false,
    sample: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--sample") {
      args.sample = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  return args;
}

function usage() {
  return [
    "Attune Step Engine evaluator",
    "",
    "Usage:",
    "  node scripts/evaluate-task-boards.mjs --input boards.json",
    "  node scripts/evaluate-task-boards.mjs --input boards.json --json",
    "  node scripts/evaluate-task-boards.mjs --sample",
    "",
    "Input shape:",
    "  { \"boards\": [{ \"id\": \"day-1-support\", \"mode\": \"support\", \"checkin\": {}, \"tasks\": [\"...\"] }] }",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (args.sample) {
    process.stdout.write(`${JSON.stringify(sampleInput(), null, 2)}\n`);
    return;
  }
  if (!args.input) {
    process.stderr.write(`${usage()}\nMissing --input.\n`);
    process.exitCode = 1;
    return;
  }

  const input = await loadInput(args.input);
  const rawBoards = Array.isArray(input) ? input : input?.boards;
  if (!Array.isArray(rawBoards)) {
    throw new Error("Input must be an array of boards or an object with a boards array.");
  }

  const boards = rawBoards.map(evaluateBoard);
  const summary = summarizeBoards(boards);
  const result = { summary, boards };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(markdownReport(result));
}

main().catch((error) => {
  process.stderr.write(`Evaluator failed: ${error?.message || error}\n`);
  process.exitCode = 1;
});
