import assert from "node:assert/strict";
import test from "node:test";
import { makeEvent, trimEventDays, PREFERENCE_BUCKET } from "./events.js";
import { learningPreferences } from "./activityLearning.js";
import { buildBoardHistoryForAi } from "./boardHistory.js";
import { mergeActivityEvents, sanitizeEventsForSync } from "./activitySync.js";
import { activityContext } from "./activityContext.js";
import { sanitizeLearningEvent } from "./activityState.js";

const nowMs = Date.parse("2026-10-04T10:00:00Z");
const DAY = 86400000;
const task = { text: "A known activity", canonicalKey: "test:activity" };
const pref = (value, ts, preference = "hidden") => makeEvent("activityPreference", { ...task, preference, value }, ts);

test("sparse history expires by elapsed time, not the number of date buckets", () => {
  const old = makeEvent("activityViewed", { activities: [task] }, nowMs - 130 * DAY);
  const input = { "2026-05-27": [old], "2026-10-04": [] };
  assert.deepEqual(trimEventDays(input, 90, nowMs), {});
  assert.deepEqual(buildBoardHistoryForAi(input, { nowMs }).recentShown, []);
});

test("expiry follows timestamps across timezone date buckets and excludes invalid/future events", () => {
  const input = { "2026-10-03": [makeEvent("activityPicked", task, nowMs - DAY + 1)], "2026-10-04": [
    makeEvent("activityPicked", task, nowMs - DAY),
    { ...task, type: "activityPicked", ts: NaN }, makeEvent("activityPicked", task, nowMs + DAY),
  ] };
  assert.equal(Object.values(trimEventDays(input, 1, nowMs)).flat().length, 1);
});

test("preferences survive daily export limits and old tombstones defeat restored snapshots", () => {
  const original = { "2026-05-27": [pref(true, nowMs - 130 * DAY)] };
  const removed = { "2026-05-28": [pref(false, nowMs - 129 * DAY)] };
  const wire = sanitizeEventsForSync(mergeActivityEvents(original, removed, nowMs), nowMs);
  assert.equal(wire[PREFERENCE_BUCKET][0].value, false);
  assert.equal(learningPreferences(mergeActivityEvents(wire, original, nowMs), nowMs).hidden.length, 0);
  const busy = { "2026-10-04": [pref(true, nowMs - 1000), ...Array.from({ length: 260 }, (_, i) =>
    makeEvent("activityViewed", { activities: [task] }, nowMs + i))] };
  assert.equal(learningPreferences(sanitizeEventsForSync(busy, nowMs), nowMs).hidden.length, 1);
});

test("preference merge is commutative, idempotent and deterministic on timestamp ties", () => {
  const a = { "2026-10-04": [{ ...pref(true, nowMs), id: "a" }] };
  const b = { "2026-10-04": [{ ...pref(false, nowMs), id: "b" }] };
  const ab = mergeActivityEvents(a, b, nowMs);
  assert.deepEqual(ab, mergeActivityEvents(b, a, nowMs));
  assert.deepEqual(ab, mergeActivityEvents(ab, a, nowMs));
  assert.equal(learningPreferences(ab, nowMs).hidden.length, 0);
});

test("sync stays within the payload budget without dropping explicit choices", () => {
  const input = { "2026-10-04": [pref(true, nowMs)] };
  for (let day = 0; day < 60; day += 1) {
    const ts = nowMs - day * DAY;
    const key = new Date(ts).toISOString().slice(0, 10);
    (input[key] ||= []).push(...Array.from({ length: 100 }, (_, i) => makeEvent("activityViewed", { activities: [
      { ...task, text: "Detailed activity ".repeat(8), canonicalKey: `task:${i}`, repetitionFamily: `family:${i}`, domain: "play" },
    ] }, ts)));
  }
  const wire = sanitizeEventsForSync(input, nowMs);
  assert.ok(new TextEncoder().encode(JSON.stringify(wire)).length < 128 * 1024);
  assert.equal(learningPreferences(wire, nowMs).hidden.length, 1);
});

test("outcome context is bounded and never exports free text notes", () => {
  const context = activityContext({ energy: "low", body: "tender", pace: "rest", note: "private note", activityConstraints: { seatedOnly: true } });
  const clean = sanitizeLearningEvent(makeEvent("activityFeedback", { ...task, feedback: "too_much", context: { ...context, note: "private note" } }, nowMs));
  assert.deepEqual(clean.context, context);
  assert.equal(clean.context.note, undefined);
});

test("compaction preserves the recent exposure window ahead of older outcomes", () => {
  const input = {};
  for (let day = 0; day < 60; day += 1) {
    const ts = nowMs - day * DAY;
    const key = new Date(ts).toISOString().slice(0, 10);
    input[key] = [
      ...Array.from({ length: 12 }, (_, i) => makeEvent("activityViewed", { activities: [{ ...task, canonicalKey: `view:${day}:${i}` }] }, ts)),
      ...Array.from({ length: 8 }, () => makeEvent("activityFeedback", { ...task, feedback: "helped", context: activityContext({}) }, ts)),
    ];
  }
  const wire = Object.values(sanitizeEventsForSync(input, nowMs)).flat();
  assert.equal(wire.filter(event => event.type === "activityViewed" && event.ts > nowMs - 7 * DAY).length, 84);
});
