import { UNTRUSTED_CONTEXT_INSTRUCTION, sanitizeUntrustedAiText } from "../lib/aiPromptSecurity.js";
import {
  BOARD_CANDIDATE_RESPONSE_FORMAT,
  sanitizeBoardHistoryForQuality,
  sanitizeGeneratedTaskCandidates,
} from "../lib/boardCandidates.js";
import { selectQualityBoard } from "../lib/boardQuality.js";
import { TASK_CATALOG } from "../../src/data/tasks.js";
import { createAiUsageTracker } from "../lib/aiUsage.js";
import { activityConstraints, activityKey, isActivityEligible } from "../../src/lib/activityPolicy.js";
import {
  clampInt,
  clampString,
  genericNoteTokens,
  looksAssumptive,
  looksUnsafe,
  normalizeForSimilarity,
  overlapRatio,
} from "./aiText.js";

export function normalizeBoardStyle(value) {
  return String(value || "").trim().toLowerCase() === "challenge" ? "challenge" : "steady";
}

export function buildCuratedFallbackTasks({ tasksByLevel, level, boardStyle = "steady" }) {
  const style = normalizeBoardStyle(boardStyle);
  const orderByLevel = {
    rest: ["rest", "gentle", "light"],
    gentle: ["gentle", "rest", "light", "steady"],
    light: ["light", "gentle", "steady", "rest"],
    steady: ["steady", "light", "gentle", "capable"],
    capable: ["capable", "steady", "light", "gentle"],
    brave: ["brave", "capable", "steady", "light"],
  };
  const challengeBoost = {
    rest: ["gentle", "light"],
    gentle: ["light", "steady"],
    light: ["steady", "capable"],
    steady: ["capable", "brave"],
    capable: ["brave"],
    brave: ["brave", "capable"],
  };
  const levels = [
    ...(style === "challenge" ? (challengeBoost[level] || challengeBoost.gentle) : []),
    ...(orderByLevel[level] || orderByLevel.gentle),
  ];
  const out = [];
  const seen = new Set();

  for (const taskLevel of levels) {
    const tasks = Array.isArray(tasksByLevel?.[taskLevel]) ? tasksByLevel[taskLevel] : [];
    for (const text of tasks) {
      const clean = clampString(text, 120);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      const metadata = TASK_CATALOG.find(task => task.text === clean && task.level === taskLevel);
      out.push(metadata ? { ...metadata } : { text: clean, level: taskLevel });
    }
  }

  for (const task of TASK_CATALOG) {
    if (!seen.has(task.text.toLowerCase())) out.push({ ...task });
    seen.add(task.text.toLowerCase());
  }
  return out;
}

