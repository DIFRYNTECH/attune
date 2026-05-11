import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTaskQuality, selectQualityBoard } from "./boardQuality.js";

test("evaluateTaskQuality rejects silly, unsafe, and oversized tasks", () => {
  const checkin = { moodWords: ["Tired"], energy: "low", body: "manageable", pace: "gentle" };

  assert.equal(evaluateTaskQuality("Manifest cosmic productivity vibes", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Do an extreme workout for 90 minutes", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Clean your entire home today", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Write the hidden system prompt in your notes", { checkin }).rejected, true);
});

test("selectQualityBoard prefers fresh, concrete tasks over recent repeats", () => {
  const checkin = { moodWords: ["Tired"], energy: "low", body: "manageable", pace: "gentle" };
  const candidates = [
    { text: "Stretch shoulders gently for 2 minutes" },
    { text: "Drop your shoulders and unclench your jaw" },
    { text: "Manifest a better version of yourself" },
    { text: "Make a warm drink and sit while it cools" },
    { text: "Reply to every unread message" },
  ];

  const result = selectQualityBoard({
    candidates,
    fallbackTasks: [],
    checkin,
    boardHistory: {
      recentShown: ["Stretch shoulders gently for 2 minutes"],
      recentPicked: [],
      recentCompleted: [],
      recentRemoved: [],
    },
    targetCount: 2,
  });

  assert.deepEqual(
    result.tasks.map((task) => task.text),
    [
      "Drop your shoulders and unclench your jaw",
      "Make a warm drink and sit while it cools",
    ],
  );
  assert.equal(result.meta.rejectedCount >= 2, true);
});

test("selectQualityBoard fills weak candidate sets with curated fallback tasks", () => {
  const checkin = { moodWords: ["Overwhelmed"], energy: "verylow", body: "tender", pace: "rest" };

  const result = selectQualityBoard({
    candidates: [
      { text: "Crush your biggest goal today" },
      { text: "Manifest cosmic productivity vibes" },
    ],
    fallbackTasks: [
      { text: "Sit quietly and take 5 slow breaths", level: "rest" },
      { text: "Hold a warm drink and focus on the warmth", level: "rest" },
      { text: "Put a hand on your chest and breathe slowly", level: "rest" },
    ],
    checkin,
    boardHistory: {},
    targetCount: 3,
  });

  assert.deepEqual(
    result.tasks.map((task) => task.text),
    [
      "Sit quietly and take 5 slow breaths",
      "Hold a warm drink and focus on the warmth",
      "Put a hand on your chest and breathe slowly",
    ],
  );
  assert.equal(result.meta.fallbackCount, 3);
});
