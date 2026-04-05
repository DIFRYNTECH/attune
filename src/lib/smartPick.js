const PACE_ORDER = ["rest", "gentle", "light", "steady", "capable", "brave"];

function paceIndex(key) {
  const idx = PACE_ORDER.indexOf(key);
  return idx === -1 ? 2 : idx; // default ~light
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function weightedSampleWithoutReplacement(items, getWeight) {
  const remaining = Array.isArray(items) ? items.slice() : [];
  const out = [];

  while (remaining.length) {
    let total = 0;
    const weights = new Array(remaining.length);

    for (let i = 0; i < remaining.length; i++) {
      const w = Math.max(0.001, Number(getWeight(remaining[i])) || 0);
      weights[i] = w;
      total += w;
    }

    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }

    out.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return out;
}

export function buildActivityStats(eventsByDay, nowMs = Date.now()) {
  const events = safeObject(eventsByDay);
  const stats = new Map();

  const win7 = nowMs - 7 * 24 * 60 * 60 * 1000;
  const win21 = nowMs - 21 * 24 * 60 * 60 * 1000;

  const pacePicked21 = {
    rest: 0,
    gentle: 0,
    light: 0,
    steady: 0,
    capable: 0,
    brave: 0,
  };

  const ensure = (textKey) => {
    const k = textKey;
    if (!k) return null;
    if (!stats.has(k)) {
      stats.set(k, {
        shown: 0,
        shown7: 0,
        picked: 0,
        completed: 0,
        removed: 0,
        lastShownTs: 0,
        lastPickedTs: 0,
        lastCompletedTs: 0,
        lastRemovedTs: 0,
      });
    }
    return stats.get(k);
  };

  const days = Object.keys(events).filter(Boolean).sort();
  for (const day of days) {
    const list = Array.isArray(events[day]) ? events[day] : [];
    for (const evt of list) {
      const type = typeof evt?.type === "string" ? evt.type : "";
      const ts = typeof evt?.ts === "number" ? evt.ts : 0;

      if (type === "activityShown") {
        const activities = Array.isArray(evt?.activities) ? evt.activities : [];
        for (const a of activities) {
          const key = normText(a);
          const s = ensure(key);
          if (!s) continue;
          s.shown += 1;
          if (ts >= win7) s.shown7 += 1;
          if (ts > s.lastShownTs) s.lastShownTs = ts;
        }
        continue;
      }

      if (type === "activityPicked") {
        const key = normText(evt?.text);
        const s = ensure(key);
        if (s) {
          s.picked += 1;
          if (ts > s.lastPickedTs) s.lastPickedTs = ts;
        }

        if (ts >= win21) {
          const pace = typeof evt?.pace === "string" ? evt.pace : "";
          if (pacePicked21[pace] !== undefined) pacePicked21[pace] += 1;
        }
        continue;
      }

      if (type === "activityCompleted") {
        const key = normText(evt?.text);
        const s = ensure(key);
        if (!s) continue;
        s.completed += 1;
        if (ts > s.lastCompletedTs) s.lastCompletedTs = ts;
        continue;
      }

      if (type === "activityRemoved") {
        const key = normText(evt?.text);
        const s = ensure(key);
        if (!s) continue;
        s.removed += 1;
        if (ts > s.lastRemovedTs) s.lastRemovedTs = ts;
        continue;
      }
    }
  }

  return { stats, pacePicked21 };
}

function computePaceBiasMultiplier(optionLevel, pacePicked21) {
  const counts = pacePicked21 || {};
  const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
  if (total <= 0) return 1;

  const low = (counts.rest || 0) + (counts.gentle || 0);
  const mid = (counts.light || 0) + (counts.steady || 0);
  const high = (counts.capable || 0) + (counts.brave || 0);

  const lowRatio = low / total;
  const highRatio = high / total;

  const idx = paceIndex(optionLevel);

  // If the user overwhelmingly picks Rest/Gentle lately, prefer lower friction.
  if (lowRatio >= 0.6) {
    if (idx >= paceIndex("brave")) return 0.45;
    if (idx >= paceIndex("capable")) return 0.6;
    if (idx >= paceIndex("steady")) return 0.8;
    return 1.1;
  }

  // If they’ve been leaning Capable/Brave, don’t over-protect.
  if (highRatio >= 0.3) {
    if (idx >= paceIndex("brave")) return 1.15;
    if (idx >= paceIndex("capable")) return 1.1;
    if (idx <= paceIndex("gentle")) return 0.9;
    return 1;
  }

  // Otherwise, a mild preference for mid/steady.
  if (mid / total >= 0.4) {
    if (idx === paceIndex("steady") || idx === paceIndex("light")) return 1.08;
  }

  return 1;
}

function computeActivityWeight(option, activityStat, pacePicked21, nowMs) {
  const baseLevel = typeof option?.level === "string" ? option.level : "light";
  const s = activityStat;

  // Default weight when we have no history.
  let w = 1;

  // Difficulty matching (based on what user actually picks lately).
  w *= computePaceBiasMultiplier(baseLevel, pacePicked21);

  if (!s) return clamp(w, 0.05, 4);

  // Up-rank often-completed activities.
  if (s.completed > 0) {
    w *= 1 + Math.min(0.55, s.completed * 0.10);
  }

  // Down-rank repeatedly removed activities.
  if (s.removed > 0) {
    w *= 1 / (1 + Math.min(1.4, s.removed * 0.25));
  }

  // If they keep removing and never completing, strongly avoid.
  if (s.removed >= 2 && s.completed === 0) {
    w *= 0.35;
  }

  // If it’s been shown a lot and never completed, slowly down-rank.
  if (s.shown >= 6 && s.completed === 0) {
    w *= 0.75;
  }

  // Reduce repeats across days: penalize recently-shown options.
  if (s.shown7 >= 1) w *= 0.78;
  if (s.shown7 >= 2) w *= 0.60;
  if (s.shown7 >= 4) w *= 0.40;

  // Recency penalty: avoid re-surfacing something that was just shown.
  const hoursSinceShown = s.lastShownTs ? (nowMs - s.lastShownTs) / (60 * 60 * 1000) : Infinity;
  if (hoursSinceShown <= 36) w *= 0.55;
  else if (hoursSinceShown <= 72) w *= 0.75;

  // Mild exploration: if it’s never been picked, don’t bury it too hard.
  if (s.picked === 0 && s.shown < 4) w *= 1.05;

  return clamp(w, 0.05, 6);
}

export function smartPickPool(options, eventsByDay, ctx) {
  const nowMs = typeof ctx?.nowMs === "number" ? ctx.nowMs : Date.now();
  const { stats, pacePicked21 } = buildActivityStats(eventsByDay, nowMs);

  const opts = Array.isArray(options) ? options.filter((o) => o && o.text) : [];
  if (opts.length <= 1) return opts;

  return weightedSampleWithoutReplacement(opts, (opt) => {
    const key = normText(opt?.text);
    const s = stats.get(key);
    return computeActivityWeight(opt, s, pacePicked21, nowMs);
  });
}

export function getAttuneRecommendedPicks(options, eventsByDay, ctx) {
  const nowMs = typeof ctx?.nowMs === "number" ? ctx.nowMs : Date.now();
  const limit = clamp(Number(ctx?.limit) || 3, 1, 6);
  const { stats, pacePicked21 } = buildActivityStats(eventsByDay, nowMs);

  const opts = Array.isArray(options) ? options.filter((opt) => opt && opt.text) : [];
  if (!opts.length) return [];

  return opts
    .map((opt, idx) => {
      const key = normText(opt?.text);
      const stat = stats.get(key);
      return {
        opt,
        idx,
        weight: computeActivityWeight(opt, stat, pacePicked21, nowMs),
        completed: Number(stat?.completed) || 0,
        picked: Number(stat?.picked) || 0,
        shown7: Number(stat?.shown7) || 0,
      };
    })
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (b.completed !== a.completed) return b.completed - a.completed;
      if (b.picked !== a.picked) return b.picked - a.picked;
      if (a.shown7 !== b.shown7) return a.shown7 - b.shown7;
      return a.idx - b.idx;
    })
    .slice(0, limit)
    .map((entry) => entry.opt);
}
