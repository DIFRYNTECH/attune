import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { TASKS, TASK_CATALOG } from "../src/data/tasks.js";
import { suggestActivities } from "../src/lib/attuneEngine.js";
import { activityDetails, activityKey, activityConstraints, isActivityEligible, sameActivity } from "../src/lib/activityPolicy.js";
import { learningPreferences, isActivitySuppressed } from "../src/lib/activityLearning.js";
import { activitySnapshot, preparePickBoard } from "../src/lib/activityState.js";
import { activityContext } from "../src/lib/activityContext.js";
import { sanitizeEventsForSync } from "../src/lib/activitySync.js";
import { rankActivities } from "../src/lib/smartPick.js";
import { appendEvent, makeEvent, trimEventDays } from "../src/lib/events.js";
import { buildBoardHistoryForAi } from "../src/lib/boardHistory.js";
import { buildBoardRequest, generateBoardWithRetries } from "../server/services/boardService.js";
import { AI_BOARD_VERSION } from "../src/store/storeConstants.js";

const DAY = 86400000;
const START = Date.parse("2026-08-01T10:00:00Z");
const DAYS = 60;
const live = process.argv.includes("--live");
const seeds = live ? [17] : [17, 91];
const routes = live ? ["server-with-live-model"] : ["local", "server-with-stubbed-model"];
const outDir = new URL(live ? "../test-results/recommendation-live60/" : "../test-results/recommendation-simulation/", import.meta.url);
const liveCalls = [];
let liveClient;
let liveConfig;
let lastLiveStartedAt = 0;
if (live) {
  await import("dotenv/config");
  const { default: OpenAI } = await import("openai");
  const { getServerConfig } = await import("../server/config.js");
  liveConfig = getServerConfig();
  if (!liveConfig.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  const sdk = new OpenAI({ apiKey: liveConfig.openAiApiKey, maxRetries: 0, timeout: 45000 });
  liveClient = { chat: { completions: { create: async request => {
    if (liveCalls.length >= 66 || liveCalls.reduce((sum, call) => sum + (call.usage?.total_tokens || 0), 0) >= 1500000) {
      throw new Error("live_simulation_budget_exhausted");
    }
    await delay(Math.max(0, 8000 - (performance.now() - lastLiveStartedAt)));
    lastLiveStartedAt = performance.now();
    const call = { sequence: liveCalls.length + 1, model: request.model };
    liveCalls.push(call);
    const started = performance.now();
    try {
      const response = await sdk.chat.completions.create({ ...request, store: false });
      Object.assign(call, { actualModel: response.model, requestId: response._request_id, usage: response.usage,
        content: response.choices?.[0]?.message?.content, finishReason: response.choices?.[0]?.finish_reason });
      return response;
    } catch (error) {
      Object.assign(call, { status: error.status, code: error.code });
      throw error;
    } finally {
      call.latencyMs = Math.round(performance.now() - started);
      writeFileSync(new URL("provider-responses.json", outDir), JSON.stringify(liveCalls, null, 2));
    }
  } } } };
}
const pct = (n, d) => d ? Math.round(n / d * 10000) / 100 : 0;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
const identity = task => activityKey(task);
const clone = value => JSON.parse(JSON.stringify(value));
const ids = tasks => tasks.map(identity);
const signature = tasks => JSON.stringify(ids(tasks));
const equals = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = text => Number.parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16);

// Proposed product gates, not industry standards. They are declared before the run.
const thresholds = {
  constraintViolations: 0, hiddenLeaks: 0, temporaryLeaks: 0,
  duplicateBoards: 0, replacementFailures: 0, reloadPreferenceFailures: 0,
  unstableRevisits: 0, emptyBoards: 0,
  nonFamiliarSevenDayRepeatPct: 10,
  topThreeWithTwoDomainsPct: 95,
  maximumFeaturedDaysPct: 60,
};

