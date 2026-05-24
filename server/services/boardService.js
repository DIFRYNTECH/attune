import { UNTRUSTED_CONTEXT_INSTRUCTION, sanitizeUntrustedAiText } from "../lib/aiPromptSecurity.js";
import {
  BOARD_CANDIDATE_RESPONSE_FORMAT,
  sanitizeBoardHistoryForQuality,
  sanitizeGeneratedTaskCandidates,
} from "../lib/boardCandidates.js";
import { selectQualityBoard } from "../lib/boardQuality.js";
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
      out.push({ text: clean, level: taskLevel });
    }
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
  const noteGuard = useNoteForAi
    ? sanitizeUntrustedAiText(checkin.note, { maxLength: 200 })
    : { text: "", omitted: false, flags: [] };
  const note = noteGuard.text;
  const sanitizedBoardHistory = sanitizeBoardHistoryForQuality(boardHistory);

  const cacheKey = JSON.stringify({
    kind: "board",
    userId,
    level,
    moodWords,
    mood,
    energy,
    body,
    boardStyle,
    note,
    noteOmitted: !!noteGuard.omitted,
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

  const system =
    "You generate a calm, emotionally-safe list of micro-activities for a wellbeing app. " +
    UNTRUSTED_CONTEXT_INSTRUCTION + " " +
    "Return ONLY valid JSON. No markdown. No extra keys. " +
    "Do NOT suggest anything harmful, illegal, or risky. " +
    "Do NOT mention self-harm. " +
    "Do NOT suggest medications, supplements, diagnoses, or treatment plans. " +
    "Do NOT infer emotions or problems the user did not state. " +
    "The board MUST match the user's check-in (pace, energy, body, moodWords, and optional note). Avoid generic wellness lists. " +
    "The user also chooses a boardStyle. If boardStyle is steady, keep suggestions grounded and follow-through focused. If boardStyle is challenge, include more active progress-oriented steps, but still respect energy, body, and pace so the board never becomes hustle-coded or overwhelming. " +
    "Return a broad candidate pool only; the Attune server will compose the final 12-task board. " +
    "Each candidate must include metadata: text, mode, domain, effort, friction, pace, canonicalKey, and repetitionFamily. " +
    "Use mode=support for stabilizing, reducing friction, recovering, regulating, or making the day easier. " +
    "Use mode=stretch for gently moving something forward without shame, pressure, productivity theater, or hustle language. " +
    "Stretch candidates must still obey the user's energy, body, and pace caps. " +
    "Use domains from body, environment, practical, connection, comfort, and regulation. " +
    "Use effort and friction from 1 to 5, where 1 is tiny/low-friction and 5 is demanding; avoid 5 unless the check-in clearly supports it. " +
    "Keep tasks small, doable, varied, and non-punitive. " +
      "Each task must be a single short line written as a direct action or invitation. " +
      "Use the check-in as hidden context for choosing the task, not as a required opening clause. " +
      "Only mention pace, energy, body, mood, or note details when they materially sharpen the task, and weave them in naturally. " +
    "Make the board feel bespoke: at least a third of the tasks should visibly reflect a concrete signal from the user's body state, mood words, pace, energy, or note. " +
      "Avoid formulaic lead-ins like 'With low energy, ...', 'With a gentle pace, ...', 'If your body feels tight, ...', or 'If you're feeling {moodWord}, ...'. " +
      "Do NOT add grounding that introduces new emotional assumptions. " +
      "Aim for concise, editorial phrasing that sounds written by a thoughtful coach, not assembled from placeholders. " +
    "Use recent board history to keep the board valuable day after day: avoid repeating recentShown or recentPicked items unless the idea is clearly one the user completes often. " +
    "Treat recentRemoved as a strong signal to avoid that kind of task today. " +
    "Favor specific verbs and concrete details over generic productivity language. " +
    "Do not lean on filler tasks like drinking water, closing tabs, clearing a surface, taking a walk, or setting a timer unless the check-in clearly supports them. " +
    "Vary the mix across body reset, environment reset, emotional regulation, and practical next-step tasks so the board does not collapse into one pattern. " +
    "Keep task text concise and within maxTextChars. " +
    "Avoid shaming language. Avoid extreme exercise. Avoid dieting instructions. Avoid near-duplicate tasks. " +
    "Do NOT include week-level journaling/reflection (the app has a Weekly screen for that). Focus on today. " +
    "Return only the JSON candidate pool. No explanations, labels outside the schema, markdown, or extra keys.";

  const userPayload = {
    checkin: {
      moodWords,
      mood,
      energy,
      body,
      boardStyle,
      pace: level,
      note,
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
    taskRequirements: {
      count: aiCandidateCount,
      finalBoardCountAfterServerCuration: totalTaskCount,
      style: "40-60 metadata-rich candidates; short, actionable, editorial, grounded in today's check-in",
      maxTextChars: 120,
      avoidAssumptions: true,
      avoidNearDuplicates: true,
      avoidRecentRepeats: true,
      includeMetadata: ["mode", "domain", "effort", "friction", "pace", "canonicalKey", "repetitionFamily"],
      supportDefinition: "stabilize, reduce friction, recover, regulate, or make today easier",
      stretchDefinition: "gently move something forward while respecting energy, body, and pace",
      boardStyle,
      boardStyleHint: boardStyle === "challenge"
        ? "more active, progress-oriented, and still realistic for this check-in"
        : "grounded, steady, realistic steps the user can follow through on",
      pacingHint: preferences,
      examples: [
        "Drop your shoulders and lengthen the back of your neck.",
        "Turn the next task into a one-line starting point.",
        "Reset the space directly around you.",
      ],
    },
    outputSchema: "{\"tasks\":[{\"text\":string,\"mode\":\"support|stretch\",\"domain\":\"body|environment|practical|connection|comfort|regulation\",\"effort\":1-5,\"friction\":1-5,\"pace\":\"rest|gentle|light|steady|capable|brave\",\"canonicalKey\":string,\"repetitionFamily\":string}]}"
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

  for (const model of modelList) {
    attemptedModels.push(model);
    lastWarnings = [];

    let content = "";
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_completion_tokens: Math.max(1, Number(maxCompletionTokens) || 3200),
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: BOARD_CANDIDATE_RESPONSE_FORMAT,
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

    const sanitizedTasks = sanitizeGeneratedTaskCandidates(parsed?.tasks, { targetCount: desiredCandidateCount });

    const sanitizedPayload = { ...parsed, tasks: sanitizedTasks };

    const validated = validateBoardPayload(
      sanitizedPayload,
      allowedContextLower,
      groundingFragments,
      desiredCandidateCount,
      { minCount: desiredFinalCount, totalTaskCount },
    );
    if (!validated.ok) {
      lastError = validated.error || "Invalid board";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    lastWarnings = Array.isArray(validated.warnings) ? validated.warnings : [];
    const selected = selectQualityBoard({
      candidates: sanitizedTasks,
      fallbackTasks,
      checkin: userPayload?.checkin,
      boardHistory,
      targetCount: desiredFinalCount,
    });
    if (!Array.isArray(selected.tasks) || selected.tasks.length !== desiredFinalCount) {
      lastError = "Quality layer could not select enough tasks";
      modelErrors.push({ model, error: lastError });
      continue;
    }

    const removed = Array.isArray(parsed?.tasks) ? parsed.tasks.length - sanitizedTasks.length : 0;
    if (removed > 0) lastWarnings = [...lastWarnings, "Removed week-level reflection tasks from today's board."];
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
    };
  }

  return {
    ok: false,
    error: lastError || "Invalid board",
    warnings: lastWarnings,
    attemptedModels,
    modelErrors,
  };
}