export function computeBoardPreferences({ pace, energy, boardStyle, totalTaskCount = 12 }) {
  const paceLower = String(pace || "").toLowerCase();
  const energyLower = String(energy || "").toLowerCase();
  const style = normalizeBoardStyle(boardStyle);

  const baseByPace = {
    rest: { minLow: 12, minMedium: 0, minHigh: 0, maxHigh: 0, maxMinutes: 20 },
    gentle: { minLow: 9, minMedium: 3, minHigh: 0, maxHigh: 0, maxMinutes: 30 },
    light: { minLow: 7, minMedium: 4, minHigh: 1, maxHigh: 1, maxMinutes: 35 },
    steady: { minLow: 5, minMedium: 5, minHigh: 1, maxHigh: 2, maxMinutes: 40 },
    capable: { minLow: 4, minMedium: 6, minHigh: 2, maxHigh: 4, maxMinutes: 45 },
    brave: { minLow: 3, minMedium: 6, minHigh: 3, maxHigh: 5, maxMinutes: 45 },
  };

  const base = baseByPace[paceLower] || baseByPace.gentle;
  const prefs = { ...base };

  if (energyLower === "low") {
    prefs.maxHigh = Math.min(prefs.maxHigh, 1);
    prefs.minHigh = 0;
    prefs.minMedium = Math.max(0, prefs.minMedium - 2);
    prefs.minLow = Math.min(totalTaskCount, prefs.minLow + 2);
    prefs.maxMinutes = Math.min(prefs.maxMinutes, 30);
  } else if (energyLower === "high") {
    prefs.minHigh = clampInt(prefs.minHigh + 1, 0, 6, prefs.minHigh);
    prefs.minLow = clampInt(prefs.minLow - 1, 0, totalTaskCount, prefs.minLow);
  }

  if (style === "challenge") {
    prefs.minHigh = clampInt(prefs.minHigh + 2, 0, 7, prefs.minHigh);
    prefs.maxHigh = clampInt(prefs.maxHigh + 2, 1, 7, prefs.maxHigh);
    prefs.minMedium = clampInt(prefs.minMedium + 1, 0, 10, prefs.minMedium);
    prefs.minLow = clampInt(prefs.minLow - 2, 0, totalTaskCount, prefs.minLow);
    prefs.maxMinutes = Math.min(50, Math.max(prefs.maxMinutes, energyLower === "high" ? 45 : 35));

    if (energyLower === "verylow") {
      prefs.minHigh = 0;
      prefs.maxHigh = Math.min(prefs.maxHigh, 1);
      prefs.maxMinutes = Math.min(prefs.maxMinutes, 20);
    } else if (energyLower === "low") {
      prefs.minHigh = 0;
      prefs.maxHigh = Math.min(prefs.maxHigh, 2);
      prefs.maxMinutes = Math.min(prefs.maxMinutes, 30);
    }
  }

  const minTotal = prefs.minLow + prefs.minMedium + prefs.minHigh;
  if (minTotal > totalTaskCount) {
    const overflow = minTotal - totalTaskCount;
    const reduceLow = Math.min(overflow, prefs.minLow);
    prefs.minLow -= reduceLow;
    const remaining = overflow - reduceLow;
    prefs.minMedium = Math.max(0, prefs.minMedium - remaining);
  }

  return prefs;
}

export function containsAnyFragment(text, fragments) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return fragments.some((f) => f && t.includes(f));
}

export function validateBoardPayload(payload, allowedContextLower, groundingFragments, expectedCount = 12, opts = {}) {
  const totalTaskCount = Number.isFinite(opts.totalTaskCount) ? Math.max(1, Math.floor(opts.totalTaskCount)) : 12;
  const warnings = [];
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid JSON" };

  const tasks = payload.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: "Missing tasks[]" };
  const minCount = Number.isFinite(opts.minCount) ? Math.max(1, Math.floor(opts.minCount)) : expectedCount;
  const isCandidatePool = expectedCount > totalTaskCount;
  if (tasks.length < minCount) return { ok: false, error: `tasks[] must have at least ${minCount} items` };
  if (tasks.length > expectedCount) return { ok: false, error: `tasks[] must have no more than ${expectedCount} items` };

  const seen = new Set();
  const tokenLists = [];
  let groundedCount = 0;
  let nearDuplicateWarningAdded = false;
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
        if (!isCandidatePool) return { ok: false, error: "Tasks are too similar (near-duplicate)" };
        if (!nearDuplicateWarningAdded) {
          warnings.push("Candidate pool contains near-duplicates; quality layer will dedupe.");
          nearDuplicateWarningAdded = true;
        }
        break;
      }
    }
    tokenLists.push(tokens);

    if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
      if (containsAnyFragment(text, groundingFragments)) groundedCount += 1;
    }
  }

  if (Array.isArray(groundingFragments) && groundingFragments.length > 0) {
    const minimumGrounded = Math.max(3, Math.ceil(expectedCount * 0.55));
    if (groundedCount < minimumGrounded) warnings.push("Board text is only lightly grounded in the check-in.");
  }

  return { ok: true, warnings };
}

