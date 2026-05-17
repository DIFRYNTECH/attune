import assert from "node:assert/strict";
import test from "node:test";

import { buildBoardHistoryForAi } from "./boardHistory.js";

test("buildBoardHistoryForAi preserves task metadata for learning and freshness", () => {
  const history = buildBoardHistoryForAi({
    "2026-05-17": [
      {
        type: "activityShown",
        ts: 1779000000000,
        activities: [
          {
            text: "Write one sentence about the next doable step",
            mode: "stretch",
            domain: "practical",
            effort: 2,
            friction: 2,
            pace: "gentle",
            canonicalKey: "next-step",
            repetitionFamily: "practical-start",
          },
        ],
      },
      {
        type: "activityRemoved",
        ts: 1779000001000,
        text: "Stretch shoulders gently for 2 minutes",
        mode: "support",
        domain: "body",
        canonicalKey: "shoulder-stretch",
        repetitionFamily: "body-reset",
      },
    ],
  });

  assert.deepEqual(history.recentShown, [
    {
      text: "Write one sentence about the next doable step",
      mode: "stretch",
      domain: "practical",
      effort: 2,
      friction: 2,
      pace: "gentle",
      canonicalKey: "next-step",
      repetitionFamily: "practical-start",
    },
  ]);
  assert.deepEqual(history.recentRemoved, [
    {
      text: "Stretch shoulders gently for 2 minutes",
      mode: "support",
      domain: "body",
      canonicalKey: "shoulder-stretch",
      repetitionFamily: "body-reset",
    },
  ]);
});
