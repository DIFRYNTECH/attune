import { todayKey } from "./storage.js";
import { durablePreferenceEvents } from "./activityLearning.js";

const DEFAULT_MAX_DAYS = 90;
export const PREFERENCE_BUCKET = "_preferences";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function makeEvent(type, payload, nowMs) {
  const ts = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const id = Math.random().toString(16).slice(2) + ts.toString(16);
  const safeType = typeof type === "string" ? type : "";
  const safePayload = safeObject(payload);
  return { ...safePayload, id, type: safeType, ts };
}

export function trimEventDays(eventsByDay, maxDays = DEFAULT_MAX_DAYS, nowMs = Date.now()) {
  const base = safeObject(eventsByDay);
  const limit =
    typeof maxDays === "number" && Number.isFinite(maxDays) && maxDays > 0
      ? Math.floor(maxDays)
      : DEFAULT_MAX_DAYS;

  const cutoff = nowMs - limit * 86400000;
  const next = {};
  for (const [day, list] of Object.entries(base)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(list)) continue;
    const kept = list.filter(event => event && event.type !== "activityPreference" &&
      Number.isFinite(event.ts) && event.ts > cutoff && event.ts <= nowMs + 300000);
    if (kept.length) next[day] = kept;
  }
  const preferences = durablePreferenceEvents(base).filter(event => event.ts <= nowMs + 300000);
  if (preferences.length) next[PREFERENCE_BUCKET] = preferences;
  return next;
}

export function appendEvent(eventsByDay, dayKey, event, maxDays = DEFAULT_MAX_DAYS) {
  const base = safeObject(eventsByDay);
  const date = typeof dayKey === "string" && dayKey ? dayKey : todayKey();
  const prevList = Array.isArray(base[date]) ? base[date] : [];

  const next = {
    ...base,
    [date]: [...prevList, event],
  };

  return trimEventDays(next, maxDays, event?.ts || Date.now());
}

export function recordEventOnState(state, type, payload, opts) {
  const s = safeObject(state);
  const date =
    typeof opts?.date === "string" && opts.date
      ? opts.date
      : typeof s.today === "string" && s.today
        ? s.today
        : todayKey();

  const maxDays =
    typeof opts?.maxDays === "number" && Number.isFinite(opts.maxDays) && opts.maxDays > 0
      ? opts.maxDays
      : DEFAULT_MAX_DAYS;

  const evt = makeEvent(type, payload, opts?.nowMs);
  const events = appendEvent(s.events, date, evt, maxDays);

  return { ...s, events };
}
