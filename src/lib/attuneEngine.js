import { TASKS } from "../data/tasks.js";
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

export function normalizeBoardStyle(value){
  const style = typeof value === "string" ? value.trim().toLowerCase() : "";
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
  const pool = TASKS[level] || TASKS.gentle;
  return shuffle(pool).slice(0,30).map(t => ({ text: t, level }));
}

/**
 * Suggests a pool of activities based on the user's checkin state and chosen level.
 * It creates a blended pool of tasks to ensure relevant and safe options.
 * @param {object} checkin - The user's checkin data { mood, energy, body }.
 * @param {string} level - The user's chosen pace for the day.
 * @returns {Array<{text: string, level: string}>} A list of suggested activities.
 */
export function suggestActivities(checkin, level, seed = "") {
  const { energy, mood } = checkin;
  const boardStyle = normalizeBoardStyle(checkin?.boardStyle);

  // 1. Start with a base pool from the selected level.
  let pool = [...(TASKS[level] || TASKS.gentle)];

  if (boardStyle === "challenge") {
    const challengeLevels = CHALLENGE_FILL_ORDER[level] || CHALLENGE_FILL_ORDER.gentle;
    for (const challengeLevel of challengeLevels) {
      pool.push(...(TASKS[challengeLevel] || []));
    }
  }

  // 2. Add tasks from other levels based on check-in data for variety and safety.
  // If energy is very low, always include rest options.
  if (energy === 'verylow') {
    pool.push(...TASKS.rest);
  }
  // If energy is low or mood is low, include gentle options.
  if (energy === 'low' || mood === 'low') {
    pool.push(...TASKS.gentle);
  }
  // If things are generally good, maybe add some from the next level up.
  if (energy === 'okay' && mood === 'good' && level === 'steady') {
    pool.push(...TASKS.capable);
  }
  if (energy === 'high' && mood === 'good' && level === 'capable') {
    pool.push(...TASKS.brave);
  }

  // 3. Create a unique pool and top up short pace lists with nearby paces.
  // The board renders 15 tiles, so every generated board needs at least 15
  // real options. A small buffer prevents one empty placeholder from sneaking
  // in after pinned or repeated activities are removed.
  const seen = new Set();
  const uniquePool = [];
  const addUnique = (tasks) => {
    for (const task of tasks || []) {
      if (!task || seen.has(task)) continue;
      seen.add(task);
      uniquePool.push(task);
    }
  };

  addUnique(pool);

  const fillOrder = PACE_FILL_ORDER[level] || PACE_ORDER;
  for (const pace of fillOrder) {
    if (uniquePool.length >= MIN_BOARD_OPTION_POOL) break;
    addUnique(TASKS[pace]);
  }

  for (const pace of PACE_ORDER) {
    if (uniquePool.length >= MIN_BOARD_OPTION_POOL) break;
    addUnique(TASKS[pace]);
  }

  const randomFn = seed ? createSeededRandom(seed) : Math.random;

  // 4. Shuffle the unique pool and take the first batch.
  // Expanded pool helps the 15-tile board avoid repeats.
  return shuffle(uniquePool, randomFn).slice(0, 30).map(text => {
    // Find the original level of the task for context, defaulting to the chosen level.
    const taskLevel = Object.keys(TASKS).find(l => TASKS[l].includes(text)) || level;
    return { text, level: taskLevel };
  });
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
