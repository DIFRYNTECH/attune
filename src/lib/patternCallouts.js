const PACE_ORDER = ["rest", "gentle", "light", "steady", "capable", "brave"];

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function clamp01(n) {
  return clamp(n, 0, 1);
}

function isPace(value) {
  return typeof value === "string" && PACE_ORDER.includes(value);
}

function paceTitle(pace) {
  if (!isPace(pace)) return "";
  return pace.slice(0, 1).toUpperCase() + pace.slice(1);
}

function dayKeyFromDate(d) {
  const dt = new Date(d);
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

function dateFromDayKey(key) {
  if (typeof key !== "string") return null;
  const m = key.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d);
}

function addDays(d, deltaDays) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + deltaDays);
  return dt;
}

function lastNDaysKeys(n, nowDate = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKeyFromDate(addDays(nowDate, -i)));
  }
  return out;
}

function summarizeEvents(eventsByDay, nowMs) {
  const events = safeObject(eventsByDay);

  const checkins = [];

  const pickedByPace = Object.fromEntries(PACE_ORDER.map((p) => [p, 0]));
  const completedByPace = Object.fromEntries(PACE_ORDER.map((p) => [p, 0]));
  const removedByPace = Object.fromEntries(PACE_ORDER.map((p) => [p, 0]));

  const pickedByDay = new Map();
  const completedByDay = new Map();

  const last28 = nowMs - 28 * 24 * 60 * 60 * 1000;

  const byDayKeys = Object.keys(events).filter(Boolean).sort();
  for (const dayKey of byDayKeys) {
    const list = Array.isArray(events[dayKey]) ? events[dayKey] : [];

    let latestCheckin = null;
    for (const evt of list) {
      const type = typeof evt?.type === "string" ? evt.type : "";
      const ts = typeof evt?.ts === "number" ? evt.ts : 0;
      const pace = typeof evt?.pace === "string" ? evt.pace : typeof evt?.payload?.pace === "string" ? evt.payload.pace : null;

      if (type === "checkinSaved") {
        const p = typeof evt?.payload?.pace === "string" ? evt.payload.pace : pace;
        if (isPace(p)) {
          if (!latestCheckin || ts >= (latestCheckin.ts || 0)) {
            latestCheckin = { dayKey, ts, pace: p };
          }
        }
        continue;
      }

      if (type === "activityPicked") {
        const p = typeof evt?.payload?.pace === "string" ? evt.payload.pace : pace;
        if (isPace(p)) pickedByPace[p] += 1;
        if (ts >= last28) pickedByDay.set(dayKey, (pickedByDay.get(dayKey) || 0) + 1);
        continue;
      }

      if (type === "activityCompleted") {
        const p = typeof evt?.payload?.pace === "string" ? evt.payload.pace : pace;
        if (isPace(p)) completedByPace[p] += 1;
        if (ts >= last28) completedByDay.set(dayKey, (completedByDay.get(dayKey) || 0) + 1);
        continue;
      }

      if (type === "activityRemoved") {
        const p = typeof evt?.payload?.pace === "string" ? evt.payload.pace : pace;
        if (isPace(p)) removedByPace[p] += 1;
        continue;
      }
    }

    if (latestCheckin) checkins.push(latestCheckin);
  }

  checkins.sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));

  return {
    checkins,
    pickedByPace,
    completedByPace,
    removedByPace,
    pickedByDay,
    completedByDay,
  };
}

function pickTopNonOverlapping(candidates, max) {
  const picked = [];
  const usedCategories = new Set();

  for (const c of candidates) {
    if (!c) continue;
    if (picked.length >= max) break;
    if (c.category && usedCategories.has(c.category)) continue;
    picked.push({ id: c.id, text: c.text });
    if (c.category) usedCategories.add(c.category);
  }

  return picked;
}

function candidate({ id, category, text, confidence, threshold }) {
  return {
    id,
    category,
    text,
    confidence: clamp01(confidence),
    threshold: clamp01(threshold),
  };
}

function ruleRestAfterBrave(checkins) {
  const list = Array.isArray(checkins) ? checkins : [];
  if (list.length < 6) return null;

  let braveCount = 0;
  let softAfter = 0;

  for (let i = 0; i < list.length - 1; i++) {
    const prev = list[i];
    const next = list[i + 1];
    if (!isPace(prev?.pace) || !isPace(next?.pace)) continue;
    if (prev.pace !== "brave") continue;
    braveCount += 1;
    if (next.pace === "rest" || next.pace === "gentle") softAfter += 1;
  }

  if (braveCount < 3) return null;
  const ratio = softAfter / braveCount;

  const confidence = clamp01((ratio - 0.55) / 0.35) * clamp01(braveCount / 6);
  const threshold = 0.6;
  if (confidence < threshold) return null;

  return candidate({
    id: "rest-after-brave",
    category: "pacing",
    text: "It looks like you often choose Rest or Gentle after Brave days.",
    confidence,
    threshold,
  });
}

