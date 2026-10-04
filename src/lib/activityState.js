import { TASK_CATALOG } from "../data/tasks.js";
import { suggestActivities } from "./attuneEngine.js";
import { activityKey, sameActivity } from "./activityPolicy.js";
import { rankActivities } from "./smartPick.js";
import { activityContext } from "./activityContext.js";

const TEXT_FIELDS = ["id", "text", "level", "pace", "mode", "domain", "canonicalKey", "repetitionFamily", "setup", "metadataSource", "location", "requirementsSource", "durationKind"];
export function activitySnapshot(item = {}) {
  const out = {};
  for (const key of TEXT_FIELDS) {
    if (typeof item[key] === "string") out[key] = item[key].slice(0, key === "text" ? 140 : 100);
  }
  for (const key of ["effort", "friction", "durationMinutes", "physicalEffort"]) {
    if (Number.isFinite(item[key]) && item[key] > 0) out[key] = Math.min(key === "durationMinutes" ? 60 : 5, item[key]);
  }
  if (typeof item.done === "boolean") out.done = item.done;
  if (typeof item.canDoSeated === "boolean") out.canDoSeated = item.canDoSeated;
  if (item.custom === true) out.custom = true;
  return out;
}

export function sanitizeLearningEvent(event) {
  if (!event?.id || !event.type) return null;
  const source = { ...(event.payload || {}), ...event };
  const out = { ...activitySnapshot(source), id: String(event.id).slice(0, 80), type: String(event.type).slice(0, 40), ts: Number(event.ts || event.at) || 0 };
  for (const key of ["feedback", "preference", "taskId", "visibility"]) {
    if (typeof source[key] === "string") out[key] = source[key].slice(0, 80);
  }
  if (typeof source.value === "boolean") out.value = source.value;
  if (source.context && typeof source.context === "object") out.context = activityContext(source.context);
  if (Array.isArray(source.activities)) out.activities = source.activities.slice(0, 12).map(activitySnapshot).filter(item => item.text);
  return out;
}

export function currentActivityDefinition(item) {
  const known = TASK_CATALOG.find(task => sameActivity(task, item));
  return known ? { ...item, ...known } : item;
}

export function pickPool(state, nowMs = Date.now()) {
  const curated = suggestActivities(state.checkin, state.level, state.today, { eventsByDay: state.events, nowMs });
  const currentOptions = (state.options || []).map(currentActivityDefinition);
  const selectedDomains = new Set(currentOptions.map(item => item.domain));
  // An explicit request for today takes precedence over historical topic affinity.
  const noteDirected = state.optionsSource === "ai" && state.profile?.useNoteForAi === true &&
    state.checkin?.note?.trim() && currentOptions.length >= 3 && selectedDomains.size >= 2;
  const pool = [...currentOptions, ...curated, ...TASK_CATALOG]
    .filter(item => !noteDirected || selectedDomains.has(item.domain));
  return rankActivities(pool, state.events,
    { checkin: state.checkin, level: state.level, nowMs });
}

export function preparePickBoard(state, { replace, nowMs = Date.now() } = {}) {
  const pool = pickPool(state, nowMs);
  const existing = (state.boardAssigned || []).filter(item => item.text && (!replace || !sameActivity(item, replace)));
  const retained = existing.filter(item => pool.some(candidate => sameActivity(candidate, item)));
  const board = [];
  for (const item of retained) {
    const current = activitySnapshot({ ...item, ...pool.find(candidate => sameActivity(candidate, item)) });
    if (board.some(other => sameActivity(other, current) || (current.repetitionFamily && other.repetitionFamily === current.repetitionFamily))) continue;
    board.push(current);
  }
  const keys = new Set(board.map(activityKey));
  const replacementIndex = replace ? (state.boardAssigned || []).findIndex(item => sameActivity(item, replace)) : -1;
  let replaced = false;
  for (const item of pool) {
    if (board.length >= 12) break;
    if (keys.has(activityKey(item)) || (replace && sameActivity(item, replace))) continue;
    if (board.some(other => other.repetitionFamily && other.repetitionFamily === item.repetitionFamily)) continue;
    keys.add(activityKey(item));
    if (replace && !replaced) {
      board.splice(Math.max(0, replacementIndex), 0, activitySnapshot(item));
      replaced = true;
    } else board.push(activitySnapshot(item));
  }
  return { ...state, boardAssigned: board.slice(0, 12) };
}
