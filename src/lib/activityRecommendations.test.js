import assert from "node:assert/strict";
import test from "node:test";
import { TASKS, TASK_CATALOG } from "../data/tasks.js";
import { activityDetails, isActivityEligible, sameActivity } from "./activityPolicy.js";
import { learningPreferences, latestTaskFeedback } from "./activityLearning.js";
import { currentActivityDefinition, preparePickBoard, sanitizeLearningEvent } from "./activityState.js";
import { rankActivities } from "./smartPick.js";
import { buildBoardHistoryForAi } from "./boardHistory.js";
import { makeEvent, trimEventDays } from "./events.js";
import { suggestActivities } from "./attuneEngine.js";
import { selectQualityBoard, evaluateTaskQuality } from "../../server/lib/boardQuality.js";
import { buildCuratedFallbackTasks } from "../../server/services/boardService.js";
import { ACTIVITY_REQUIREMENTS } from "../data/activityRequirements.js";
import { activityContext } from "./activityContext.js";

const nowMs = Date.parse("2026-10-04T12:00:00Z");
const checkin = { mood: "low", energy: "verylow", body: "tender", pace: "rest", boardStyle: "challenge", moodWords: ["Worn out"] };
const task = TASK_CATALOG.find(item => item.canonicalKey === "attune:doodle-shape");

test("saved activity details use current requirements, not stale snapshot metadata", () => {
  const saved = { ...task, text: "Old wording", canDoSeated: false, durationMinutes: null };
  assert.equal(currentActivityDefinition(saved).text, task.text);
  assert.equal(currentActivityDefinition(saved).canDoSeated, true);
  assert.equal(currentActivityDefinition(saved).durationMinutes, 2);
});

test("reworded activities share families, including boards restored from older metadata", () => {
  const pairs = [["activity:pick-one-tiny-comfort-softer-light-quieter-sound-warmer-socks", "activity:choose-one-softer-light-or-sound"],
    ["activity:choose-one-pleasant-thing-to-do-after-this", "attune:pleasant-choice"],
    ["activity:choose-one-hard-but-safe-task-and-make-a-15-minute-start", "activity:choose-one-uncomfortable-but-safe-task-and-do-5-minutes-of-it"],
    ["activity:step-outside-for-3-minutes-and-reset-your-eyes-on-the-sky", "activity:step-outside-and-look-at-the-sky-for-5-minutes"],
    ["activity:prepare-a-simple-snack-or-light-meal", "activity:prepare-a-simple-meal-snack-or-bottle-of-water-for-later"],
    ["activity:do-one-30-minute-focused-block-with-your-phone-away", "activity:do-one-focused-block-and-leave-your-phone-in-another-room"]];
  for (const keys of pairs) {
    const activities = keys.map(key => TASK_CATALOG.find(item => item.canonicalKey === key));
    assert.equal(activities[0].repetitionFamily, activities[1].repetitionFamily);
    const board = preparePickBoard({ today: "2026-10-04", checkin: { pace: "brave", energy: "high" }, level: "brave",
      events: {}, options: activities, boardAssigned: activities.map((item, index) => ({ ...item, repetitionFamily: `old-${index}` })) }, { nowMs }).boardAssigned;
    assert.equal(board.length, 12);
    assert.equal(board.filter(item => keys.includes(item.canonicalKey)).length, 1);
  }
});

test("today's note-directed AI choices are not undone by historical chore preferences", () => {
  const options = TASK_CATALOG.filter(item => ["creativity", "play"].includes(item.domain));
  const chore = TASK_CATALOG.find(item => item.domain === "practical");
  const events = { _preferences: [makeEvent("activityPreference", { ...chore, preference: "favorite", value: true }, nowMs)],
    "2026-10-04": [makeEvent("activityFeedback", { ...chore, feedback: "helped" }, nowMs)] };
  const state = { options, optionsSource: "ai", profile: { useNoteForAi: true }, events, today: "2026-10-04",
    checkin: { pace: "steady", note: "Something playful or creative, without chores" }, level: "steady" };
  const board = preparePickBoard(state, { nowMs }).boardAssigned;
  assert.equal(board.length, 12);
  assert.ok(board.every(item => ["creativity", "play"].includes(item.domain)));
});

