import { trimEventDays, PREFERENCE_BUCKET } from "./events.js";
import { sanitizeLearningEvent } from "./activityState.js";

// Leave headroom for JSONB overhead below the database's 256 KiB events limit.
const MAX_EVENT_BYTES = 128 * 1024;
const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).length;

function compactOutcome(event) {
  const compact = value => {
    const out = { ...value };
    for (const key of ["setup", "requirementsSource", "metadataSource", "location", "canDoSeated", "physicalEffort", "durationKind", "durationMinutes"]) delete out[key];
    return out;
  };
  const out = compact(event);
  if (event.activities) out.activities = event.activities.map(compact);
  return out;
}

export function sanitizeEventsForSync(events, nowMs = Date.now()) {
  const trimmed = trimEventDays(events, 90, nowMs);
  const next = {};
  const preferences = (trimmed[PREFERENCE_BUCKET] || []).map(sanitizeLearningEvent).filter(Boolean);
  if (preferences.length) next[PREFERENCE_BUCKET] = preferences;
  let size = bytes(next);
  if (size > MAX_EVENT_BYTES) throw new Error("activity_preferences_too_large");
  const ordinary = Object.entries(trimmed).filter(([day]) => day !== PREFERENCE_BUCKET)
    .flatMap(([day, list]) => list.map(sanitizeLearningEvent).filter(Boolean).map(compactOutcome).map(event => ({ day, event })));
  // Outcomes outlive passive impressions. Recent exposures retain freshness while
  // old exposure telemetry may be compacted without erasing explicit choices.
  const priority = event => {
    if (!["activityViewed", "activityShown"].includes(event.type)) return 1;
    return event.ts > nowMs - 7 * 86400000 ? 0 : 2;
  };
  ordinary.sort((a, b) => priority(a.event) - priority(b.event) || b.event.ts - a.event.ts);
  for (const { day, event } of ordinary) {
    if ((next[day]?.length || 0) >= 250) continue;
    const cost = bytes(event) + day.length + 8;
    if (size + cost > MAX_EVENT_BYTES) continue;
    size += cost;
    (next[day] ||= []).push(event);
  }
  for (const list of Object.values(next)) list.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return next;
}

export function mergeActivityEvents(local = {}, remote = {}, nowMs = Date.now()) {
  const merged = {};
  for (const source of [local, remote]) {
    for (const [day, list] of Object.entries(source || {})) {
      if (!Array.isArray(list)) continue;
      const byId = new Map((merged[day] || []).map(event => [event.id, event]));
      for (const event of list) if (event?.id && !byId.has(event.id)) byId.set(event.id, event);
      merged[day] = [...byId.values()];
    }
  }
  return trimEventDays(merged, 90, nowMs);
}
