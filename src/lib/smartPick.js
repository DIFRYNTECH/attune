import { activityKey, normalizeActivityText, isActivityEligible } from "./activityPolicy.js";
import { activityEvents, learningPreferences, isActivitySuppressed } from "./activityLearning.js";
import { activityContext, contextSimilarity } from "./activityContext.js";

const DAY = 86400000;

function indexLearning(events, nowMs, context) {
  const byActivity = new Map();
  const domainDays = new Map();
  const families = new Map();
  for (const event of activityEvents(events)) {
    if (!Number.isFinite(event.ts) || event.ts > nowMs + 300000 || event.ts <= nowMs - 90 * DAY) continue;
    const day = Math.floor(event.ts / DAY);
    const weight = 2 ** (-Math.max(0, nowMs - event.ts) / (7 * DAY));
    const exposure = ["activityViewed", "activityShown"].includes(event.type);
    const items = exposure ? event.activities || [] : [event];
    for (const item of items) {
      const key = activityKey(item);
      if (!key) continue;
      if (!byActivity.has(key)) byActivity.set(key, { views: new Map(), positive: 0, effort: 0 });
      const row = byActivity.get(key);
      // Text aliases support pre-catalogue events while canonical IDs survive copy edits.
      byActivity.set(normalizeActivityText(item), row);
      if (exposure) row.views.set(day, Math.max(event.ts, row.views.get(day) || 0));
      if (event.type === "activityFeedback" && event.feedback === "helped") row.positive = Math.max(row.positive, 2 * weight);
      if (event.type === "activityFeedback" && event.feedback === "too_much") {
        const penalty = 4 * weight * contextSimilarity(event.context, context);
        row.effort = Math.min(8, row.effort + penalty);
        if (item.repetitionFamily) families.set(item.repetitionFamily, Math.min(4, (families.get(item.repetitionFamily) || 0) + penalty * 0.4));
      }
      const interest = event.type === "activityFeedback" && event.feedback === "helped" ? 1
        : event.type === "activityPicked" ? 0.15 : 0;
      if (interest && item.domain) {
        const domainKey = `${item.domain}:${day}`;
        const previous = domainDays.get(domainKey);
        if (!previous || previous.weight < interest * weight) domainDays.set(domainKey, { domain: item.domain, weight: interest * weight });
      }
    }
  }
  const domains = new Map();
  for (const { domain, weight } of domainDays.values()) domains.set(domain, (domains.get(domain) || 0) + weight);
  const strongest = Math.max(0, ...domains.values());
  return { byActivity, domains, strongest, families };
}

export function rankActivities(options, events, { checkin = {}, level, nowMs = Date.now() } = {}) {
  const preferences = learningPreferences(events, nowMs);
  const learning = indexLearning(events, nowMs, activityContext(checkin, level));
  const favorites = new Set(preferences.favorites.flatMap(item => [activityKey(item), normalizeActivityText(item)]));
  const helpfulKeys = new Set(preferences.helpful.flatMap(item => [activityKey(item), normalizeActivityText(item)]));
  const seen = new Set();
  const ranked = (options || []).filter(option => {
    const key = activityKey(option);
    if (!key || seen.has(key) || !isActivityEligible(option, checkin, level) || isActivitySuppressed(option, preferences)) return false;
    seen.add(key);
    return true;
  }).map((option, index) => {
    const stats = learning.byActivity.get(activityKey(option)) || learning.byActivity.get(normalizeActivityText(option));
    const favorite = favorites.has(activityKey(option)) || favorites.has(normalizeActivityText(option));
    const helpful = helpfulKeys.has(activityKey(option)) || helpfulKeys.has(normalizeActivityText(option));
    const recentlyShown = [...(stats?.views.values() || [])].some(ts => ts > nowMs - 7 * DAY);
    const fatigue = [...(stats?.views.values() || [])].reduce((sum, ts) => sum + 6 * 2 ** (-Math.max(0, nowMs - ts) / (3 * DAY)), 0);
    const affinity = learning.strongest ? 6 * (learning.domains.get(option.domain) || 0) / learning.strongest : 0;
    const score = (favorite ? 2 : 0) + (stats?.positive || 0) + affinity
      - fatigue - (!favorite && !helpful && recentlyShown ? 100 : 0)
      - (stats?.effort || 0) - (learning.families.get(option.repetitionFamily) || 0);
    return { option, score, index, familiar: favorite || helpful };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  // Keep the first three varied, with one discovery when familiar options dominate.
  const front = [];
  for (const row of ranked) {
    if (front.length === 3) break;
    if (front.filter(item => item.option.domain === row.option.domain).length >= 2) continue;
    if (front.filter(item => item.familiar).length >= 2 && row.familiar && ranked.some(item => !item.familiar)) continue;
    front.push(row);
  }
  for (const row of ranked) {
    if (front.length === 3) break;
    if (!front.includes(row)) front.push(row);
  }
  return [...front, ...ranked.filter(row => !front.includes(row))].map(row => row.option);
}

export function smartPickPool(options, events, context) {
  return rankActivities(options, events, context);
}

export function getAttuneRecommendedPicks(options, events, context = {}) {
  return rankActivities(options, events, context).slice(0, context.limit || 3);
}