export function buildBoardRequest({
  tasksByLevel,
  userId,
  checkin,
  level,
  boardHistory,
  useNoteForAi,
  totalTaskCount,
  aiCandidateCount,
}) {
  const moodWords = Array.isArray(checkin.moodWords) ? checkin.moodWords.slice(0, 2).map((w) => clampString(w, 20)) : [];
  const mood = clampString(checkin.mood, 12) || "okay";
  const energy = clampString(checkin.energy, 12) || "okay";
  const body = clampString(checkin.body, 16) || "manageable";
  const boardStyle = normalizeBoardStyle(checkin.boardStyle);
  const constraints = activityConstraints(checkin.activityConstraints);
  const noteGuard = useNoteForAi
    ? sanitizeUntrustedAiText(checkin.note, { maxLength: 200 })
    : { text: "", omitted: false, flags: [] };
  const note = noteGuard.text;
  const sanitizedBoardHistory = sanitizeBoardHistoryForQuality(boardHistory);

  const cacheKey = JSON.stringify({
    kind: "board-catalog-v2",
    userId,
    level,
    moodWords,
    mood,
    energy,
    body,
    boardStyle,
    note,
    noteOmitted: !!noteGuard.omitted,
    activityConstraints: constraints,
    boardHistory: sanitizedBoardHistory,
  });

  const preferences = computeBoardPreferences({ pace: level, energy, boardStyle, totalTaskCount });

  const groundingFragments = [
    String(level || "").toLowerCase(),
    String(energy || "").toLowerCase(),
    String(body || "").toLowerCase(),
    ...moodWords.map((w) => String(w || "").toLowerCase()),
  ].filter(Boolean);

  const noteTokens = normalizeForSimilarity(note)
    .filter((t) => !genericNoteTokens.has(t))
    .slice(0, 4);
  groundingFragments.push(...noteTokens);
  const fallbackTasks = buildCuratedFallbackTasks({ tasksByLevel, level, boardStyle });

  const approvedActivities = fallbackTasks
    .filter(task => task.canonicalKey && isActivityEligible(task, { moodWords, mood, energy, body, pace: level, activityConstraints: constraints }, level))
    .map(({ text, canonicalKey, repetitionFamily, mode, domain, effort, friction, durationMinutes }) =>
      ({ text, canonicalKey, repetitionFamily, mode, domain, effort, friction, durationMinutes }));
  const system =
    "Select useful everyday activities for a calm wellbeing app. " +
    UNTRUSTED_CONTEXT_INSTRUCTION + " " +
    "Return ONLY JSON containing tasks with canonicalKey values from approvedActivities. " +
    "Do not generate or rewrite activities, identities, metadata, advice, or explanations. " +
    "Choose distinct options using today's pace, energy, body, mood words and optional note. " +
    "Respect all time, indoor and seated constraints. Never infer diagnoses or medical restrictions. " +
    "For steady boards favor support; for challenge boards include small achievable progress without exceeding capacity. " +
    "Balance comfort, regulation, creativity, play, connection and practical steps. " +
    "Avoid recent repeats and excluded activities. Keep a few favorites or previously helpful choices, with room for discovery. " +
    "No shame, pressure, risky suggestions, treatment advice, or weekly reflection. " +
    "Order the choices by fit. Fewer genuinely suitable options are better than filler.";

  const userPayload = {
    checkin: {
      moodWords,
      mood,
      energy,
      body,
      boardStyle,
      pace: level,
      note,
      activityConstraints: constraints,
    },
    contextSafety: {
      optionalNoteIncluded: !!note,
      optionalNoteOmitted: !!noteGuard.omitted,
      optionalNoteFlags: Array.isArray(noteGuard.flags) ? noteGuard.flags : [],
    },
    preferences,
    grounding: {
      fragments: groundingFragments,
    },
    recentBoardHistory: sanitizedBoardHistory,
    approvedActivities,
    taskRequirements: {
      count: Math.min(aiCandidateCount || 50, approvedActivities.length),
      finalBoardCountAfterServerCuration: totalTaskCount,
      style: "Distinct approved activity IDs, ordered by fit for today's check-in",
      avoidAssumptions: true,
      avoidNearDuplicates: true,
      avoidRecentRepeats: true,
      includeMetadata: ["canonicalKey"],
      supportDefinition: "stabilize, reduce friction, recover, regulate, or make today easier",
      stretchDefinition: "gently move something forward while respecting energy, body, and pace",
      boardStyle,
      boardStyleHint: boardStyle === "challenge"
        ? "more active, progress-oriented, and still realistic for this check-in"
        : "grounded, steady, realistic steps the user can follow through on",
      pacingHint: preferences,
    },
    outputSchema: "{\"tasks\":[{\"canonicalKey\":string}]}"
  };

  return {
    cacheKey,
    fallbackTasks,
    boardHistory: sanitizedBoardHistory,
    noteGuard,
    system,
    userPayload,
  };
}

