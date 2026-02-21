import { todayKey } from "./storage";
import { computeWeekArchetype } from "./attuneEngine";
import { computeMomentum } from "./momentum";

const PACE_ORDER = ["rest", "gentle", "light", "steady", "capable", "brave"];

function paceIndex(key) {
  const idx = PACE_ORDER.indexOf(key);
  return idx === -1 ? null : idx;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function dateFromKey(key) {
  if (typeof key !== "string") return null;
  const m = key.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d);
}

function startOfWeekMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - daysSinceMonday);
  return dt;
}

export function weekStartMondayKey(dateKey) {
  const dt = dateFromKey(dateKey);
  if (!dt) return null;
  return todayKey(startOfWeekMonday(dt));
}

export function buildWeekKeysMondayToSundayFromStart(startKey) {
  const start = dateFromKey(startKey);
  if (!start) return [];
  const keys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return todayKey(d);
  });
  return keys;
}

export function buildWeekRecordsFromHistory(history, startKey) {
  const hist = Array.isArray(history) ? history : [];
  const keys = buildWeekKeysMondayToSundayFromStart(startKey);

  return keys.map((date) => {
    const fromHistory = hist.find((r) => r.date === date);
    const base = {
      date,
      checkedIn: false,
      level: null,
      tasksAdded: 0,
      tasksDone: 0,
    };
    return fromHistory ? { ...base, ...fromHistory } : base;
  });
}

export function buildWeekRecordsFromState(state, startKey) {
  const s = safeObject(state);
  const history = Array.isArray(s.history) ? s.history : [];
  const weekRecords = buildWeekRecordsFromHistory(history, startKey);

  const liveToday = todayKey();
  return weekRecords.map((d) => {
    if (d.date !== liveToday) return d;
    return {
      ...d,
      checkedIn: !!s.checkedInToday,
      level: s.level,
      tasksAdded: s.myDay?.length || 0,
      tasksDone: s.myDay?.filter((t) => t.done).length || 0,
    };
  });
}

export function computeWeekSummaryFromWeekRecords(weekRecords, startKey) {
  const records = Array.isArray(weekRecords) ? weekRecords : [];
  const weekStart = typeof startKey === "string" ? startKey : null;
  if (!weekStart) return null;

  const presence = records.filter((d) => !!d?.checkedIn).length;
  const completions = records.reduce((sum, d) => sum + (Number(d?.tasksDone) || 0), 0);

  const checkedInDays = records.filter((d) => !!d?.checkedIn && typeof d?.level === "string");
  let avgPaceIndex = null;
  let avgPace = null;
  if (checkedInDays.length > 0) {
    const indices = checkedInDays
      .map((d) => paceIndex(d.level))
      .filter((x) => typeof x === "number");

    if (indices.length > 0) {
      const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
      const rounded = clamp(Math.round(avg), 0, PACE_ORDER.length - 1);
      avgPaceIndex = rounded;
      avgPace = PACE_ORDER[rounded];
    }
  }

  const weekType = computeWeekArchetype(records);
  const { score: momentum } = computeMomentum(records);

  return {
    weekStart,
    presence,
    completions,
    avgPace,
    avgPaceIndex,
    weekType,
    momentum,
  };
}

export function upsertWeeklySummary(summaries, summary, maxWeeks = 52) {
  const list = Array.isArray(summaries) ? summaries : [];
  if (!summary || typeof summary !== "object") return list;
  if (typeof summary.weekStart !== "string" || !summary.weekStart) return list;

  const next = list.slice();
  const idx = next.findIndex((x) => x?.weekStart === summary.weekStart);

  const clean = {
    weekStart: summary.weekStart,
    presence: Number(summary.presence) || 0,
    completions: Number(summary.completions) || 0,
    avgPace: typeof summary.avgPace === "string" ? summary.avgPace : null,
    avgPaceIndex:
      typeof summary.avgPaceIndex === "number" && Number.isFinite(summary.avgPaceIndex)
        ? clamp(Math.round(summary.avgPaceIndex), 0, PACE_ORDER.length - 1)
        : null,
    weekType: typeof summary.weekType === "string" ? summary.weekType : "Gentle Week",
    momentum: clamp(Number(summary.momentum) || 0, 0, 100),
  };

  if (idx >= 0) {
    const prev = next[idx];
    const unchanged =
      prev?.presence === clean.presence &&
      prev?.completions === clean.completions &&
      prev?.avgPace === clean.avgPace &&
      prev?.avgPaceIndex === clean.avgPaceIndex &&
      prev?.weekType === clean.weekType &&
      prev?.momentum === clean.momentum;

    if (unchanged) return list;
    next[idx] = { ...prev, ...clean };
  } else {
    next.push(clean);
  }

  next.sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));
  const trimmed = next.length > maxWeeks ? next.slice(next.length - maxWeeks) : next;
  return trimmed;
}

function similarityDistance(a, b) {
  const presA = Number(a?.presence) || 0;
  const presB = Number(b?.presence) || 0;
  const compA = Number(a?.completions) || 0;
  const compB = Number(b?.completions) || 0;

  const paceA = typeof a?.avgPaceIndex === "number" ? a.avgPaceIndex : 2;
  const paceB = typeof b?.avgPaceIndex === "number" ? b.avgPaceIndex : 2;

  const dp = Math.abs(presA - presB) / 7;
  const dpace = Math.abs(paceA - paceB) / 5;
  const dc = clamp(Math.abs(compA - compB) / 8, 0, 1);

  // Presence is the strongest driver.
  return 0.6 * dp + 0.25 * dpace + 0.15 * dc;
}

export function findSimilarWeeks(current, priorSummaries, opts) {
  const cur = current;
  const list = Array.isArray(priorSummaries) ? priorSummaries : [];
  const max = typeof opts?.max === "number" ? opts.max : 2;
  const threshold = typeof opts?.threshold === "number" ? opts.threshold : 0.28;

  if (!cur || typeof cur.weekStart !== "string") return [];

  const scored = list
    .filter((x) => x && typeof x.weekStart === "string" && x.weekStart !== cur.weekStart)
    .map((x) => ({ x, d: similarityDistance(cur, x) }))
    .sort((a, b) => a.d - b.d);

  const picked = scored.filter((s) => s.d <= threshold).slice(0, max).map((s) => s.x);
  return picked;
}