function ruleMidweekDip(checkins, nowDate) {
  const recentDays = lastNDaysKeys(56, nowDate);
  const checkinByDay = new Set((Array.isArray(checkins) ? checkins : []).map((c) => c.dayKey));

  const midweek = new Set([2, 3, 4]); // Tue/Wed/Thu

  let totalDays = 0;
  let totalCheckins = 0;
  let midDays = 0;
  let midCheckins = 0;

  for (const dayKey of recentDays) {
    const dt = dateFromDayKey(dayKey);
    if (!dt) continue;
    totalDays += 1;
    const has = checkinByDay.has(dayKey);
    if (has) totalCheckins += 1;

    if (midweek.has(dt.getDay())) {
      midDays += 1;
      if (has) midCheckins += 1;
    }
  }

  if (totalDays < 42 || totalCheckins < 10 || midDays < 18) return null;

  const overallRate = totalCheckins / totalDays;
  const midRate = midCheckins / midDays;
  const gap = overallRate - midRate;

  const confidence = clamp01((gap - 0.15) / 0.30) * clamp01(totalCheckins / 16);
  const threshold = 0.62;
  if (confidence < threshold) return null;

  return candidate({
    id: "midweek-dip",
    category: "schedule",
    text: "Midweek dips look fairly common for you sometimes — that’s okay.",
    confidence,
    threshold,
  });
}

function ruleWeekendSteadier(checkins, nowDate) {
  const recentDays = lastNDaysKeys(56, nowDate);
  const checkinByDay = new Set((Array.isArray(checkins) ? checkins : []).map((c) => c.dayKey));

  const weekend = new Set([0, 6]); // Sun/Sat
  const midweek = new Set([2, 3, 4]);

  let weekendDays = 0;
  let weekendCheckins = 0;
  let midDays = 0;
  let midCheckins = 0;

  for (const dayKey of recentDays) {
    const dt = dateFromDayKey(dayKey);
    if (!dt) continue;
    const has = checkinByDay.has(dayKey);

    if (weekend.has(dt.getDay())) {
      weekendDays += 1;
      if (has) weekendCheckins += 1;
    }

    if (midweek.has(dt.getDay())) {
      midDays += 1;
      if (has) midCheckins += 1;
    }
  }

  if (weekendDays < 12 || midDays < 18) return null;

  const weekendRate = weekendCheckins / weekendDays;
  const midRate = midCheckins / midDays;
  const diff = weekendRate - midRate;

  if (weekendCheckins < 5) return null;

  const confidence = clamp01((diff - 0.18) / 0.30) * clamp01(weekendCheckins / 8);
  const threshold = 0.62;
  if (confidence < threshold) return null;

  return candidate({
    id: "weekend-steadier",
    category: "schedule",
    text: "It looks like weekends are sometimes a bit easier for check-ins.",
    confidence,
    threshold,
  });
}

function ruleCompletionBestPace(pickedByPace, completedByPace) {
  const picked = safeObject(pickedByPace);
  const completed = safeObject(completedByPace);

  const totals = PACE_ORDER.reduce(
    (acc, p) => {
      acc.picked += Number(picked[p]) || 0;
      acc.completed += Number(completed[p]) || 0;
      return acc;
    },
    { picked: 0, completed: 0 },
  );

  if (totals.picked < 18 || totals.completed < 6) return null;

  const overallRate = totals.completed / Math.max(1, totals.picked);

  const rates = PACE_ORDER.map((p) => {
    const pk = Number(picked[p]) || 0;
    const cm = Number(completed[p]) || 0;
    if (pk < 6) return null;
    return { pace: p, picked: pk, completed: cm, rate: cm / Math.max(1, pk) };
  }).filter(Boolean);

  if (rates.length < 2) return null;

  rates.sort((a, b) => b.rate - a.rate);
  const best = rates[0];

  const lift = best.rate - overallRate;
  const confidence = clamp01((lift - 0.12) / 0.25) * clamp01(best.picked / 14);
  const threshold = 0.62;
  if (confidence < threshold) return null;

  return candidate({
    id: "complete-more-on-pace",
    category: "followthrough",
    text: `It looks like you complete more of what you pick on ${paceTitle(best.pace)} pace days.`,
    confidence,
    threshold,
  });
}

function ruleHigherRemoveOnPace(pickedByPace, removedByPace) {
  const picked = safeObject(pickedByPace);
  const removed = safeObject(removedByPace);

  const totals = PACE_ORDER.reduce(
    (acc, p) => {
      acc.picked += Number(picked[p]) || 0;
      acc.removed += Number(removed[p]) || 0;
      return acc;
    },
    { picked: 0, removed: 0 },
  );

  if (totals.picked < 18 || totals.removed < 6) return null;

  const overallRate = totals.removed / Math.max(1, totals.picked);

  const rates = PACE_ORDER.map((p) => {
    const pk = Number(picked[p]) || 0;
    const rm = Number(removed[p]) || 0;
    if (pk < 8 || rm < 3) return null;
    return { pace: p, picked: pk, removed: rm, rate: rm / Math.max(1, pk) };
  }).filter(Boolean);

  if (!rates.length) return null;

  rates.sort((a, b) => b.rate - a.rate);
  const worst = rates[0];

  const lift = worst.rate - overallRate;
  const confidence = clamp01((lift - 0.14) / 0.28) * clamp01(worst.picked / 18);
  const threshold = 0.64;
  if (confidence < threshold) return null;

  return candidate({
    id: "remove-more-on-pace",
    category: "followthrough",
    text: `On ${paceTitle(worst.pace)} pace days, you sometimes change your mind about activities — that can be part of finding what fits.`,
    confidence,
    threshold,
  });
}

