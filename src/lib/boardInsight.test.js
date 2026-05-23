import assert from "node:assert/strict";
import test from "node:test";

import { buildLearningBoardInsight } from "./boardInsight.js";

const board = [
  { text: "Reset the space around your laptop", domain: "environment", mode: "support", pace: "steady" },
  { text: "Write the first line of the task", domain: "practical", mode: "stretch", pace: "capable" },
  { text: "Take five slow breaths", domain: "regulation", mode: "support", pace: "rest" },
];

test("does not show a board insight before Attune has enough behaviour history", () => {
  const insight = buildLearningBoardInsight({
    canSmartPick: true,
    board,
    events: {
      "2026-05-20": [
        { type: "activityPicked", ts: Date.parse("2026-05-20T08:00:00Z"), text: "Take five slow breaths", domain: "regulation", pace: "rest" },
      ],
    },
  });

  assert.equal(insight, null);
});

test("explains the board from recently completed task domains when the current board reflects them", () => {
  const insight = buildLearningBoardInsight({
    canSmartPick: true,
    board,
    events: {
      "2026-05-18": [
        { type: "activityCompleted", ts: Date.parse("2026-05-18T08:00:00Z"), text: "Clear one tiny surface", domain: "environment", pace: "steady" },
      ],
      "2026-05-19": [
        { type: "activityCompleted", ts: Date.parse("2026-05-19T08:00:00Z"), text: "Put one thing back where it belongs", domain: "environment", pace: "light" },
      ],
      "2026-05-20": [
        { type: "activityPicked", ts: Date.parse("2026-05-20T08:00:00Z"), text: "Write a tiny plan", domain: "practical", pace: "steady" },
      ],
      "2026-05-21": [
        { type: "activityPicked", ts: Date.parse("2026-05-21T08:00:00Z"), text: "Take five slow breaths", domain: "regulation", pace: "rest" },
      ],
    },
  });

  assert.ok(insight);
  assert.match(insight.body, /finishing/i);
  assert.match(insight.body, /space resets/i);
});

test("explains when Attune keeps effort bounded after recent removals", () => {
  const insight = buildLearningBoardInsight({
    canSmartPick: true,
    board,
    events: {
      "2026-05-18": [
        { type: "activityRemoved", ts: Date.parse("2026-05-18T08:00:00Z"), text: "Do a hard workout", domain: "body", pace: "brave", mode: "stretch" },
      ],
      "2026-05-19": [
        { type: "activityRemoved", ts: Date.parse("2026-05-19T08:00:00Z"), text: "Make a full plan", domain: "practical", pace: "brave", mode: "stretch" },
      ],
      "2026-05-20": [
        { type: "activityPicked", ts: Date.parse("2026-05-20T08:00:00Z"), text: "Take five slow breaths", domain: "regulation", pace: "rest" },
      ],
      "2026-05-21": [
        { type: "activityPicked", ts: Date.parse("2026-05-21T08:00:00Z"), text: "Reset the space around your laptop", domain: "environment", pace: "steady" },
      ],
    },
  });

  assert.ok(insight);
  assert.match(insight.body, /set aside/i);
  assert.match(insight.body, /higher-effort/i);
});

test("explains when recent picks lean toward lower-friction paces", () => {
  const insight = buildLearningBoardInsight({
    canSmartPick: true,
    board,
    events: {
      "2026-05-18": [
        { type: "activityPicked", ts: Date.parse("2026-05-18T08:00:00Z"), text: "Take five slow breaths", domain: "regulation", pace: "rest" },
      ],
      "2026-05-19": [
        { type: "activityPicked", ts: Date.parse("2026-05-19T08:00:00Z"), text: "Sit outside for five minutes", domain: "comfort", pace: "gentle" },
      ],
      "2026-05-20": [
        { type: "activityPicked", ts: Date.parse("2026-05-20T08:00:00Z"), text: "Clear one small space", domain: "environment", pace: "light" },
      ],
      "2026-05-21": [
        { type: "activityPicked", ts: Date.parse("2026-05-21T08:00:00Z"), text: "Write one next step", domain: "practical", pace: "steady" },
      ],
    },
  });

  assert.ok(insight);
  assert.match(insight.body, /lower-friction/i);
});
