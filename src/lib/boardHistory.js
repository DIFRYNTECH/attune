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
  if (existing >= 0) list.splice(existing, 1);
  list.unshift(snapshot);
  if (list.length > limit) list.length = limit;
}

export function buildBoardHistoryForAi(eventsByDay, opts = {}) {
  const events = safeEvents(eventsByDay);
  const maxDays = Number.isFinite(opts.maxDays) ? Math.max(1, Math.floor(opts.maxDays)) : 21;
  const limits = {
    shown: Number.isFinite(opts.shownLimit) ? Math.max(1, Math.floor(opts.shownLimit)) : 45,
    picked: Number.isFinite(opts.pickedLimit) ? Math.max(1, Math.floor(opts.pickedLimit)) : 30,
    completed: Number.isFinite(opts.completedLimit) ? Math.max(1, Math.floor(opts.completedLimit)) : 30,
    removed: Number.isFinite(opts.removedLimit) ? Math.max(1, Math.floor(opts.removedLimit)) : 30,
  };

  const days = Object.keys(events).filter(Boolean).sort().slice(-maxDays).reverse();
  const recentShown = [];
  const recentPicked = [];
  const recentCompleted = [];
  const recentRemoved = [];

  for (const day of days) {
    const list = Array.isArray(events[day]) ? [...events[day]] : [];
    list.sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0));

    for (const event of list) {
      const type = typeof event?.type === "string" ? event.type : "";
      if (type === "activityShown") {
        const activities = Array.isArray(event?.activities) ? [...event.activities].reverse() : [];
        for (const activity of activities) pushUnique(recentShown, activity, limits.shown);
        continue;
      }
      if (type === "activityPicked") pushUnique(recentPicked, event, limits.picked);
      if (type === "activityCompleted") pushUnique(recentCompleted, event, limits.completed);
      if (type === "activityRemoved") pushUnique(recentRemoved, event, limits.removed);
    }
  }

  return {
    recentShown,
    recentPicked,
    recentCompleted,
    recentRemoved,
  };
}
