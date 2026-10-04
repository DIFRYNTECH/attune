import { learningPreferences } from "./activityLearning.js";

function safeEvents(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  const text = typeof value === "string" ? value : value?.text;
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function cleanTaskSnapshot(value) {
  const text = cleanText(value);
  if (!text) return null;

  const out = { text };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of [
      "level",
      "mode",
      "domain",
      "effort",
      "friction",
      "pace",
      "canonicalKey",
      "canonical_key",
      "repetitionFamily",
      "repetition_family",
    ]) {
      if (value[key] !== undefined && value[key] !== "") out[key] = value[key];
    }
  }
  return out;
}

function pushUnique(list, value, limit) {
  const snapshot = cleanTaskSnapshot(value);
  if (!snapshot?.text) return;
  const key = snapshot.text.toLowerCase();
  const existing = list.findIndex((item) => cleanText(item).toLowerCase() === key);
  if (existing >= 0) return;
  list.push(snapshot);
  if (list.length > limit) list.length = limit;
}

export function buildBoardHistoryForAi(eventsByDay, opts = {}) {
  const events = safeEvents(eventsByDay);
  const nowMs = opts.nowMs ?? Date.now();
  const maxDays = Number.isFinite(opts.maxDays) ? Math.max(1, Math.floor(opts.maxDays)) : 21;
  const limits = {
    shown: Number.isFinite(opts.shownLimit) ? Math.max(1, Math.floor(opts.shownLimit)) : 45,
    picked: Number.isFinite(opts.pickedLimit) ? Math.max(1, Math.floor(opts.pickedLimit)) : 30,
    completed: Number.isFinite(opts.completedLimit) ? Math.max(1, Math.floor(opts.completedLimit)) : 30,
    removed: Number.isFinite(opts.removedLimit) ? Math.max(1, Math.floor(opts.removedLimit)) : 30,
  };

  const days = Object.keys(events).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort().reverse();
  const recentShown = [];
  const recentPicked = [];
  const recentCompleted = [];
  const recentRemoved = [];

  for (const day of days) {
    const list = Array.isArray(events[day]) ? [...events[day]] : [];
    list.sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0));

    for (const event of list) {
      if (!Number.isFinite(event?.ts) || event.ts <= nowMs - maxDays * 86400000 || event.ts > nowMs + 300000) continue;
      const type = typeof event?.type === "string" ? event.type : "";
      if (type === "activityShown" || type === "activityViewed") {
        const activities = Array.isArray(event?.activities) ? event.activities : [];
        for (const activity of activities) pushUnique(recentShown, activity, limits.shown);
        continue;
      }
      if (type === "activityPicked") pushUnique(recentPicked, event, limits.picked);
      if (type === "activityCompleted") pushUnique(recentCompleted, event, limits.completed);
      if (type === "activityRemoved" && !event.done && event.ts > nowMs - 7 * 86400000) pushUnique(recentRemoved, event, limits.removed);
    }
  }

  const preferences = learningPreferences(events, nowMs);
  return {
    recentShown,
    recentPicked,
    recentCompleted,
    recentRemoved,
    recentHelpful: preferences.helpful.slice(-30),
    favorites: preferences.favorites,
    excluded: [...preferences.hidden, ...preferences.temporary],
  };
}
