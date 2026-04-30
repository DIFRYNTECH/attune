function safeEvents(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  const text = typeof value === "string" ? value : value?.text;
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function pushUnique(list, value, limit) {
  const text = cleanText(value);
  if (!text) return;
  const key = text.toLowerCase();
  const existing = list.findIndex((item) => item.toLowerCase() === key);
  if (existing >= 0) list.splice(existing, 1);
  list.unshift(text);
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
      if (type === "activityPicked") pushUnique(recentPicked, event?.text, limits.picked);
      if (type === "activityCompleted") pushUnique(recentCompleted, event?.text, limits.completed);
      if (type === "activityRemoved") pushUnique(recentRemoved, event?.text, limits.removed);
    }
  }

  return {
    recentShown,
    recentPicked,
    recentCompleted,
    recentRemoved,
  };
}