function ruleQuietAfterStrongWeeks(weeklySummaries) {
  const list = Array.isArray(weeklySummaries) ? weeklySummaries.slice() : [];
  if (list.length < 6) return null;

  list.sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));

  let strongWeeks = 0;
  let quietAfter = 0;

  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];

    const strong = (Number(a?.momentum) || 0) >= 75 || (Number(a?.presence) || 0) >= 5;
    if (!strong) continue;
    strongWeeks += 1;

    const nextQuiet = (Number(b?.momentum) || 0) <= 45 || (Number(b?.presence) || 0) <= 2;
    if (nextQuiet) quietAfter += 1;
  }

  if (strongWeeks < 3 || quietAfter < 2) return null;

  const ratio = quietAfter / strongWeeks;
  const confidence = clamp01((ratio - 0.45) / 0.35) * clamp01(strongWeeks / 6);
  const threshold = 0.62;
  if (confidence < threshold) return null;

  return candidate({
    id: "quiet-after-strong",
    category: "rhythm",
    text: "After stronger weeks, you often have a quieter one. That can be a normal rhythm.",
    confidence,
    threshold,
  });
}

function ruleMomentumWithPresence(weeklySummaries) {
  const list = Array.isArray(weeklySummaries) ? weeklySummaries.slice() : [];
  if (list.length < 8) return null;

  list.sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));

  const high = list.filter((w) => (Number(w?.presence) || 0) >= 4);
  const low = list.filter((w) => (Number(w?.presence) || 0) <= 2);

  if (high.length < 2 || low.length < 2) return null;

  const avg = (arr, key) => arr.reduce((s, x) => s + (Number(x?.[key]) || 0), 0) / Math.max(1, arr.length);

  const highAvg = avg(high, "momentum");
  const lowAvg = avg(low, "momentum");
  const diff = highAvg - lowAvg;

  const confidence = clamp01((diff - 12) / 35) * clamp01(Math.min(high.length, low.length) / 4);
  const threshold = 0.62;
  if (confidence < threshold) return null;

  return candidate({
    id: "presence-helps",
    category: "consistency",
    text: "It looks like weeks with more check-ins tend to bring a stronger signal for you.",
    confidence,
    threshold,
  });
}

function ruleFollowThroughTrend(pickedByDay, completedByDay, nowDate) {
  const days = lastNDaysKeys(28, nowDate);

  const sumInRange = (startIdx, endIdxExclusive, map) => {
    let s = 0;
    for (let i = startIdx; i < endIdxExclusive; i++) {
      s += Number(map.get(days[i]) || 0);
    }
    return s;
  };

  const pickedPrev = sumInRange(0, 14, pickedByDay);
  const pickedRecent = sumInRange(14, 28, pickedByDay);
  const donePrev = sumInRange(0, 14, completedByDay);
  const doneRecent = sumInRange(14, 28, completedByDay);

  if (pickedPrev < 8 || pickedRecent < 8) return null;

  const ratePrev = donePrev / Math.max(1, pickedPrev);
  const rateRecent = doneRecent / Math.max(1, pickedRecent);
  const lift = rateRecent - ratePrev;

  const confidence = clamp01((lift - 0.12) / 0.25) * clamp01((pickedPrev + pickedRecent) / 30);
  const threshold = 0.64;
  if (confidence < threshold) return null;

  return candidate({
    id: "followthrough-trend",
    category: "trend",
    text: "Lately it looks like follow-through has been a little easier.",
    confidence,
    threshold,
  });
}

export function generatePatternCallouts(input) {
  const weeklySummaries = Array.isArray(input?.weeklySummaries) ? input.weeklySummaries : [];
  const eventsByDay = safeObject(input?.eventsByDay);
  const nowMs = typeof input?.nowMs === "number" ? input.nowMs : Date.now();
  const max = typeof input?.max === "number" ? input.max : 3;

  const nowDate = new Date(nowMs);

  const { checkins, pickedByPace, completedByPace, removedByPace, pickedByDay, completedByDay } = summarizeEvents(
    eventsByDay,
    nowMs,
  );

  const candidates = [
    ruleRestAfterBrave(checkins),
    ruleMidweekDip(checkins, nowDate),
    ruleWeekendSteadier(checkins, nowDate),
    ruleCompletionBestPace(pickedByPace, completedByPace),
    ruleHigherRemoveOnPace(pickedByPace, removedByPace),
    ruleQuietAfterStrongWeeks(weeklySummaries),
    ruleMomentumWithPresence(weeklySummaries),
    ruleFollowThroughTrend(pickedByDay, completedByDay, nowDate),
  ]
    .filter(Boolean)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return pickTopNonOverlapping(candidates, clamp(max, 0, 3));
}
