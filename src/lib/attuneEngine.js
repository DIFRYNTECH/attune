import { TASKS, TASK_LIBRARY, TASK_CATALOG, TASK_METADATA_BY_TEXT } from "../data/tasks.js";
import { LEVELS } from "../data/levels.js";

export function prettyLevel(key){
  const lvl = LEVELS.find(l => l.key === key);
  return lvl ? `${lvl.emoji} ${lvl.name}` : key;
}

function createSeededRandom(seed){
  const text = String(seed || "attune");
  let state = 2166136261;

  for(let i = 0; i < text.length; i += 1){
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }

  if(state === 0) state = 1;

  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function shuffle(arr, randomFn = Math.random){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(randomFn()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

const PACE_ORDER = ["rest", "gentle", "light", "steady", "capable", "brave"];
const VISIBLE_BOARD_COUNT = 12;
const MIN_BOARD_OPTION_POOL = 18;
const BOARD_STYLES = new Set(["steady", "challenge"]);
const PACE_FILL_ORDER = {
  rest: ["rest", "gentle", "light"],
  gentle: ["gentle", "rest", "light", "steady"],
  light: ["light", "gentle", "steady", "rest", "capable"],
  steady: ["steady", "light", "capable", "gentle", "brave"],
  capable: ["capable", "steady", "brave", "light"],
  brave: ["brave", "capable", "steady", "light"],
};
const CHALLENGE_FILL_ORDER = {
  rest: ["gentle", "light"],
  gentle: ["light", "steady"],
  light: ["steady", "capable"],
  steady: ["capable", "brave"],
  capable: ["brave", "steady"],
  brave: ["brave", "capable"],
};

function clampPace(key, maxKey){
  const keyIndex = PACE_ORDER.indexOf(key);
  const maxIndex = PACE_ORDER.indexOf(maxKey);
  if(keyIndex === -1 || maxIndex === -1) return key;
  return PACE_ORDER[Math.min(keyIndex, maxIndex)];
}

function scoreToPace(score){
  if(score < 0.9) return "rest";
  if(score < 1.9) return "gentle";
  if(score < 2.9) return "light";
  if(score < 3.9) return "steady";
  if(score < 4.9) return "capable";
  return "brave";
}

function normalizeTaskText(value){
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEAR_DUPLICATE_STOP_WORDS = new Set([
  "and", "the", "for", "with", "one", "your", "you", "that", "this", "then", "into", "from", "what", "been",
  "small", "simple", "gentle", "minutes", "minute", "min", "thing", "safe", "optional", "later", "today",
]);

function taskTokens(value){
  return normalizeTaskText(value)
    .split(" ")
    .filter((word) => word.length >= 3)
    .filter((word) => !NEAR_DUPLICATE_STOP_WORDS.has(word));
}

function tokenOverlapRatio(aText, bText){
  const a = taskTokens(aText);
  const b = taskTokens(bText);
  if(!a.length || !b.length) return 0;
  const aSet = new Set(a);
  let hits = 0;
  for(const token of b) if(aSet.has(token)) hits += 1;
  return hits / Math.max(1, Math.min(a.length, b.length));
}

function isDuplicateLikeTask(existing, candidate, maxOverlap = 0.82){
  if(!existing || !candidate) return false;
  return (
    normalizeTaskText(existing.text) === normalizeTaskText(candidate.text) ||
    existing.canonicalKey === candidate.canonicalKey ||
    existing.repetitionFamily === candidate.repetitionFamily ||
    tokenOverlapRatio(existing.text, candidate.text) >= maxOverlap
  );
}

function selectedHasDuplicateLike(selected, candidate, maxOverlap = 0.82){
  return selected.some((existing) => isDuplicateLikeTask(existing, candidate, maxOverlap));
}

function materializeTask(text, fallbackLevel){
  const key = normalizeTaskText(text);
  const meta = TASK_CATALOG.find((task) => task.level === fallbackLevel && normalizeTaskText(task.text) === key) || TASK_METADATA_BY_TEXT[key];
  if(meta) return { ...meta };
  return {
    text,
    level: fallbackLevel,
    mode: "support",
    domain: "regulation",
    effort: 2,
    friction: 2,
    pace: fallbackLevel,
    canonicalKey: `${fallbackLevel}:${key.replace(/\s+/g, "-")}`,
    repetitionFamily: `regulation:${key.replace(/\s+/g, "-").slice(0, 40)}`,
    safetyReviewed: true,
  };
}

function paceIndex(key){
  const idx = PACE_ORDER.indexOf(key);
  return idx === -1 ? PACE_ORDER.indexOf("light") : idx;
}

function taskPaceIndex(task){
  return paceIndex(task?.level || task?.pace);
}

function addDaysAgo(nowMs, days){
  return nowMs - days * 24 * 60 * 60 * 1000;
}

function safeEvents(value){
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ensureHistoryStat(map, key){
  if(!key) return null;
  if(!map.has(key)){
    map.set(key, {
      shown: 0,
      picked: 0,
      completed: 0,
      removed: 0,
      lastShownTs: 0,
      lastPickedTs: 0,
      lastCompletedTs: 0,
      lastRemovedTs: 0,
    });
  }
  return map.get(key);
}

function buildLocalHistory(eventsByDay, nowMs){
  const exact = new Map();
  const family = new Map();
  const events = safeEvents(eventsByDay);
  const days = Object.keys(events).filter(Boolean).sort();

  const noteTask = (taskLike, type, ts) => {
    const clean = typeof taskLike === "string" ? taskLike.trim() : (typeof taskLike?.text === "string" ? taskLike.text.trim() : "");
    if(!clean) return;
    const task = taskLike && typeof taskLike === "object"
      ? materializeTask(clean, taskLike.level || taskLike.pace || "light")
      : materializeTask(clean, "light");
    const familyKey = typeof taskLike?.repetitionFamily === "string"
      ? taskLike.repetitionFamily
      : (typeof taskLike?.repetition_family === "string" ? taskLike.repetition_family : task.repetitionFamily);
    const exactStat = ensureHistoryStat(exact, normalizeTaskText(clean));
    const familyStat = ensureHistoryStat(family, familyKey);
    for(const stat of [exactStat, familyStat]){
      if(!stat) continue;
      stat[type] += 1;
      if(type === "shown" && ts > stat.lastShownTs) stat.lastShownTs = ts;
      if(type === "picked" && ts > stat.lastPickedTs) stat.lastPickedTs = ts;
      if(type === "completed" && ts > stat.lastCompletedTs) stat.lastCompletedTs = ts;
      if(type === "removed" && ts > stat.lastRemovedTs) stat.lastRemovedTs = ts;
    }
  };

  for(const day of days){
    const list = Array.isArray(events[day]) ? events[day] : [];
    for(const event of list){
      const type = typeof event?.type === "string" ? event.type : "";
      const ts = typeof event?.ts === "number" ? event.ts : 0;
      if(type === "activityShown"){
        const activities = Array.isArray(event?.activities) ? event.activities : [];
        for(const text of activities) noteTask(text, "shown", ts);
      }else if(type === "activityPicked"){
        noteTask(event?.text, "picked", ts);
      }else if(type === "activityCompleted"){
        noteTask(event?.text, "completed", ts);
      }else if(type === "activityRemoved"){
        noteTask(event?.text, "removed", ts);
      }
    }
  }

  return {
    exact,
    family,
    recentShownCutoff: addDaysAgo(nowMs, 28),
    recentFamilyCutoff: addDaysAgo(nowMs, 4),
    recentRemovedCutoff: addDaysAgo(nowMs, 21),
    staleShownCutoff: addDaysAgo(nowMs, 7),
  };
}

function getHistoryScore(task, history){
  const exact = history.exact.get(normalizeTaskText(task.text));
  const family = history.family.get(task.repetitionFamily);
  let score = 0;

  if(exact?.completed) score += Math.min(1.2, exact.completed * 0.35);
  if(family?.completed) score += Math.min(0.8, family.completed * 0.18);
  if(exact?.picked) score += Math.min(0.7, exact.picked * 0.2);
  if(family?.picked) score += Math.min(0.5, family.picked * 0.12);

  const ignoredExact = Math.max(0, (exact?.shown || 0) - (exact?.picked || 0) - (exact?.completed || 0));
  const ignoredFamily = Math.max(0, (family?.shown || 0) - (family?.picked || 0) - (family?.completed || 0));
  score -= Math.min(1.6, ignoredExact * 0.28);
  score -= Math.min(1.0, ignoredFamily * 0.12);

  if(exact?.removed) score -= Math.min(2.5, exact.removed * 0.7);
  if(family?.removed) score -= Math.min(1.4, family.removed * 0.28);
  if(family?.lastShownTs >= history.staleShownCutoff) score -= 0.55;

  return score;
}

function isFreshlySuppressed(task, history){
  const exact = history.exact.get(normalizeTaskText(task.text));
  const family = history.family.get(task.repetitionFamily);
  if(exact?.lastRemovedTs >= history.recentRemovedCutoff) return true;
  if(exact?.lastShownTs >= history.recentShownCutoff) return true;
  if(family?.lastRemovedTs >= history.recentRemovedCutoff) return true;
  if(family?.lastShownTs >= history.recentFamilyCutoff) return true;
  return false;
}

function isExactRecentlyShown(task, history){
  const exact = history.exact.get(normalizeTaskText(task.text));
  return !!exact?.lastShownTs && exact.lastShownTs >= history.recentShownCutoff;
}

function getExactLastShownTs(task, history){
  return history.exact.get(normalizeTaskText(task.text))?.lastShownTs || 0;
}

function rebalanceTowardMode(selected, targetMode, history, nowMs, checkin, level, boardStyle){
  const countMode = (tasks, mode) => tasks.filter((task) => task.mode === mode).length;
  const oppositeMode = targetMode === "stretch" ? "support" : "stretch";
  if(countMode(selected, targetMode) > countMode(selected, oppositeMode)) return selected;

  const staleRepeatCutoff = addDaysAgo(nowMs, 14);
  const selectedKeys = new Set(selected.map((task) => task.canonicalKey));
  const targetCandidates = TASK_CATALOG
    .filter((task) => task.mode === targetMode && !selectedKeys.has(task.canonicalKey))
    .filter((task) => fitsCapacity(task, checkin, level, boardStyle))
    .map((task) => ({ task, lastShownTs: getExactLastShownTs(task, history) }))
    .sort((a, b) => a.lastShownTs - b.lastShownTs);
  const staleCandidates = targetCandidates.filter((entry) => entry.lastShownTs < staleRepeatCutoff);
  const replacementPool = [...staleCandidates, ...targetCandidates.filter((entry) => entry.lastShownTs >= staleRepeatCutoff)];

  const next = [...selected];
  for(const { task } of replacementPool){
    if(countMode(next, targetMode) > countMode(next, oppositeMode)) break;
    const replaceIndex = next.map((item) => item.mode).lastIndexOf(oppositeMode);
    if(replaceIndex === -1) break;
    if(next.some((item, index) => index !== replaceIndex && isDuplicateLikeTask(item, task, 0.82))) continue;
    next[replaceIndex] = { ...task };
  }

  return next;
}

function getCapacityCap(checkin, level, boardStyle){
  let cap = paceIndex(level);
  if(boardStyle === "challenge") cap += 2;
  else cap += 1;

  const moodWords = Array.isArray(checkin?.moodWords) ? checkin.moodWords : [];
  const hasAny = (...words) => words.some((word) => moodWords.includes(word));

  if(checkin?.energy === "verylow" || hasAny("Worn out")) cap = Math.min(cap, paceIndex("light"));
  if(checkin?.energy === "low" || hasAny("Tired")) cap = Math.min(cap, paceIndex("steady"));
  if(checkin?.body === "tender") cap = Math.min(cap, paceIndex("gentle"));
  if(checkin?.body === "achey") cap = Math.min(cap, paceIndex("steady"));
  if(hasAny("Overwhelmed", "Anxious")) cap = Math.min(cap, paceIndex("steady"));

  return Math.max(paceIndex("rest"), Math.min(paceIndex("brave"), cap));
}

function fitsCapacity(task, checkin, level, boardStyle){
  return taskPaceIndex(task) <= getCapacityCap(checkin, level, boardStyle);
}

function boardModeFromStyle(style){
  return style === "challenge" ? "stretch" : "support";
}

function desiredModeCounts(mode, checkin, level){
  const lowCapacity =
    checkin?.energy === "verylow" ||
    checkin?.energy === "low" ||
    checkin?.body === "tender" ||
    checkin?.body === "achey" ||
    level === "rest" ||
    level === "gentle";

  if(mode === "stretch"){
    return lowCapacity ? { stretch: 7, support: 5 } : { stretch: 8, support: 4 };
  }

  return lowCapacity ? { support: 9, stretch: 3 } : { support: 8, stretch: 4 };
}

function withSeededScores(tasks, seed, checkin, level, boardStyle, history){
  const randomFn = createSeededRandom(seed || `${level}:${boardStyle}`);
  const targetMode = boardModeFromStyle(boardStyle);
  const targetPaceIndex = paceIndex(level);
  const maxPaceIndex = getCapacityCap(checkin, level, boardStyle);

  return tasks
    .map((task) => {
      const taskPaceIndex = paceIndex(task.level || task.pace);
      const paceDistance = Math.abs(taskPaceIndex - targetPaceIndex);
      const overCapacity = Math.max(0, taskPaceIndex - maxPaceIndex);
      let score = 10;

      score -= paceDistance * 0.85;
      score -= overCapacity * 3.5;
      score -= Math.max(0, task.effort - 3.5) * (maxPaceIndex <= paceIndex("steady") ? 1.3 : 0.45);
      score -= Math.max(0, task.friction - 3.5) * (maxPaceIndex <= paceIndex("steady") ? 1.1 : 0.35);
      score += task.mode === targetMode ? 1.8 : -0.25;

      if(targetMode === "support"){
        score -= Math.max(0, taskPaceIndex - targetPaceIndex) * 1.05;
        if(taskPaceIndex < targetPaceIndex && task.mode === "support") score += 1.05;
      }else{
        score += Math.max(0, taskPaceIndex - targetPaceIndex) * 0.45;
        if(task.mode === "stretch" && taskPaceIndex >= targetPaceIndex) score += 0.55;
      }

      score += getHistoryScore(task, history);
      score += randomFn() * 0.45;

      return { task, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.task);
}

function canUseCandidate(candidate, selected, seen, domainCounts, constraints){
  const textKey = normalizeTaskText(candidate.text);
  if(seen.text.has(textKey) || seen.canonical.has(candidate.canonicalKey)) return false;
  if(seen.family.has(candidate.repetitionFamily)) return false;
  if((domainCounts[candidate.domain] || 0) >= constraints.maxDomainCount) return false;
  if(Number.isFinite(constraints.maxPaceIndex) && taskPaceIndex(candidate) > constraints.maxPaceIndex) return false;
  if(selectedHasDuplicateLike(selected, candidate, constraints.maxOverlap)) return false;

  return true;
}

function addCandidate(candidate, selected, seen, domainCounts){
  selected.push({ ...candidate });
  seen.text.add(normalizeTaskText(candidate.text));
  seen.canonical.add(candidate.canonicalKey);
  seen.family.add(candidate.repetitionFamily);
  domainCounts[candidate.domain] = (domainCounts[candidate.domain] || 0) + 1;
}

function chooseCandidate(candidates, selected, seen, domainCounts, mode, constraints){
  return candidates.find((candidate) => {
    if(mode && candidate.mode !== mode) return false;
    return canUseCandidate(candidate, selected, seen, domainCounts, constraints);
  });
}

function composeBoard(candidates, checkin, level, boardStyle){
  const selected = [];
  const seen = { text: new Set(), canonical: new Set(), family: new Set() };
  const domainCounts = {};
  const targetMode = boardModeFromStyle(boardStyle);
  const modeCounts = desiredModeCounts(targetMode, checkin, level);
  const maxPaceIndex = getCapacityCap(checkin, level, boardStyle);
  const constraints = { maxDomainCount: 4, maxOverlap: 0.72, maxPaceIndex };

  const modes = [];
  if(targetMode === "stretch"){
    for(let i = 0; i < modeCounts.stretch; i += 1) modes.push("stretch");
    for(let i = 0; i < modeCounts.support; i += 1) modes.push("support");
  }else{
    for(let i = 0; i < modeCounts.support; i += 1) modes.push("support");
    for(let i = 0; i < modeCounts.stretch; i += 1) modes.push("stretch");
  }

  for(const mode of modes){
    const candidate = chooseCandidate(candidates, selected, seen, domainCounts, mode, constraints);
    if(candidate) addCandidate(candidate, selected, seen, domainCounts);
  }

  for(const candidate of candidates){
    if(selected.length >= VISIBLE_BOARD_COUNT) break;
    if(canUseCandidate(candidate, selected, seen, domainCounts, constraints)){
      addCandidate(candidate, selected, seen, domainCounts);
    }
  }

  const relaxed = { maxDomainCount: 6, maxOverlap: 0.82, maxPaceIndex };
  for(const candidate of candidates){
    if(selected.length >= VISIBLE_BOARD_COUNT) break;
    if(canUseCandidate(candidate, selected, seen, domainCounts, relaxed)){
      addCandidate(candidate, selected, seen, domainCounts);
    }
  }

  for(const candidate of candidates){
    if(selected.length >= 30) break;
    if(canUseCandidate(candidate, selected, seen, domainCounts, relaxed)){
      addCandidate(candidate, selected, seen, domainCounts);
    }
  }

  return selected;
}

export function normalizeBoardStyle(value){
  const style = typeof value === "string" ? value.trim().toLowerCase() : "";
  if(style === "support") return "steady";
  if(style === "stretch") return "challenge";
  return BOARD_STYLES.has(style) ? style : "steady";
}

export function suggestLevelFromCheckin(checkin){
  const mood = typeof checkin?.mood === "string" ? checkin.mood : "okay";
  const energy = typeof checkin?.energy === "string" ? checkin.energy : "okay";
  const body = typeof checkin?.body === "string" ? checkin.body : "manageable";
  const moodWords = Array.isArray(checkin?.moodWords) ? checkin.moodWords : [];
  const words = moodWords.map(w => (w === "Steady" ? "Settled" : w));
  const has = (w) => words.includes(w);
  const hasAny = (...ws) => ws.some(has);
  const tough =
    hasAny("Worn out", "Tired", "Flat", "Overwhelmed", "Anxious", "Irritable");
  const positiveCombo =
    (has("Motivated") && has("Hopeful")) ||
    (has("Motivated") && has("Settled")) ||
    (has("Hopeful") && has("Settled"));

  const energyScore = {
    verylow: 0.6,
    low: 1.8,
    okay: 3.0,
    high: 3.7,
  }[energy] ?? 3.0;

  const bodyScore = {
    tender: -0.9,
    achey: -0.45,
    manageable: 0.35,
    great: 0.9,
  }[body] ?? 0.35;

  const moodScore = {
    low: -0.85,
    okay: 0,
    good: 0.35,
  }[mood] ?? 0;

  const wordScoreMap = {
    "Worn out": -2.6,
    Tired: -0.75,
    Flat: -0.75,
    Overwhelmed: -1.35,
    Anxious: -1.35,
    Irritable: -0.9,
    Restless: 0.1,
    Tender: -0.45,
    Okay: 0,
    Settled: 0.45,
    Hopeful: 0.7,
    Motivated: 1,
  };

  const averagedWordScore = words.length
    ? words
        .map((word) => wordScoreMap[word] ?? 0)
        .reduce((total, value) => total + value, 0) / words.length
    : 0;

  let score = energyScore + bodyScore + moodScore + averagedWordScore;

  if(positiveCombo) score += 0.45;
  if(has("Hopeful") && has("Settled")) score += 0.15;
  if(has("Overwhelmed") && has("Restless")) score -= 0.7;
  if(has("Tender")) score -= 0.2;
  if(mood === "low" && body === "tender") score -= 0.35;

  let suggested = scoreToPace(score);

  if(has("Worn out")) suggested = "rest";
  if(hasAny("Overwhelmed", "Anxious") && has("Restless")) suggested = clampPace(suggested, "gentle");
  if(has("Irritable")) suggested = clampPace(suggested, "light");
  if(tough) suggested = clampPace(suggested, "steady");
  if(body !== "manageable" && body !== "great") suggested = clampPace(suggested, "steady");
  if(mood === "low" && body === "tender") suggested = clampPace(suggested, "gentle");

  const canBeCapable =
    (body === "manageable" || body === "great") &&
    mood !== "low" &&
    !hasAny("Worn out", "Overwhelmed", "Anxious");

  if(!canBeCapable) suggested = clampPace(suggested, "steady");

  const canBeBrave =
    energy === "high" &&
    (body === "manageable" || body === "great") &&
    mood === "good" &&
    !tough &&
    has("Motivated") &&
    (has("Hopeful") || has("Settled"));

  if(!canBeBrave) suggested = clampPace(suggested, "capable");

  return suggested;
}

export function generateOptions(level){
  const pool = TASK_LIBRARY[level] || TASK_LIBRARY.gentle;
  return shuffle(pool).slice(0,30).map(t => materializeTask(t, level));
}

/**
 * Suggests a pool of activities based on the user's checkin state and chosen level.
 * It creates a blended pool of tasks to ensure relevant and safe options.
 * @param {object} checkin - The user's checkin data { mood, energy, body }.
 * @param {string} level - The user's chosen pace for the day.
 * @returns {Array<{text: string, level: string}>} A list of suggested activities.
 */
export function suggestActivities(checkin, level, seed = "", opts = {}) {
  let nextSeed = seed;
  let options = opts;
  if(seed && typeof seed === "object" && !Array.isArray(seed)){
    options = seed;
    nextSeed = seed.seed || "";
  }

  const { energy, mood } = checkin;
  const boardStyle = normalizeBoardStyle(checkin?.boardStyle);
  const nowMs = typeof options?.nowMs === "number" ? options.nowMs : Date.now();
  const eventsByDay = options?.eventsByDay || options?.events || checkin?.events;
  const history = buildLocalHistory(eventsByDay, nowMs);

  // 1. Start with a broad curated catalog, then score toward the selected
  // pace, Support/Stretch style, and local event history.
  let pool = TASK_CATALOG.map((task) => ({ ...task }));

  // 2. Preserve earlier check-in fit signals by gently adding duplicates into
  // the scoring pool. The composer dedupes later, but repeated presence nudges
  // these tasks upward before constraints are applied.
  if (energy === 'verylow') {
    pool.push(...(TASK_LIBRARY.rest || []).map((text) => materializeTask(text, "rest")));
  }
  if (energy === 'low' || mood === 'low') {
    pool.push(...(TASK_LIBRARY.gentle || []).map((text) => materializeTask(text, "gentle")));
  }
  if (energy === 'okay' && mood === 'good' && level === 'steady') {
    pool.push(...(TASK_LIBRARY.capable || []).map((text) => materializeTask(text, "capable")));
  }
  if (energy === 'high' && mood === 'good' && level === 'capable') {
    pool.push(...(TASK_LIBRARY.brave || []).map((text) => materializeTask(text, "brave")));
  }

  // 3. Freshness: hard-suppress exact tasks removed recently or shown in the
  // last day and a half, then dedupe by canonical key before scoring.
  const seen = new Set();
  const uniquePool = [];
  for (const task of pool) {
    if (!task?.text || isFreshlySuppressed(task, history)) continue;
    const key = task.canonicalKey || normalizeTaskText(task.text);
    if (seen.has(key)) continue;
    seen.add(key);
    uniquePool.push(task);
  }

  // Fallback if a tiny or unusual catalog ever gets over-filtered. Keep exact
  // recent repeats suppressed here too; otherwise tired/rest boards collapse
  // back into the old small pool after a few days.
  for (const task of TASK_CATALOG) {
    if(uniquePool.length >= MIN_BOARD_OPTION_POOL) break;
    if(isExactRecentlyShown(task, history)) continue;
    const key = task.canonicalKey || normalizeTaskText(task.text);
    if(seen.has(key)) continue;
    seen.add(key);
    uniquePool.push({ ...task });
  }

  const scored = withSeededScores(uniquePool, nextSeed, checkin, level, boardStyle, history);
  let selected = composeBoard(scored, checkin, level, boardStyle);

  if(selected.length < MIN_BOARD_OPTION_POOL){
    const fillOrder = PACE_FILL_ORDER[level] || PACE_ORDER;
    for (const pace of fillOrder) {
      if (selected.length >= MIN_BOARD_OPTION_POOL) break;
      for(const text of TASK_LIBRARY[pace] || []){
        if(selected.length >= MIN_BOARD_OPTION_POOL) break;
        const task = materializeTask(text, pace);
        if(!fitsCapacity(task, checkin, level, boardStyle)) continue;
        if(isExactRecentlyShown(task, history)) continue;
        if(selectedHasDuplicateLike(selected, task)) continue;
        selected.push(task);
      }
    }
  }

  if(selected.length < MIN_BOARD_OPTION_POOL){
    for (const pace of PACE_ORDER) {
      if (selected.length >= MIN_BOARD_OPTION_POOL) break;
      for(const text of TASK_LIBRARY[pace] || []){
        if(selected.length >= MIN_BOARD_OPTION_POOL) break;
        const task = materializeTask(text, pace);
        if(!fitsCapacity(task, checkin, level, boardStyle)) continue;
        if(isExactRecentlyShown(task, history)) continue;
        if(selectedHasDuplicateLike(selected, task)) continue;
        selected.push(task);
      }
    }
  }

  if(selected.length < MIN_BOARD_OPTION_POOL){
    const fallbackTasks = TASK_CATALOG
      .filter((task) => fitsCapacity(task, checkin, level, boardStyle))
      .map((task) => ({ task, lastShownTs: getExactLastShownTs(task, history) }))
      .sort((a, b) => a.lastShownTs - b.lastShownTs)
      .map((entry) => entry.task);
    const staleRepeatCutoff = addDaysAgo(nowMs, 14);
    const staleFallbackTasks = fallbackTasks.filter((task) => getExactLastShownTs(task, history) < staleRepeatCutoff);

    const targetMode = boardModeFromStyle(boardStyle);
    const targetCounts = desiredModeCounts(targetMode, checkin, level);
    const desiredModes = [];
    if(targetMode === "stretch"){
      for(let i = 0; i < targetCounts.stretch; i += 1) desiredModes.push("stretch");
      for(let i = 0; i < targetCounts.support; i += 1) desiredModes.push("support");
    }else{
      for(let i = 0; i < targetCounts.support; i += 1) desiredModes.push("support");
      for(let i = 0; i < targetCounts.stretch; i += 1) desiredModes.push("stretch");
    }

    const appendFallbackTask = (task) => {
      if(selectedHasDuplicateLike(selected, task)) return false;
      selected.push({ ...task });
      return true;
    };

    for(const mode of desiredModes){
      if(selected.length >= MIN_BOARD_OPTION_POOL) break;
      const task = staleFallbackTasks.find((candidate) => (
        candidate.mode === mode &&
        !selectedHasDuplicateLike(selected, candidate)
      ));
      if(task) appendFallbackTask(task);
    }

    for(const task of staleFallbackTasks){
      if(selected.length >= MIN_BOARD_OPTION_POOL) break;
      appendFallbackTask(task);
    }

    for(const mode of desiredModes){
      if(selected.length >= MIN_BOARD_OPTION_POOL) break;
      const task = fallbackTasks.find((candidate) => (
        candidate.mode === mode &&
        !selectedHasDuplicateLike(selected, candidate)
      ));
      if(task) appendFallbackTask(task);
    }

    for(const task of fallbackTasks){
      if(selected.length >= MIN_BOARD_OPTION_POOL) break;
      appendFallbackTask(task);
    }
  }

  const visibleBoard = rebalanceTowardMode(selected.slice(0, VISIBLE_BOARD_COUNT), boardModeFromStyle(boardStyle), history, nowMs, checkin, level, boardStyle);
  const visibleKeys = new Set(visibleBoard.map((task) => task.canonicalKey));
  selected = [
    ...visibleBoard,
    ...selected.slice(VISIBLE_BOARD_COUNT).filter((task) => !visibleKeys.has(task.canonicalKey)),
  ];

  return selected.slice(0, 30).map((task) => ({
    ...task,
    text: task.text,
    level: task.level || task.pace || level,
  }));
}

export function dailyMessageFromCheckin(checkin, level){
  const moodWords = checkin?.moodWords || [];
  const energy = checkin?.energy;
  const body = checkin?.body;

  const has = (w) => moodWords.includes(w);

  const depleted = energy === "verylow" || has("Worn out");
  // Back-compat: older check-ins may still include "Flat".
  const drained = energy === "low" || has("Tired") || has("Flat");
  const wired = energy === "high" || has("Restless");
  // "Overwhelmed" replaced "Anxious" in the UI, but we keep both for older saved check-ins.
  const overwhelmed = has("Overwhelmed") || has("Anxious");
  const irritable = has("Irritable");
  const hopeful = has("Hopeful") || has("Settled") || has("Steady") || has("Motivated");

  const tender = body === "tender";
  const sore = body === "achey";

  // Priority rules: safety/soothing first.
  if(depleted || tender){
    return {
      a: "Let today be small.",
      b: "Comfort matters. Choose the simplest version that helps."
    };
  }

  if(wired && overwhelmed){
    return {
      a: "High energy can still need softness.",
      b: "Pick one grounding step, then give your nervous system a pause."
    };
  }

  if(irritable){
    return {
      a: "Protect your edges today.",
      b: "Choose low-friction tasks. Reduce noise. Keep decisions tiny."
    };
  }

  if(overwhelmed){
    return {
      a: "We can keep today simple.",
      b: "One small step at a time. No urgency needed."
    };
  }

  if(drained || sore){
    return {
      a: "Steady can be supportive.",
      b: "Aim for a small win and stop early if you need to."
    };
  }

  if(hopeful){
    return {
      a: "There’s a little steadiness here.",
      b: "Use it for one helpful step that makes tomorrow easier."
    };
  }

  // Default by chosen pace.
  switch(level){
    case "rest":
      return { a: "Rest is a valid plan.", b: "Nothing to prove today. Comfort counts." };
    case "gentle":
      return { a: "Small is enough.", b: "Pick the easiest next step. Stop when it’s done." };
    case "light":
      return { a: "Light effort, steady footing.", b: "Choose one easy win, then leave room for rest." };
    case "steady":
      return { a: "A calm rhythm works.", b: "One or two doable things. No pushing." };
    case "capable":
      return { a: "You’ve got some capacity today.", b: "Use it carefully - and leave room for rest." };
    case "brave":
      return { a: "A small stretch can be kind.", b: "Choose a safe challenge, then recover." };
    default:
      return { a: "Meet yourself where you are.", b: "We’ll keep it practical and doable." };
  }
}

// Weekly archetype logic (same as your HTML, just as pure function)
export function weekArchetypeCopy(type){
  switch(type){
    case "Recovering Week":
      return "This week had stops and starts. What mattered most is that you returned. Coming back is a form of strength.";
    case "Resting Week":
      return "This week asked for rest. That’s not a step back - it’s care. Nothing needed fixing here.";
    case "Gentle Week":
      return "You chose small, supportive moments. Those choices matter more than they look. This was a kind way to move through the week.";
    case "Steady Week":
      return "You found a rhythm that worked. Not rushed. Not forced. Just enough, at the right pace.";
    case "Capable Week":
      return "You leaned into what you could handle. That confidence came from listening to yourself. It showed.";
    case "Brave Week":
      return "You chose to stretch, even gently. That takes courage. You showed trust in yourself this week.";
    default:
      return "We’ll meet you where you are again next week.";
  }
}

export function computeWeekArchetype(weekRecords){
  // weekRecords: array of 7 items {checkedIn, level, tasksAdded, tasksDone}

  // Rule 1: Recovering Week (gap >=2 then return)
  let gap = 0;
  let hadReturnAfterGap = false;

  for(const d of weekRecords){
    if(!d.checkedIn){
      gap++;
    }else{
      if(gap >= 2) hadReturnAfterGap = true;
      gap = 0;
    }
  }
  if(hadReturnAfterGap) return "Recovering Week";

  const presentDays = weekRecords.filter(d=>d.checkedIn).length;
  if(presentDays <= 1) return "Resting Week";

  const levelsChosen = weekRecords.filter(d=>d.checkedIn && d.level).map(d=>d.level);
  const counts = {rest:0,gentle:0,light:0,steady:0,capable:0,brave:0};
  for(const l of levelsChosen) if(counts[l] !== undefined) counts[l]++;

  const total = levelsChosen.length || 1;
  const restGentleRatio = (counts.rest + counts.gentle) / total;
  const steadyRatio = (counts.light + counts.steady) / total;
  const capableRatio = counts.capable / total;
  const braveRatio = counts.brave / total;

  const taskDays = weekRecords.filter(d=>d.tasksAdded > 0).length;

  if(presentDays <= 2 && restGentleRatio >= 0.6) return "Resting Week";
  if(restGentleRatio >= 0.6 && capableRatio < 0.2 && braveRatio < 0.15) return "Gentle Week";
  if(presentDays >= 4 && (steadyRatio >= 0.35 || taskDays >= 3)) return "Steady Week";
  if(presentDays >= 5 && capableRatio >= 0.3 && taskDays >= 3) return "Capable Week";
  if(braveRatio >= 0.2 && presentDays >= 4) return "Brave Week";

  return "Gentle Week";
}

export function explainWeekArchetype(weekRecords){
  const archetype = computeWeekArchetype(weekRecords);

  let gap = 0;
  let maxGap = 0;
  let hadReturnAfterGap = false;
  for(const d of weekRecords){
    if(!d.checkedIn){
      gap++;
      if(gap > maxGap) maxGap = gap;
    }else{
      if(gap >= 2) hadReturnAfterGap = true;
      gap = 0;
    }
  }

  const presentDays = weekRecords.filter(d=>d.checkedIn).length;
  const taskDays = weekRecords.filter(d=>d.tasksAdded > 0).length;

  const levelsChosen = weekRecords.filter(d=>d.checkedIn && d.level).map(d=>d.level);
  const counts = {rest:0,gentle:0,light:0,steady:0,capable:0,brave:0};
  for(const l of levelsChosen) if(counts[l] !== undefined) counts[l]++;

  const total = levelsChosen.length || 1;
  const steadyRatio = (counts.light + counts.steady) / total;

  switch(archetype){
    case "Recovering Week":
      return `You checked in again after a ${Math.max(2, maxGap)}-day gap.`;
    case "Resting Week":
      if(presentDays <= 1) return `Only ${presentDays}/7 check-ins this week.`;
      return `A lot of your check-ins were Rest or Gentle (${counts.rest + counts.gentle} of ${levelsChosen.length || 0}).`;
    case "Gentle Week":
      return `Most check-ins leaned Rest or Gentle (${counts.rest + counts.gentle} of ${levelsChosen.length || 0}).`;
    case "Steady Week":
      if(steadyRatio >= 0.35) return `You showed up ${presentDays}/7 days with a steadier pace mix (${counts.light + counts.steady} Light/Steady).`;
      return `You showed up ${presentDays}/7 days and added activities on ${taskDays} days.`;
    case "Capable Week":
      return `You showed up ${presentDays}/7 days, chose Capable ${counts.capable} time(s), and added activities on ${taskDays} days.`;
    case "Brave Week":
      return `You chose Brave ${counts.brave} time(s) and showed up ${presentDays}/7 days.`;
    default:
      if(hadReturnAfterGap) return `You checked in again after some time away.`;
      return `Based on your check-ins and chosen paces this week.`;
  }
}