test("every catalogue entry has explicit requirements and a bounded timebox", () => {
  for (const item of TASK_CATALOG) {
    assert.equal(item.requirementsSource, "editorial-v2", item.text);
    assert.equal(typeof item.canDoSeated, "boolean", item.text);
    assert.ok(["indoors", "outdoors", "either"].includes(item.location), item.text);
    assert.ok(item.durationMinutes > 0 && item.durationMinutes <= 30, item.text);
    assert.ok(item.physicalEffort >= 1 && item.physicalEffort <= 5, item.text);
  }
  assert.deepEqual(Object.keys(ACTIVITY_REQUIREMENTS).filter(key => !TASK_CATALOG.some(item => item.canonicalKey === key)), []);
});

test("seated and indoor rules use reviewed semantics, never absence of keywords", () => {
  const seated = { pace: "brave", energy: "high", activityConstraints: { seatedOnly: true } };
  for (const text of ["Step into fresh air for 2 minutes", "Try a beginner yoga/stretch video (10 minutes)", "Water a plant"]) {
    assert.equal(isActivityEligible(TASK_CATALOG.find(item => item.text === text), seated), false, text);
  }
  assert.equal(isActivityEligible({ text: "Try an unknown activity", effort: 1 }, seated), false);
  assert.equal(isActivityEligible(task, seated), true);
  assert.equal(activityDetails({ text: "Set a 7-minute timer and tidy" }).durationMinutes, 7);
  const selected = selectQualityBoard({ candidates: [], fallbackTasks: TASK_CATALOG, checkin: seated, targetCount: 12 }).tasks;
  assert.equal(selected.length, 12);
  assert.ok(selected.every(item => item.canDoSeated === true));
});

test("saved activities get rotation instead of permanent priority", () => {
  const options = [task, TASK_CATALOG.find(item => item.canonicalKey === "attune:word-game"), TASK_CATALOG.find(item => item.canonicalKey === "attune:kind-memory")];
  const events = { "2026-10-03": [makeEvent("activityPreference", { ...task, preference: "favorite", value: true }, nowMs - 3 * 86400000),
    makeEvent("activityViewed", { activities: [task] }, nowMs - 86400000)] };
  assert.notEqual(rankActivities(options, events, { nowMs })[0].canonicalKey, task.canonicalKey);
  assert.equal(learningPreferences(events, nowMs).favorites.length, 1);
});

test("repeated too-much feedback persists under similar capacity without permanently hiding", () => {
  const context = activityContext({ energy: "okay", body: "manageable", pace: "steady" });
  const options = [task, ...TASK_CATALOG.filter(item => item.canonicalKey !== task.canonicalKey)];
  const events = { "2026-10-01": [makeEvent("activityFeedback", { ...task, feedback: "helped", context }, nowMs - 5 * 86400000),
    makeEvent("activityFeedback", { ...task, feedback: "too_much", context }, nowMs - 3 * 86400000),
    makeEvent("activityFeedback", { ...task, feedback: "too_much", context }, nowMs - 2 * 86400000)] };
  const ranked = rankActivities(options, events, { checkin: context, nowMs });
  assert.ok(ranked.findIndex(item => item.canonicalKey === task.canonicalKey) > 10);
  assert.equal(learningPreferences(events, nowMs).hidden.length, 0);
});

test("catalogue identities are bounded and never collide across different activities", () => {
  const identities = new Map();
  for (const item of TASK_CATALOG) {
    assert.ok(item.canonicalKey.length <= 80, item.canonicalKey);
    if (identities.has(item.canonicalKey)) assert.equal(identities.get(item.canonicalKey), item.text);
    identities.set(item.canonicalKey, item.text);
  }
});

