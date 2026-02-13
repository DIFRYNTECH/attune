import { todayKey } from "./storage";

const DEFAULT_MAX_DAYS = 90;

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function makeEvent(type, payload, nowMs) {
  const ts = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const id = Math.random().toString(16).slice(2) + ts.toString(16);
  const safeType = typeof type === "string" ? type : "";
  const safePayload = safeObject(payload);
  return { id, type: safeType, ts, ...safePayload };
}

export function trimEventDays(eventsByDay, maxDays = DEFAULT_MAX_DAYS) {
  const base = safeObject(eventsByDay);
  const limit =
    typeof maxDays === "number" && Number.isFinite(maxDays) && maxDays > 0
      ? Math.floor(maxDays)
      : DEFAULT_MAX_DAYS;

  const keys = Object.keys(base).filter(Boolean).sort();
  if (keys.length <= limit) return base;

  const keepKeys = keys.slice(-limit);
  const keep = new Set(keepKeys);

  const next = {};
  for (const k of keepKeys) {
    const dayEvents = base[k];
    next[k] = Array.isArray(dayEvents) ? dayEvents : [];
  }

  // Preserve insertion order of keepKeys (already sorted).
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

  return trimEventDays(next, maxDays);
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
