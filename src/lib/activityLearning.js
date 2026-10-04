import { activityKey, sameActivity } from "./activityPolicy.js";

const DAY = 86400000;
export const ACTIVITY_FEEDBACK = ["helped", "not_today", "too_much", "not_for_me"];

export function activityEvents(events = {}) {
  return Object.values(events).flatMap(list => Array.isArray(list) ? list : [])
    .filter(event => event && typeof event === "object")
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0) || String(a.id || "").localeCompare(String(b.id || "")));
}

export function learningPreferences(events, nowMs = Date.now()) {
  const favorites = new Map();
  const hidden = new Map();
  const helpful = new Map();
  const temporary = [];
  for (const event of activityEvents(events)) {
    if (!Number.isFinite(event.ts) || event.ts <= 0 || event.ts > nowMs + 300000) continue;
    if (!event.text) continue;
    const key = activityKey(event);
    if (event.type === "activityPreference") {
      const map = event.preference === "favorite" ? favorites : event.preference === "hidden" ? hidden : null;
      if (map) map.set(key, event);
    }
    if (event.type === "activityFeedback" && event.feedback === "helped" && event.ts > nowMs - 30 * DAY) helpful.set(key, event);
    if (event.type === "activityFeedback" && ["not_today", "too_much"].includes(event.feedback) && event.ts > nowMs - DAY) temporary.push(event);
    if (event.type === "activityRemoved" && !event.done && event.ts > nowMs - 7 * DAY) temporary.push(event);
  }
  return {
    favorites: [...favorites.values()].filter(event => event.value === true),
    hidden: [...hidden.values()].filter(event => event.value === true),
    helpful: [...helpful.values()],
    temporary,
  };
}

export function isActivitySuppressed(activity, preferences) {
  return [...preferences.hidden, ...preferences.temporary].some(item => sameActivity(item, activity));
}

export function latestTaskFeedback(events, task) {
  return activityEvents(events).filter(event => event.type === "activityFeedback" &&
    (event.taskId ? event.taskId === task.id : sameActivity(event, task))).at(-1)?.feedback;
}

// Tombstones are durable too: an old offline snapshot must not undo an unsave/unhide.
export function durablePreferenceEvents(events) {
  const latest = new Map();
  for (const event of activityEvents(events)) {
    if (event.type !== "activityPreference" || !event.text || !["favorite", "hidden"].includes(event.preference) ||
      typeof event.value !== "boolean" || !Number.isFinite(event.ts) || event.ts <= 0) continue;
    latest.set(`${activityKey(event)}:${event.preference}`, event);
  }
  return [...latest.values()];
}