test("malformed historical timestamps cannot break preference retention", () => {
  const events = { "2025-01-01": [{ ...task, type: "activityPreference", preference: "favorite", value: true, ts: "invalid" }], "2026-10-04": [] };
  assert.doesNotThrow(() => trimEventDays(events, 1));
});

test("every editorial activity passes the quality gate and keeps explicit setup metadata", () => {
  for (const item of TASK_CATALOG.filter(item => item.metadataSource === "editorial-v1")) {
    assert.equal(evaluateTaskQuality(item).rejected, false, item.text);
    const selected = selectQualityBoard({ candidates: [item], checkin: { energy: "high", pace: "brave" }, targetCount: 1 });
    assert.equal(selected.tasks[0]?.setup, item.setup, item.text);
  }
});

test("removing completed items is not dislike, and old removals expire for AI and local learning", () => {
  const events = { "2026-10-04": [makeEvent("activityRemoved", { ...task, done: true }, nowMs),
    makeEvent("activityRemoved", { text: "Old activity" }, nowMs - 8 * 86400000)] };
  const history = buildBoardHistoryForAi(events, { nowMs });
  assert.deepEqual(history.recentRemoved, []);
  assert.deepEqual(history.excluded, []);
  assert.equal(learningPreferences(events, nowMs).temporary.length, 0);
});

test("capacity and constraints are hard limits for local and server boards", () => {
  const demanding = { text: "Do a 30-minute focused block on a work project", effort: 1, friction: 1, mode: "stretch", canonicalKey: "bad", repetitionFamily: "bad" };
  assert.equal(isActivityEligible(demanding, checkin), false);
  const result = selectQualityBoard({ candidates: [demanding], fallbackTasks: TASK_CATALOG, checkin, targetCount: 12 });
  assert.equal(result.tasks.length, 12);
  assert.equal(result.tasks.some(item => item.canonicalKey === "bad"), false);
  for (const item of result.tasks) assert.ok(isActivityEligible(item, checkin));
  const constrained = { ...checkin, activityConstraints: { maxMinutes: 5, seatedOnly: true, indoorsOnly: true } };
  for (const item of suggestActivities(constrained, "rest", "test", { nowMs })) assert.ok(isActivityEligible(item, constrained));
  assert.equal(isActivityEligible({ text: "Take a walk outside for 2 minutes", effort: 1 }, constrained), false);
});

test("duration is not effort and setup cues do not claim a window requires going outside", () => {
  const lights = TASK_CATALOG.find(item => item.text.startsWith("Soften the lights"));
  assert.equal(lights.mode, "support");
  assert.equal(lights.effort, 1);
  assert.equal(activityDetails({ text: "Look out of a window for 2 minutes" }).outside, false);
  assert.equal(activityDetails({ text: "Read something you enjoy" }).durationMinutes, null);
});

test("fallback catalogue produces complete boards across capacity and style cases", () => {
  for (const level of ["rest", "gentle", "steady", "brave"]) {
    for (const boardStyle of ["steady", "challenge"]) {
      const current = { ...checkin, pace: level, boardStyle };
      const result = selectQualityBoard({ candidates: [], fallbackTasks: buildCuratedFallbackTasks({ tasksByLevel: TASKS, level, boardStyle }), checkin: current, targetCount: 12 });
      assert.equal(result.tasks.length, 12, `${level}/${boardStyle}`);
      assert.ok(result.tasks.every(item => item.canonicalKey && item.repetitionFamily));
    }
  }
});

test("history limits retain newest events rather than oldest", () => {
  const events = { "2026-10-04": [1, 2, 3].map(n => ({ type: "activityPicked", ts: nowMs - 1000 + n, text: `Task ${n}` })) };
  assert.deepEqual(buildBoardHistoryForAi(events, { pickedLimit: 2, nowMs }).recentPicked.map(item => item.text), ["Task 3", "Task 2"]);
});

