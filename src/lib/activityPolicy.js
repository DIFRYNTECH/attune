export const ACTIVITY_POLICY_VERSION = 2;
export const ACTIVITY_DOMAINS = ["body", "environment", "practical", "connection", "comfort", "regulation", "reflection", "meaning", "progress", "creativity", "play"];

export function normalizeActivityText(value) {
  return String(typeof value === "string" ? value : value?.text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function activityKey(activity) {
  return normalizeActivityText(activity?.canonicalKey || activity?.canonical_key || activity);
}

export function sameActivity(a, b) {
  return activityKey(a) === activityKey(b) || normalizeActivityText(a) === normalizeActivityText(b);
}

export function activityConstraints(value = {}) {
  return {
    maxMinutes: [5, 10, 20].includes(Number(value?.maxMinutes)) ? Number(value.maxMinutes) : 0,
    indoorsOnly: value?.indoorsOnly === true,
    seatedOnly: value?.seatedOnly === true,
  };
}

export function activityDetails(activity) {
  const text = String(activity?.text || "");
  const normalized = normalizeActivityText(text);
  const duration = text.match(/\b(\d+)\s*(?:[-\u2013]\s*(\d+))?\s*[-\u2013]?\s*(?:minutes?|min)\b/i);
  const explicitMinutes = duration ? Number(duration[2] || duration[1]) : /\b(one|a) minute\b/.test(normalized) ? 1 : null;
  const durationMinutes = Number.isFinite(activity?.durationMinutes) && activity.durationMinutes > 0
    ? activity.durationMinutes : explicitMinutes;
  const standingWords = /\b(walk|walking|stand|standing|step|lap|outside|outdoors|shower|cook|cooking)\b/.test(normalized);
  const canDoSeated = typeof activity?.canDoSeated === "boolean" ? activity.canDoSeated : null;
  const requiresStanding = canDoSeated === false || (canDoSeated === null && standingWords);
  const location = ["indoors", "outdoors", "either"].includes(activity?.location) ? activity.location : "unknown";
  const outside = location === "outdoors" || (location === "unknown" && /\b(outside|outdoors|outdoor|fresh air)\b/.test(normalized) && !/\bwindow\b/.test(normalized));
  const physical = /\b(stretch|yoga|strength|mobility|movement|exercise|run|jog|walk)\b/.test(normalized);
  const focus = /\b(focused|workout|hard|run|jog)\b/.test(normalized);
  const passive = /^(soften|turn|dim|listen|watch|rest|sit|hold|look|notice)\b/.test(normalized) && !focus;
  const effortFloor = focus && durationMinutes >= 20 ? 4 : focus ? 3 : physical ? 2 : 1;
  const effort = Math.max(effortFloor, Math.min(5, Number(activity?.effort) || (passive ? 1 : 2)));
  let setup = "";
  if (outside) setup = "Outdoor access";
  else if (/\bwindow\b/.test(normalized)) setup = "A window";
  else if (/\b(call|message|text|voice note|phone|video|podcast)\b/.test(normalized)) setup = "Phone or device";
  else if (/\b(write|draw|doodle|sketch|list|note)\b/.test(normalized)) setup = "Paper or notes";
  else if (/\b(song|music|listen)\b/.test(normalized)) setup = "Something to listen on";
  else if (/\b(drink|water|snack|meal|cook|mug)\b/.test(normalized)) setup = "Drink or food nearby";
  else if (/\b(book|read|pages?)\b/.test(normalized)) setup = "Something to read";
  return {
    durationMinutes,
    timeLabel: durationMinutes ? (durationMinutes < 1 ? `${Math.round(durationMinutes * 60)} sec`
      : activity?.durationKind === "timebox" ? `Up to ${durationMinutes} min`
        : duration?.[2] ? `${duration[1]}-${duration[2]} min` : `${durationMinutes} min`) : "At your pace",
    setup: typeof activity?.setup === "string" ? activity.setup : setup,
    outside,
    location,
    canDoSeated,
    requiresStanding,
    physicalEffort: Number.isFinite(activity?.physicalEffort) ? activity.physicalEffort : physical || requiresStanding ? 2 : 1,
    effort,
    friction: Math.max(effortFloor, Math.min(5, Number(activity?.friction) || effort)),
  };
}

export function activityCapacity(checkin = {}, level) {
  const pace = level || checkin.pace || checkin.level;
  const words = (checkin.moodWords || []).join(" ").toLowerCase();
  if (pace === "rest" || checkin.energy === "verylow" || checkin.body === "tender" || /worn out|overwhelmed|exhausted/.test(words)) return 2;
  if (pace === "gentle" || checkin.energy === "low" || checkin.body === "achey" || /tired|irritable/.test(words)) return 3;
  return ["capable", "brave"].includes(pace) || checkin.energy === "high" ? 4 : 3;
}

export function isActivityEligible(activity, checkin = {}, level) {
  if (!activity?.text) return false;
  const details = activityDetails(activity);
  const cap = activityCapacity(checkin, level);
  const constraints = activityConstraints(checkin.activityConstraints);
  if (details.effort > cap || details.friction > cap + 1) return false;
  if (checkin.body === "tender" && details.physicalEffort > 1) return false;
  if (constraints.indoorsOnly && !["indoors", "either"].includes(details.location)) return false;
  if (constraints.seatedOnly && details.canDoSeated !== true) return false;
  if (constraints.maxMinutes && (!details.durationMinutes || details.durationMinutes > constraints.maxMinutes)) return false;
  return true;
}

export function activityReason(activity, checkin = {}, preferences = {}) {
  const details = activityDetails(activity);
  if ((preferences.favorites || []).some(item => sameActivity(item, activity))) return "One of your saved activities.";
  if ((preferences.helpful || []).some(item => sameActivity(item, activity))) return "You said this helped before.";
  if (checkin.activityConstraints?.maxMinutes && details.durationMinutes && details.durationMinutes <= checkin.activityConstraints.maxMinutes) return `Fits the ${checkin.activityConstraints.maxMinutes} minutes you have today.`;
  if (checkin.activityConstraints?.seatedOnly && !details.requiresStanding) return "An option that does not ask you to stand or walk.";
  if (activityCapacity(checkin) <= 2 && details.effort <= 2) return "A low-effort option for the capacity you checked in with.";
  if (activity.mode === "stretch") return "A small starting point, with room to stop.";
  return "A supportive option for today's check-in.";
}
