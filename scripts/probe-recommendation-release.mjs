import { mkdirSync, writeFileSync } from "node:fs";
import { TASK_CATALOG } from "../src/data/tasks.js";
import { isActivityEligible, activityDetails, sameActivity, activityKey } from "../src/lib/activityPolicy.js";
import { preparePickBoard } from "../src/lib/activityState.js";
import { sanitizeEventsForSync } from "../src/lib/activitySync.js";
import { learningPreferences } from "../src/lib/activityLearning.js";
import { makeEvent, trimEventDays } from "../src/lib/events.js";
import { buildBoardHistoryForAi } from "../src/lib/boardHistory.js";
import { rankActivities } from "../src/lib/smartPick.js";
import { hasPlusEntitlement } from "../server/services/entitlements.js";

const nowMs = Date.parse("2026-10-04T10:00:00Z");
const DAY = 86400000;
const checkin = { mood: "good", energy: "high", body: "manageable", pace: "brave", moodWords: ["Motivated"], activityConstraints: { seatedOnly: true } };
const step = TASK_CATALOG.find(task => task.text === "Step into fresh air for 2 minutes");
const board = preparePickBoard({ checkin, level: "brave", today: "2026-10-04", options: [step], events: {}, boardAssigned: [], myDay: [] }, { nowMs });
const oldExposure = makeEvent("activityViewed", { activities: [step] }, nowMs - 130 * DAY);
const sparse = trimEventDays({ "2026-05-27": [oldExposure], "2026-10-04": [] }, 90, nowMs);
const history = buildBoardHistoryForAi(sparse, { nowMs });
const known = TASK_CATALOG.find(task => task.canonicalKey === "attune:doodle-shape");
const preferredContext = { mood: "okay", energy: "okay", body: "manageable", moodWords: [], pace: "steady" };
const positive = { "2026-10-03": [makeEvent("activityFeedback", { ...known, feedback: "helped" }, nowMs - DAY)] };
const rejected = { ...positive, "2026-10-04": [makeEvent("activityFeedback", { ...known, feedback: "too_much" }, nowMs)] };
const rank = (events, at) => rankActivities(TASK_CATALOG, events, { checkin: preferredContext, nowMs: at }).findIndex(task => sameActivity(task, known));
const highVolumeEvents = [makeEvent("activityPreference", { ...known, preference: "hidden", value: true }, nowMs - 1000)];
for (let index = 0; index < 260; index += 1) highVolumeEvents.push(makeEvent("activityViewed", { activities: [TASK_CATALOG[index % TASK_CATALOG.length]] }, nowMs + index));
const syncEvents = Object.values(sanitizeEventsForSync({ "2026-10-04": highVolumeEvents }, nowMs + 1000)).flat();
const result = {
  scope: "Offline boundary probes against current production domain functions; no live account, provider or database calls.",
  seatedFilter: { text: step.text, metadata: activityDetails(step), eligible: isActivityEligible(step, checkin), actuallyPlacedOnBoard: board.boardAssigned.some(task => sameActivity(task, step)) },
  oldHistory: { ageDays: 130, retainedDespite90DayLimit: Object.values(sparse).flat().length > 0, sentAsRecent: history.recentShown.some(task => sameActivity(task, step)) },
  feedback: { helpedRank: rank(positive, nowMs), tooMuchImmediateRank: rank(rejected, nowMs + 1), tooMuchAfter48HoursRank: rank(rejected, nowMs + 2 * DAY), helpfulStillRemembered: learningPreferences(rejected, nowMs + 2 * DAY).helpful.some(task => sameActivity(task, known)) },
  highVolumeSync: { eventCount: highVolumeEvents.length, exportedCount: syncEvents.length, hiddenBefore: learningPreferences({ today: highVolumeEvents }, nowMs + 1000).hidden.map(activityKey), hiddenAfter: learningPreferences({ today: syncEvents }, nowMs + 1000).hidden.map(activityKey), note: "Synthetic stress case using the production sync serializer, not a normal 12-card daily flow." },
  billing: { input: { plan_id: "plus", status: "active", source: "play_store", current_period_end: "2026-08-31T10:00:00Z" }, expiredActiveStillGrantsPlus: hasPlusEntitlement({ plan_id: "plus", status: "active", source: "play_store", current_period_end: "2026-08-31T10:00:00Z" }), note: "Demonstrates behavior if a provider status remains stale; it does not establish live provider state." },
};
const dir = new URL("../test-results/recommendation-simulation/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("boundary-probes.json", dir), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