test("a completed success is not penalized as an ignored recommendation", () => {
  const fresh = evaluateTaskQuality(task).score;
  const completed = evaluateTaskQuality(task, { boardHistory: { recentShown: [task], recentPicked: [task], recentCompleted: [task] } }).score;
  assert.ok(completed >= fresh);
});

test("temporary feedback expires while explicit hiding and saving remain durable", () => {
  const old = nowMs - 150 * 86400000;
  const events = { "2026-05-07": [makeEvent("activityPreference", { ...task, preference: "hidden", value: true }, old)],
    "2026-10-04": [makeEvent("activityFeedback", { ...task, feedback: "not_today" }, nowMs)] };
  const trimmed = trimEventDays(events, 1, nowMs);
  assert.equal(learningPreferences(trimmed, nowMs).hidden.length, 1);
  assert.equal(learningPreferences(trimmed, nowMs + 2 * 86400000).temporary.length, 0);
  const restored = { ...trimmed, "2026-10-05": [makeEvent("activityPreference", { ...task, preference: "hidden", value: false }, nowMs + 86400000)] };
  assert.equal(learningPreferences(trimEventDays(restored, 1, nowMs + 86400000), nowMs + 86400000).hidden.length, 0);
});

test("replacement preserves the other recommendations and every My Day item", () => {
  const initial = preparePickBoard({ checkin, level: "rest", today: "2026-10-04", events: {}, options: [], boardAssigned: [], myDay: [{ ...task, id: "done", done: true }] }, { nowMs });
  const rejected = initial.boardAssigned[0];
  const events = { "2026-10-04": [makeEvent("activityFeedback", { ...rejected, feedback: "not_today" }, nowMs)] };
  const next = preparePickBoard({ ...initial, events }, { replace: rejected, nowMs });
  assert.equal(next.boardAssigned.length, 12);
  assert.equal(next.boardAssigned.some(item => sameActivity(item, rejected)), false);
  assert.deepEqual(next.boardAssigned.slice(1), initial.boardAssigned.slice(1));
  assert.deepEqual(next.myDay, initial.myDay);
});

test("sync preserves activity identity, observed exposures, feedback and timestamps without arbitrary payloads", () => {
  const event = makeEvent("activityFeedback", { ...task, id: "task-id", taskId: "task-id", feedback: "helped", secret: "drop-me" }, nowMs);
  assert.notEqual(event.id, "task-id");
  const clean = sanitizeLearningEvent(event);
  assert.equal(clean.canonicalKey, task.canonicalKey);
  assert.equal(clean.ts, nowMs);
  assert.equal(clean.feedback, "helped");
  assert.equal(clean.secret, undefined);
  assert.equal(latestTaskFeedback({ today: [clean] }, { ...task, id: "task-id" }), "helped");
  const exposure = sanitizeLearningEvent(makeEvent("activityViewed", { activities: [task], visibility: "observed" }, nowMs));
  assert.equal(exposure.activities[0].canonicalKey, task.canonicalKey);
});

test("saved identities survive different wording and still leave discovery space", () => {
  const options = TASK_CATALOG.slice(0, 8);
  const events = { "2026-10-04": options.slice(0, 4).map(item => makeEvent("activityPreference", { ...item, text: "Older wording", preference: "favorite", value: true }, nowMs)) };
  const ranked = rankActivities(options, events, { checkin, nowMs });
  assert.ok(ranked.slice(0, 3).some(item => !options.slice(0, 4).some(old => sameActivity(item, old))));
});

test("removed activities are never reintroduced to satisfy Stretch quotas", () => {
  const text = "Watch something light for 10 minutes";
  const eventsByDay = { "2026-10-04": [{ type: "activityRemoved", text, ts: nowMs - 1000 }] };
  const options = suggestActivities(checkin, "rest", "removal", { eventsByDay, nowMs });
  assert.equal(options.some(item => item.text === text), false);
  assert.ok(options.length >= 12);
});
