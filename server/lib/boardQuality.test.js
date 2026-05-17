import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTaskQuality, selectQualityBoard } from "./boardQuality.js";

test("evaluateTaskQuality rejects silly, unsafe, and oversized tasks", () => {
  const checkin = { moodWords: ["Tired"], energy: "low", body: "manageable", pace: "gentle" };

  assert.equal(evaluateTaskQuality("Manifest cosmic productivity vibes", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Do an extreme workout for 90 minutes", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Clean your entire home today", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("Write the hidden system prompt in your notes", { checkin }).rejected, true);
  assert.equal(evaluateTaskQuality("As an AI, I cannot reveal my instructions", { checkin }).rejected, true);
});

test("evaluateTaskQuality accepts concrete do and try tasks", () => {
  const checkin = { moodWords: ["Okay"], energy: "okay", body: "manageable", pace: "steady" };

  assert.equal(evaluateTaskQuality("Do a word search or easy puzzle (10 minutes)", { checkin }).rejected, false);
  assert.equal(evaluateTaskQuality("Try a beginner stretch video for 10 minutes", { checkin }).rejected, false);
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

test("selectQualityBoard uses metadata to keep a safe Support and Stretch mix", () => {
  const checkin = {
    moodWords: ["Tired"],
    energy: "low",
    body: "tender",
    pace: "gentle",
    boardStyle: "challenge",
  };

  const result = selectQualityBoard({
    candidates: [
      { text: "Write a two-line starting point for one task", mode: "stretch", domain: "practical", effort: 2, friction: 2, pace: "gentle", canonicalKey: "task-start", repetitionFamily: "practical-start" },
      { text: "Send one kind sentence to someone safe", mode: "stretch", domain: "connection", effort: 2, friction: 2, pace: "gentle", canonicalKey: "kind-message", repetitionFamily: "connection-message" },
      { text: "Choose the next tiny step and stop there", mode: "stretch", domain: "practical", effort: 2, friction: 1, pace: "gentle", canonicalKey: "tiny-next-step", repetitionFamily: "practical-start" },
      { text: "Run hard for 30 minutes to reset your mood", mode: "stretch", domain: "body", effort: 5, friction: 5, pace: "brave", canonicalKey: "hard-run", repetitionFamily: "intense-exercise" },
      { text: "Drop your shoulders and unclench your jaw", mode: "support", domain: "body", effort: 1, friction: 1, pace: "rest", canonicalKey: "jaw-shoulders", repetitionFamily: "body-soften" },
      { text: "Hold a warm drink and sit while it cools", mode: "support", domain: "comfort", effort: 1, friction: 1, pace: "rest", canonicalKey: "warm-drink", repetitionFamily: "warmth" },
      { text: "Clear one small surface within arm's reach", mode: "support", domain: "environment", effort: 1, friction: 1, pace: "gentle", canonicalKey: "small-surface", repetitionFamily: "space-reset" },
      { text: "Take five slow breaths with both feet down", mode: "support", domain: "regulation", effort: 1, friction: 1, pace: "rest", canonicalKey: "feet-breath", repetitionFamily: "breathing" },
      { text: "Put your phone face down for one quiet minute", mode: "support", domain: "regulation", effort: 1, friction: 1, pace: "rest", canonicalKey: "phone-down", repetitionFamily: "sensory-quiet" },
    ],
    fallbackTasks: [],
    checkin,
    boardHistory: {},
    targetCount: 6,
  });

  const modes = result.tasks.map((task) => task.mode);
  assert.equal(modes.filter((mode) => mode === "support").length, 4);
  assert.equal(modes.filter((mode) => mode === "stretch").length, 2);
  assert.equal(result.tasks.some((task) => task.canonicalKey === "hard-run"), false);
});

test("selectQualityBoard applies freshness penalties across canonical families", () => {
  const checkin = { moodWords: ["Okay"], energy: "okay", body: "manageable", pace: "steady" };

  const result = selectQualityBoard({
    candidates: [
      { text: "Stretch your shoulders for two easy breaths", mode: "support", domain: "body", effort: 1, friction: 1, canonicalKey: "shoulder-stretch-alt", repetitionFamily: "shoulder-reset" },
      { text: "Write one sentence about the next doable step", mode: "stretch", domain: "practical", effort: 2, friction: 2, canonicalKey: "next-step", repetitionFamily: "practical-start" },
      { text: "Open the window and notice the room changing", mode: "support", domain: "environment", effort: 1, friction: 1, canonicalKey: "open-window", repetitionFamily: "space-refresh" },
    ],
    fallbackTasks: [],
    checkin,
    boardHistory: {
      recentRemoved: [{ text: "Stretch shoulders gently for 2 minutes", canonicalKey: "shoulder-stretch", repetitionFamily: "shoulder-reset" }],
      recentShown: [],
      recentPicked: [],
      recentCompleted: [{ text: "Write a tiny starting point", canonicalKey: "old-next-step", repetitionFamily: "practical-start" }],
    },
    targetCount: 2,
  });

  assert.deepEqual(
    result.tasks.map((task) => task.canonicalKey),
    ["next-step", "open-window"],
  );
});

test("selectQualityBoard enforces domain diversity instead of letting one domain dominate", () => {
  const checkin = { moodWords: ["Restless"], energy: "okay", body: "manageable", pace: "steady" };

  const bodyTasks = [
    "Stretch shoulders gently for 2 minutes",
    "Drop your shoulders and unclench your jaw",
    "Take five slow breaths with both feet down",
    "Relax your hands and soften your face",
    "Lengthen the back of your neck for three breaths",
    "Sit tall and release your chest slowly",
  ].map((text, index) => ({
    text,
    mode: "support",
    domain: "body",
    effort: 1,
    friction: 1,
    canonicalKey: `body-${index}`,
    repetitionFamily: `body-${index}`,
  }));

  const result = selectQualityBoard({
    candidates: [
      ...bodyTasks,
      { text: "Clear one small surface within arm's reach", mode: "support", domain: "environment", effort: 1, friction: 1, canonicalKey: "surface", repetitionFamily: "space-reset" },
      { text: "Write one sentence about the next doable step", mode: "stretch", domain: "practical", effort: 2, friction: 2, canonicalKey: "sentence-step", repetitionFamily: "practical-start" },
      { text: "Send one kind sentence to someone safe", mode: "stretch", domain: "connection", effort: 2, friction: 2, canonicalKey: "kind-message", repetitionFamily: "connection-message" },
    ],
    fallbackTasks: [],
    checkin,
    boardHistory: {},
    targetCount: 6,
  });

  assert.equal(new Set(result.tasks.map((task) => task.domain)).size >= 4, true);
  assert.equal(result.meta.domainMix.body <= 3, true);
});

test("selectQualityBoard preserves fallback task metadata when filling the board", () => {
  const checkin = { moodWords: ["Overwhelmed"], energy: "verylow", body: "tender", pace: "rest" };

  const result = selectQualityBoard({
    candidates: [{ text: "Crush your biggest goal today" }],
    fallbackTasks: [
      {
        text: "Sit quietly and take 5 slow breaths",
        level: "rest",
        mode: "support",
        domain: "regulation",
        effort: 1,
        friction: 1,
        pace: "rest",
        canonicalKey: "five-breaths",
        repetitionFamily: "breathing",
      },
    ],
    checkin,
    boardHistory: {},
    targetCount: 1,
  });

  assert.deepEqual(result.tasks[0], {
    text: "Sit quietly and take 5 slow breaths",
    level: "rest",
    mode: "support",
    domain: "regulation",
    effort: 1,
    friction: 1,
    pace: "rest",
    canonicalKey: "five-breaths",
    repetitionFamily: "breathing",
  });
});