function context(pace = "steady", challenge = false) {
  return {
    pace, mood: pace === "rest" ? "low" : pace === "brave" ? "good" : "okay",
    energy: pace === "rest" ? "verylow" : pace === "gentle" ? "low" : pace === "brave" ? "high" : "okay",
    body: pace === "rest" ? "tender" : "manageable",
    moodWords: pace === "rest" ? ["Worn out"] : pace === "brave" ? ["Motivated", "Hopeful"] : ["Settled"],
    boardStyle: challenge ? "challenge" : "steady", note: "",
  };
}

const personas = [
  { id: "steady-reader", context: () => context(), domains: () => ["creativity", "meaning", "play"] },
  { id: "depleted-seated", context: () => ({ ...context("rest"), activityConstraints: { maxMinutes: 5, seatedOnly: true, indoorsOnly: true } }), domains: () => ["comfort", "regulation"], expand: day => day % 3 === 0 },
  { id: "variable-capacity", context: day => context(["rest", "gentle", "steady", "brave"][day % 4], day % 2 === 1), domains: day => day % 4 < 2 ? ["comfort", "regulation"] : ["practical", "progress", "play"], expand: day => day % 4 === 0 },
  { id: "favorite-loyal", context: () => context(), domains: () => ["comfort", "creativity"], save: true },
  { id: "frequent-decliner", context: () => context("gentle"), domains: () => ["play", "meaning"], reject: true, expand: () => true },
  { id: "changing-interests", context: () => context(), domains: day => day < 30 ? ["creativity", "play"] : ["practical", "meaning", "progress"], expand: () => true },
  { id: "silent-browser", context: () => context(), domains: () => [], silent: true },
  { id: "returning-user", context: () => context("gentle"), domains: () => ["connection", "comfort"], active: day => day < 10 || day >= 40 },
];

