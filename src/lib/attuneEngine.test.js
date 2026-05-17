import assert from "node:assert/strict";
import test from "node:test";

import { suggestActivities } from "./attuneEngine.js";

function countStretchOptions(options) {
  return options.filter((option) => option.level === "capable" || option.level === "brave").length;
}

test("suggestActivities gives challenge boards more active options without changing pace", () => {
  const baseCheckin = {
    mood: "okay",
    moodWords: ["Okay"],
    energy: "okay",
    body: "manageable",
    note: "",
  };

  const steady = suggestActivities({ ...baseCheckin, boardStyle: "steady" }, "steady", "same-day-seed");
  const challenge = suggestActivities({ ...baseCheckin, boardStyle: "challenge" }, "steady", "same-day-seed");

  assert.ok(steady.length >= 15);
  assert.ok(challenge.length >= 15);
  assert.ok(countStretchOptions(challenge) > countStretchOptions(steady));
});
