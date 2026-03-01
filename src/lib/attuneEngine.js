import { TASKS } from "../data/tasks";
import { LEVELS } from "../data/levels";

export function prettyLevel(key){
  const lvl = LEVELS.find(l => l.key === key);
  return lvl ? `${lvl.emoji} ${lvl.name}` : key;
}

export function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

export function suggestLevelFromCheckin(checkin){
  const mood = typeof checkin?.mood === "string" ? checkin.mood : "okay";
  const energy = typeof checkin?.energy === "string" ? checkin.energy : "okay";
  const body = typeof checkin?.body === "string" ? checkin.body : "manageable";
  const clampLevel = (key, maxKey) => {
    const order = ["rest", "gentle", "light", "steady", "capable", "brave"];
    const i = order.indexOf(key);
    const j = order.indexOf(maxKey);
    if(i === -1 || j === -1) return key;
    return order[Math.min(i, j)];
  };

  const raiseLevel = (key, minKey) => {
    const order = ["rest", "gentle", "light", "steady", "capable", "brave"];
    const i = order.indexOf(key);
    const j = order.indexOf(minKey);
    if(i === -1 || j === -1) return key;
    return order[Math.max(i, j)];
  };

  const moodWords = Array.isArray(checkin?.moodWords) ? checkin.moodWords : [];
  const words = moodWords.map(w => (w === "Steady" ? "Settled" : w));
  const has = (w) => words.includes(w);
  const hasAny = (...ws) => ws.some(has);

  let suggested = "gentle";

  if(energy==="verylow" || mood==="low"){
    suggested = "rest";
    if(body==="manageable" && mood!=="low") suggested = "gentle";
  }else if(energy==="low"){
    suggested = (body==="tender" || mood==="low") ? "gentle" : "steady";
  }else if(energy==="okay"){
    suggested = (mood==="good" && body==="manageable") ? "capable" : "steady";
  }else if(energy==="high"){
    // "High / wired" can be usable energy, but we keep suggestions grounded.
    suggested = (mood==="good" && body==="manageable") ? "capable" : "steady";
  }

  // Mood-word combination nudges (keeps it warm + safe).
  // If the user picked explicitly tough words, we cap intensity.
  const tough =
    hasAny("Worn out", "Tired", "Flat", "Overwhelmed", "Anxious", "Irritable");

  if(has("Worn out")) suggested = "rest";

  // Wired + overwhelmed often needs grounding even if energy is high.
  if(hasAny("Overwhelmed", "Anxious") && has("Restless")){
    suggested = clampLevel(suggested, "gentle");
  }

  if(has("Irritable")){
    suggested = clampLevel(suggested, "gentle");
  }

  if(tough){
    suggested = clampLevel(suggested, "steady");
  }

  // Positive combos can gently raise the default, but never if tough words are present.
  const positiveCombo =
    (has("Motivated") && has("Hopeful")) ||
    (has("Motivated") && has("Settled")) ||
    (has("Hopeful") && has("Settled"));

  if(!tough && body === "manageable" && (energy === "okay" || energy === "high")){
    if(positiveCombo) suggested = raiseLevel(suggested, "capable");
    else if(has("Motivated")) suggested = raiseLevel(suggested, "steady");
  }

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
export function suggestActivities(checkin, level) {
  const { energy, mood } = checkin;

  // 1. Start with a base pool from the selected level.
  let pool = [...(TASKS[level] || TASKS.gentle)];

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

  // 3. Create a unique set of tasks, then convert back to an array.
  const uniquePool = [...new Set(pool)];

  // 4. Shuffle the unique pool and take the first batch.
  // Expanded pool helps the 15-tile board avoid repeats.
  return shuffle(uniquePool).slice(0, 30).map(text => {
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