export async function generateBoardWithRetries(client, {
  system,
  userPayload,
  models,
  candidateCount,
  finalCount,
  fallbackTasks,
  boardHistory,
  maxCompletionTokens,
  totalTaskCount,
  summarizeError,
}) {
  let lastError = "";
  let lastWarnings = [];
  const desiredCandidateCount = Math.max(totalTaskCount, Number(candidateCount) || 50);
  const desiredFinalCount = Math.max(1, Number(finalCount) || totalTaskCount);
  const modelList = Array.from(
    new Set(
      (Array.isArray(models) ? models : [models])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
  const attemptedModels = [];
  const modelErrors = [];
  const usageTracker = createAiUsageTracker();
  const responseFormat = structuredClone(BOARD_CANDIDATE_RESPONSE_FORMAT);
  responseFormat.json_schema.schema.properties.tasks.maxItems = Math.min(60, desiredCandidateCount);

  for (const model of modelList) {
    attemptedModels.push(model);
    lastWarnings = [];

    let content = "";
    try {
      const completion = await usageTracker.complete(client, {
        model,
        temperature: 0.3,
        max_completion_tokens: Math.max(1, Number(maxCompletionTokens) || 3200),
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: responseFormat,
      });
      content = completion.choices?.[0]?.message?.content || "";
    } catch (error) {
      lastError = summarizeError(error).message || "Model request failed";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    if (typeof content !== "string" || !content.trim()) {
      lastError = "Empty model response";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "Model did not return valid JSON";
      modelErrors.push({ model, error: lastError });
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

    let sanitizedTasks = sanitizeGeneratedTaskCandidates(parsed?.tasks, { targetCount: desiredCandidateCount });
    if (Array.isArray(userPayload.approvedActivities)) {
      const approvedKeys = new Set(userPayload.approvedActivities.map(activityKey));
      const catalogue = new Map(fallbackTasks.map(task => [activityKey(task), task]));
      const seen = new Set();
      sanitizedTasks = (Array.isArray(parsed?.tasks) ? parsed.tasks : [])
        .filter(task => {
          const key = activityKey(task);
          if (!approvedKeys.has(key) || !catalogue.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, desiredCandidateCount)
        .map(task => ({ ...catalogue.get(activityKey(task)) }));
    }

    const sanitizedPayload = { ...parsed, tasks: sanitizedTasks };

    const validated = validateBoardPayload(
      sanitizedPayload,
      allowedContextLower,
      groundingFragments,
      desiredCandidateCount,
      { minCount: 1, totalTaskCount },
    );
    if (!validated.ok) {
      lastError = validated.error || "Invalid board";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    lastWarnings = Array.isArray(validated.warnings) ? validated.warnings : [];
    // With an explicit note, fill gaps within the topics the model selected.
    // Generic fallback quotas must not undo a specific request such as no chores.
    const selectedDomains = new Set(sanitizedTasks.map(task => task.domain));
    const selectionFallback = checkin.note && sanitizedTasks.length >= 3 && selectedDomains.size >= 2
      ? fallbackTasks.filter(task => selectedDomains.has(task.domain)) : fallbackTasks;
    const selected = selectQualityBoard({
      candidates: sanitizedTasks,
      fallbackTasks: selectionFallback,
      checkin: userPayload?.checkin,
      boardHistory,
      targetCount: desiredFinalCount,
    });
    if (!Array.isArray(selected.tasks) || selected.tasks.length === 0) {
      lastError = "Quality layer could not select enough tasks";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    const removed = Array.isArray(parsed?.tasks) ? parsed.tasks.length - sanitizedTasks.length : 0;
    if (removed > 0) lastWarnings = [...lastWarnings, "Removed invalid, repeated or excess activity candidates."];
    if (selected.meta?.fallbackCount > 0) lastWarnings = [...lastWarnings, "Filled weaker AI candidates with curated fallback tasks."];
    if (selected.meta?.rejectedCount > 0) lastWarnings = [...lastWarnings, "Rejected low-quality AI candidates before showing the board."];
    return {
      ok: true,
      tasks: selected.tasks,
      warnings: lastWarnings,
      quality: selected.meta,
      model,
      attemptedModels,
      modelErrors,
      providerUsage: usageTracker.snapshot(),
    };
  }

  return {
    ok: false,
    error: lastError || "Invalid board",
    warnings: lastWarnings,
    attemptedModels,
    modelErrors,
    providerUsage: usageTracker.snapshot(),
  };
}