// Mirrors the free store's Mon/Wed/Sat seed and check-in signature. React, billing,
// network and calendar rollover are not executed; the real domain modules are.
function localSeed(checkin, today, level) {
  const date = new Date(`${today}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const phase = weekday === 0 || weekday === 6 ? "sat" : weekday >= 3 ? "wed" : "mon";
  date.setUTCDate(date.getUTCDate() - (weekday + 6) % 7);
  const week = date.toISOString().slice(0, 10);
  const sig = JSON.stringify({ v: AI_BOARD_VERSION, mood: checkin.mood, moodWords: checkin.moodWords.slice(0, 2), energy: checkin.energy, body: checkin.body, boardStyle: checkin.boardStyle, note: "", lvl: level, constraints: activityConstraints(checkin.activityConstraints) });
  return `${week}:${phase}|${sig}`;
}

function record(state, type, payload, nowMs) {
  const event = makeEvent(type, type === "activityFeedback" ? { ...payload, context: activityContext(state.checkin, state.level) } : payload, nowMs);
  // Stable event IDs make timestamp ties reproducible across seeded evaluations.
  event.id = `sim-${createHash("sha256").update(JSON.stringify([type, nowMs, payload])).digest("hex").slice(0, 24)}`;
  return { ...state, events: appendEvent(state.events, state.today, event, 90) };
}

async function optionsFor(state, nowMs, route, seed, day) {
  if (route === "local") return suggestActivities(state.checkin, state.level, localSeed(state.checkin, state.today, state.level), { eventsByDay: state.events, nowMs });
  const boardHistory = buildBoardHistoryForAi(state.events, { nowMs });
  const request = buildBoardRequest({ tasksByLevel: TASKS, userId: "synthetic-user", checkin: state.checkin, level: state.level, boardHistory, useNoteForAi: false, totalTaskCount: 12, aiCandidateCount: 50 });
  const candidates = [...request.userPayload.approvedActivities]
    .sort((a, b) => hash(`${seed}:${day}:${a.canonicalKey}`) - hash(`${seed}:${day}:${b.canonicalKey}`)).slice(0, 50);
  const client = liveClient || { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ tasks: candidates.map(task => ({ canonicalKey: task.canonicalKey })) }) } }] }) } } };
  const result = await generateBoardWithRetries(client, { ...request, models: live ? liveConfig.boardModelCandidates.slice(0, 1) : ["offline-id-selection-fixture"], candidateCount: 50, finalCount: 12, totalTaskCount: 12,
    maxCompletionTokens: liveConfig?.boardMaxCompletionTokens, summarizeError: error => ({ message: String(error.code || error.message || "model_request_failed") }) });
  if (!result.ok) throw new Error(`Model contract failed: ${result.error}`);
  return result.tasks;
}

function semanticTokens(task) {
  return new Set(task.text.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(word => word.length > 2 && !["the", "and", "for", "one", "your", "you", "with", "minutes", "minute", "small", "something"].includes(word)));
}

function nearDuplicates(board) {
  const pairs = [];
  for (let a = 0; a < board.length; a += 1) for (let b = a + 1; b < board.length; b += 1) {
    const x = semanticTokens(board[a]);
    const y = semanticTokens(board[b]);
    const overlap = [...x].filter(word => y.has(word)).length;
    if (Math.min(x.size, y.size) >= 3 && overlap / Math.min(x.size, y.size) >= 0.75) pairs.push([board[a].text, board[b].text]);
  }
  return pairs;
}

async function runPersona(persona, route, seed) {
  let state = { events: {}, options: [], boardAssigned: [], myDay: [] };
  const rows = [];
  const failures = { constraintViolations: 0, hiddenLeaks: 0, temporaryLeaks: 0, duplicateBoards: 0, replacementFailures: 0, reloadPreferenceFailures: 0, unstableRevisits: 0, emptyBoards: 0 };
  const lastViewed = new Map();
  const everViewed = new Set();
  const featured = new Map();
  const timing = [];
  let savedCount = 0;
  let hiddenForRestore = null;
  let exposures = 0;
  let nonFamiliarExposures = 0;
  let nonFamiliarRepeats = 0;
  let repeats = 0;
  let novel = 0;
  let replacementChecks = 0;
  let duplicatePairs = 0;
  const duplicateExamples = [];
  for (let day = 0; day < DAYS; day += 1) {
    if (persona.active && !persona.active(day)) continue;
    const nowMs = START + day * DAY;
    const checkin = persona.context(day);
    state = { ...state, today: new Date(nowMs).toISOString().slice(0, 10), checkin, level: checkin.pace,
      optionsSource: route === "local" ? "default" : "ai", options: [], boardAssigned: [], myDay: [] };
    if (day === 45 && hiddenForRestore) state = record(state, "activityPreference", { ...activitySnapshot(hiddenForRestore), preference: "hidden", value: false }, nowMs - 1);
    const begin = performance.now();
    state.options = await optionsFor(state, nowMs, route, seed, day);
    state = preparePickBoard(state, { nowMs });
    timing.push(performance.now() - begin);
    const board = state.boardAssigned;
    const prefs = learningPreferences(state.events, nowMs);
    const eligible = TASK_CATALOG.filter(task => isActivityEligible(task, checkin, state.level) && !isActivitySuppressed(task, prefs));
    failures.constraintViolations += board.filter(task => !isActivityEligible(task, checkin, state.level)).length;
    failures.hiddenLeaks += board.filter(task => prefs.hidden.some(hidden => sameActivity(hidden, task))).length;
    failures.temporaryLeaks += board.filter(task => prefs.temporary.some(hidden => sameActivity(hidden, task))).length;
    failures.duplicateBoards += new Set(ids(board)).size !== board.length ? 1 : 0;
    failures.emptyBoards += board.length < 3 ? 1 : 0;
    const near = nearDuplicates(board);
    duplicatePairs += near.length;
    for (const pair of near) if (duplicateExamples.length < 4 && !duplicateExamples.some(item => equals(item, pair))) duplicateExamples.push(pair);
    const visible = persona.expand?.(day) ? board : board.slice(0, 3);
    const row = {
      day: day + 1, date: state.today, pace: state.level, style: checkin.boardStyle,
      constraints: checkin.activityConstraints || {}, preferredDomains: persona.domains(day),
      eligibleIdentities: new Set(ids(eligible)).size, eligibleFamilies: new Set(eligible.map(task => task.repetitionFamily)).size,
      board: board.map(activitySnapshot), observed: ids(visible), topThreeDomains: new Set(board.slice(0, 3).map(task => task.domain)).size,
      boardDomains: new Set(board.map(task => task.domain)).size,
      desiredDomainHits: board.slice(0, 3).filter(task => persona.domains(day).includes(task.domain)).length,
      repeatedWithinSevenDays: [], familiarTopThree: 0,
    };
    for (const item of board.slice(0, 3)) {
      const key = identity(item);
      const entry = featured.get(key) || { text: item.text, count: 0, days: [] };
      entry.count += 1;
      entry.days.push(day + 1);
      featured.set(key, entry);
      if ([...prefs.favorites, ...prefs.helpful].some(old => sameActivity(old, item))) row.familiarTopThree += 1;
    }
    for (const item of visible) {
      const key = identity(item);
      const familiar = [...prefs.favorites, ...prefs.helpful].some(old => sameActivity(old, item));
      const recent = lastViewed.has(key) && nowMs - lastViewed.get(key) < 7 * DAY;
      exposures += 1;
      if (!familiar) nonFamiliarExposures += 1;
      if (recent) { repeats += 1; row.repeatedWithinSevenDays.push(key); if (!familiar) nonFamiliarRepeats += 1; }
      if (!everViewed.has(key)) novel += 1;
      everViewed.add(key);
      lastViewed.set(key, nowMs);
      state = record(state, "activityViewed", { visibility: "observed", activities: [activitySnapshot(item)] }, nowMs + 100);
    }
    if (!persona.silent) {
      const matches = visible.filter(task => persona.domains(day).includes(task.domain));
      const chosen = matches.length ? matches[hash(`${seed}:${day}`) % matches.length] : visible[0];
      if (chosen) {
        const task = { ...chosen, id: `task-${seed}-${day}`, done: day % 7 !== 5 };
        state.myDay = [task];
        state = record(state, "activityPicked", activitySnapshot(task), nowMs + 200);
        if (task.done) {
          state = record(state, "activityCompleted", { ...activitySnapshot(task), taskId: task.id }, nowMs + 300);
          if (persona.domains(day).includes(task.domain)) state = record(state, "activityFeedback", { ...activitySnapshot(task), taskId: task.id, feedback: "helped" }, nowMs + 400);
        }
        if (persona.save && savedCount < 2 && !prefs.favorites.some(old => sameActivity(old, task))) {
          state = record(state, "activityPreference", { ...activitySnapshot(task), preference: "favorite", value: true }, nowMs + 450);
          savedCount += 1;
        }
        row.chosen = activitySnapshot(task);
      }
      if (persona.reject || day % 9 === 4) {
        const rejected = [...visible].reverse().find(task => !state.myDay.some(chosen => sameActivity(chosen, task)));
        if (rejected) {
          const feedback = persona.reject && day % 7 === 0 ? "not_for_me" : day % 2 === 0 ? "not_today" : "too_much";
          state = record(state, "activityFeedback", { ...activitySnapshot(rejected), feedback }, nowMs + 500);
          if (feedback === "not_for_me") {
            state = record(state, "activityPreference", { ...activitySnapshot(rejected), preference: "hidden", value: true }, nowMs + 501);
            hiddenForRestore ||= rejected;
          }
          const before = clone(state);
          state = preparePickBoard(state, { replace: rejected, nowMs: nowMs + 600 });
          replacementChecks += 1;
          const unchangedOthers = before.boardAssigned.filter(task => !sameActivity(task, rejected));
          const preserved = unchangedOthers.every(task => state.boardAssigned.some(other => sameActivity(task, other)));
          if (!preserved || !equals(state.myDay, before.myDay) || state.boardAssigned.some(task => sameActivity(task, rejected))) failures.replacementFailures += 1;
          row.rejected = { ...activitySnapshot(rejected), feedback };
        }
      }
    }
    const revisit = preparePickBoard(state, { nowMs: nowMs + 700 });
    if (signature(state.boardAssigned) !== signature(revisit.boardAssigned)) failures.unstableRevisits += 1;
    const beforePrefs = learningPreferences(state.events, nowMs + 700);
    const wire = clone(sanitizeEventsForSync(state.events, nowMs + 700));
    const afterPrefs = learningPreferences(wire, nowMs + 700);
    if (!equals(ids(beforePrefs.favorites), ids(afterPrefs.favorites)) || !equals(ids(beforePrefs.hidden), ids(afterPrefs.hidden)) || !equals(ids(beforePrefs.helpful), ids(afterPrefs.helpful))) failures.reloadPreferenceFailures += 1;
    state = clone({ ...state, events: wire });
    row.eventCount = Object.values(state.events).flat().length;
    rows.push(row);
    if (live) {
      writeFileSync(new URL("daily-progress.json", outDir), JSON.stringify(rows, null, 2));
      console.log(`Live day ${day + 1}/${DAYS}: ${board.slice(0, 3).map(task => task.domain).join(", ")}`);
    }
  }
  const top = [...featured.values()].sort((a, b) => b.count - a.count);
  const first = rows.filter(row => row.day <= 10);
  const last = rows.filter(row => row.day > 40);
  const summary = {
    persona: persona.id, route, seed, activeDays: rows.length, recommendations: rows.reduce((sum, row) => sum + row.board.length, 0),
    exposures, uniqueObserved: everViewed.size, novelExposurePct: pct(novel, exposures), sevenDayRepeatPct: pct(repeats, exposures),
    nonFamiliarSevenDayRepeatPct: pct(nonFamiliarRepeats, nonFamiliarExposures), nonFamiliarExposures, nonFamiliarRepeats,
    averageBoardSize: mean(rows.map(row => row.board.length)), minimumEligibleFamilies: Math.min(...rows.map(row => row.eligibleFamilies)),
    topThreeWithTwoDomainsPct: pct(rows.filter(row => row.topThreeDomains >= 2).length, rows.length),
    averageBoardDomains: mean(rows.map(row => row.boardDomains)),
    preferredDomainFirstTenPct: pct(first.reduce((sum, row) => sum + row.desiredDomainHits, 0), first.length * 3),
    preferredDomainLastTwentyPct: pct(last.reduce((sum, row) => sum + row.desiredDomainHits, 0), last.length * 3),
    uniqueTopThreeLastTwenty: new Set(last.flatMap(row => ids(row.board.slice(0, 3)))).size,
    mostFeatured: top.slice(0, 3), maximumFeaturedDaysPct: pct(top[0]?.count || 0, rows.length),
    boardsWithThreeFamiliar: rows.filter(row => row.familiarTopThree === 3).length,
    duplicatePairs, duplicateExamples, replacementChecks, failures,
    p50ComputeMs: Math.round(percentile(timing, 0.5)), p95ComputeMs: Math.round(percentile(timing, 0.95)),
    finalEvents: Object.values(state.events).flat().length, finalStateBytes: Buffer.byteLength(JSON.stringify(state)),
  };
  return { summary, days: rows };
}

function probes() {
  const activity = TASK_CATALOG.find(task => task.canonicalKey === "attune:doodle-shape");
  const another = TASK_CATALOG.find(task => task.canonicalKey === "attune:word-game");
  const nowMs = START + 59 * DAY;
  const preference = makeEvent("activityPreference", { ...activity, preference: "favorite", value: true }, nowMs - 130 * DAY);
  const sparse = { "2026-03-24": [preference, makeEvent("activityViewed", { activities: [activity] }, nowMs - 130 * DAY)], "2026-09-29": [] };
  const trimmed = trimEventDays(sparse, 90, nowMs);
  const sparseHistory = buildBoardHistoryForAi(trimmed, { nowMs });
  const dense = {};
  for (let day = 0; day < 130; day += 1) {
    const ts = nowMs - (129 - day) * DAY;
    dense[new Date(ts).toISOString().slice(0, 10)] = [makeEvent("activityViewed", { activities: [another] }, ts)];
  }
  dense[Object.keys(dense)[0]].push(preference);
  const denseTrimmed = trimEventDays(dense, 90, nowMs);
  const hidden = makeEvent("activityPreference", { ...activity, preference: "hidden", value: true }, nowMs - 59 * DAY);
  const temporary = makeEvent("activityFeedback", { ...another, feedback: "not_today" }, nowMs - 59 * DAY);
  const expired = learningPreferences({ old: [hidden, temporary] }, nowMs);
  const restored = learningPreferences({ old: [hidden, temporary], today: [makeEvent("activityPreference", { ...activity, preference: "hidden", value: false }, nowMs)] }, nowMs + 1);
  const baselineRank = rankActivities(TASK_CATALOG, {}, { checkin: context(), nowMs });
  const success = makeEvent("activityFeedback", { ...another, feedback: "helped" }, nowMs - DAY);
  const learnedRank = rankActivities(TASK_CATALOG, { yesterday: [success] }, { checkin: context(), nowMs });
  const lift = baselineRank.findIndex(task => sameActivity(task, another)) - learnedRank.findIndex(task => sameActivity(task, another));
  const future = nowMs + 2 * DAY;
  const recentlyRejected = { yesterday: [success], today: [makeEvent("activityFeedback", { ...another, feedback: "too_much" }, nowMs)] };
  const neutralFutureRank = rankActivities(TASK_CATALOG, { yesterday: [success] }, { checkin: context(), nowMs: future });
  const rejectedFutureRank = rankActivities(TASK_CATALOG, recentlyRejected, { checkin: context(), nowMs: future });
  const mobilityAudit = TASK_CATALOG.filter(task => isActivityEligible(task, { ...context("brave", true), activityConstraints: { seatedOnly: true, indoorsOnly: true } }))
    .filter(task => /\b(run|jog|workout|strength|yoga|mobility|chore|household|clean|tidy|garden)\b/i.test(task.text))
    .map(task => ({ text: task.text, details: activityDetails(task) }));
  return {
    helpfulRankLift: lift,
    hiddenAfter59Days: expired.hidden.some(task => sameActivity(task, activity)),
    temporaryExpiredAfter59Days: !expired.temporary.some(task => sameActivity(task, another)),
    restoreRemovesHidden: !restored.hidden.some(task => sameActivity(task, activity)),
    denseRetentionOrdinaryDays: Object.values(denseTrimmed).filter(events => events.some(event => event.type !== "activityPreference")).length,
    denseRetentionFavoriteSurvives: learningPreferences(denseTrimmed, nowMs).favorites.some(task => sameActivity(task, activity)),
    sparse130DayExposureStillRetained: Object.values(trimmed).flat().some(event => event.type === "activityViewed"),
    sparse130DayExposureStillSentAsRecent: sparseHistory.recentShown.some(task => sameActivity(task, activity)),
    tooMuchAfter48HoursSameRankAsHelpfulOnly: signature(neutralFutureRank) === signature(rejectedFutureRank),
    mobilitySemanticReviewCandidates: mobilityAudit,
  };
}

const catalogue = {
  entries: TASK_CATALOG.length,
  distinctIdentities: new Set(ids(TASK_CATALOG)).size,
  families: new Set(TASK_CATALOG.map(task => task.repetitionFamily)).size,
  explicitEditorialEntries: TASK_CATALOG.filter(task => task.metadataSource === "editorial-v1").length,
  unknownDurationEntries: TASK_CATALOG.filter(task => !activityDetails(task).durationMinutes).length,
  domains: Object.fromEntries([...new Set(TASK_CATALOG.map(task => task.domain))].map(domain => [domain, TASK_CATALOG.filter(task => task.domain === domain).length])),
};
const sourceFiles = ["src/lib/activityPolicy.js", "src/lib/activityLearning.js", "src/lib/activityState.js", "src/lib/activityContext.js", "src/lib/activitySync.js", "src/lib/attuneEngine.js", "src/lib/smartPick.js", "src/lib/events.js", "src/lib/boardHistory.js", "src/data/tasks.js", "src/data/activityRequirements.js", "src/store/storeConstants.js", "server/services/boardService.js", "server/lib/boardCandidates.js", "server/lib/boardQuality.js", "server/lib/aiUsage.js", "scripts/simulate-recommendations.mjs"];
const fingerprints = Object.fromEntries(sourceFiles.map(path => [path, createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex")]));
const started = performance.now();
const runs = [];
mkdirSync(outDir, { recursive: true });
for (const seed of seeds) for (const route of routes) for (const persona of personas.filter(persona => !live || persona.id === "changing-interests")) {
  const run = await runPersona(persona, route, seed);
  runs.push(run);
  writeFileSync(new URL(`${persona.id}-${route}-${seed}.json`, outDir), JSON.stringify(run, null, 2));
  console.log(`${route} / ${persona.id} / ${seed}: ${run.summary.activeDays} days, ${run.summary.uniqueObserved} unique, ${run.summary.nonFamiliarSevenDayRepeatPct}% non-familiar repeats, most-featured ${run.summary.maximumFeaturedDaysPct}%`);
}
const summary = {
  generatedAt: new Date().toISOString(), virtualStart: new Date(START).toISOString(), virtualDays: DAYS,
  seeds, routes, thresholds, fingerprints, catalogue,
  assumptions: ["Synthetic choices and helpful feedback are scripted, not evidence of real satisfaction or retention.", live ? "Real provider responses through production recommendation services. One synthetic changing-interest persona, not authenticated app HTTP, database or billing traffic." : "The model returns deterministic shuffled approved IDs. No provider, auth, billing, database or HTTP traffic is exercised.", "A daily adapter resets My Day and check-in, matching store rollover fields; React/store lifecycle and timezone behavior are not tested.", "Policy conformance uses the production predicate. Semantic metadata accuracy is assessed separately, not established by that predicate.", "Only actually viewed first-three or expanded options generate exposure history.", live ? "Timings include live provider latency, but exclude Android rendering." : "Measured timings are desktop Node compute times, not Android or network latency."],
  liveProvider: live ? { calls: liveCalls.length, totalTokens: liveCalls.reduce((sum, call) => sum + (call.usage?.total_tokens || 0), 0) } : null,
  totals: { runs: runs.length, activeUserDays: runs.reduce((n, run) => n + run.summary.activeDays, 0), recommendations: runs.reduce((n, run) => n + run.summary.recommendations, 0), exposures: runs.reduce((n, run) => n + run.summary.exposures, 0), replacementChecks: runs.reduce((n, run) => n + run.summary.replacementChecks, 0), runtimeSeconds: Math.round((performance.now() - started) / 1000) },
  failures: Object.fromEntries(Object.keys(runs[0].summary.failures).map(key => [key, runs.reduce((sum, run) => sum + run.summary.failures[key], 0)])),
  runs: runs.map(run => run.summary), probes: probes(),
};
writeFileSync(new URL("summary.json", outDir), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ totals: summary.totals, failures: summary.failures, catalogue, probes: summary.probes }, null, 2));
