import assert from "node:assert/strict";
import test from "node:test";

import { suggestActivities } from "./attuneEngine.js";

const VISIBLE_BOARD_COUNT = 12;

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

  assert.ok(steady.length >= VISIBLE_BOARD_COUNT);
  assert.ok(challenge.length >= VISIBLE_BOARD_COUNT);
  assert.ok(countStretchOptions(challenge) > countStretchOptions(steady));
});

function countMode(options, mode) {
  return options.filter((option) => option.mode === mode).length;
}

function textSet(options) {
  return new Set(options.map((option) => option.text));
}

test("support and stretch boards differ in mode mix and text", () => {
  const baseCheckin = {
    mood: "okay",
    moodWords: ["Okay"],
    energy: "okay",
    body: "manageable",
    note: "",
  };

  const support = suggestActivities({ ...baseCheckin, boardStyle: "steady" }, "steady", "mode-seed");
  const stretch = suggestActivities({ ...baseCheckin, boardStyle: "challenge" }, "steady", "mode-seed");

  assert.ok(support.length >= VISIBLE_BOARD_COUNT);
  assert.ok(stretch.length >= VISIBLE_BOARD_COUNT);
  assert.ok(countMode(support, "support") > countMode(support, "stretch"));
  assert.ok(countMode(stretch, "stretch") > countMode(stretch, "support"));

  const supportTexts = textSet(support.slice(0, VISIBLE_BOARD_COUNT));
  const differingTiles = stretch.slice(0, VISIBLE_BOARD_COUNT).filter((option) => !supportTexts.has(option.text));
  assert.ok(differingTiles.length >= 5);
});

test("challenge boards stay capacity-aware on depleted days", () => {
  const options = suggestActivities(
    {
      mood: "low",
      moodWords: ["Worn out", "Tender"],
      energy: "verylow",
      body: "tender",
      boardStyle: "challenge",
      note: "",
    },
    "rest",
    "depleted-challenge-seed",
  ).slice(0, VISIBLE_BOARD_COUNT);

  assert.ok(options.length >= VISIBLE_BOARD_COUNT);
  assert.equal(options.some((option) => ["capable", "brave"].includes(option.level)), false);
  assert.equal(options.some((option) => Number(option.effort) >= 4 || Number(option.friction) >= 4), false);
});

test("freshness and removal history suppress recently shown and removed tasks", () => {
  const nowMs = Date.parse("2026-05-17T10:00:00.000Z");
  const recentText = "Tidy one small surface (5 minutes)";
  const removedText = "Sort one drawer section for 10 minutes";
  const eventsByDay = {
    "2026-05-17": [
      {
        type: "activityShown",
        ts: nowMs - 2 * 60 * 60 * 1000,
        activities: [recentText],
      },
      {
        type: "activityRemoved",
        ts: nowMs - 60 * 60 * 1000,
        text: removedText,
      },
    ],
  };

  const options = suggestActivities(
    {
      mood: "okay",
      moodWords: ["Okay"],
      energy: "okay",
      body: "manageable",
      boardStyle: "steady",
      note: "",
    },
    "steady",
    "freshness-seed",
    { eventsByDay, nowMs },
  );

  assert.ok(options.length >= VISIBLE_BOARD_COUNT);
  assert.equal(options.some((option) => option.text === recentText), false);
  assert.equal(options.some((option) => option.text === removedText), false);
});

test("local boards avoid exact repeats within a rolling week", () => {
  const eventsByDay = {};
  const startMs = Date.parse("2026-05-04T09:00:00.000Z");
  const dayMs = 24 * 60 * 60 * 1000;
  const seenRecently = [];

  for (let day = 0; day < 10; day += 1) {
    const nowMs = startMs + day * dayMs;
    const date = new Date(nowMs).toISOString().slice(0, 10);
    const options = suggestActivities(
      {
        mood: "low",
        moodWords: ["Tired"],
        energy: "low",
        body: "manageable",
        boardStyle: "steady",
        note: "",
      },
      "gentle",
      `rolling-week-${day}`,
      { eventsByDay, nowMs },
    ).slice(0, VISIBLE_BOARD_COUNT);

    const texts = options.map((option) => option.text);
    const recentSet = new Set(seenRecently.flat());
    assert.deepEqual(
      texts.filter((text) => recentSet.has(text)),
      [],
      `day ${day + 1} repeated a task shown in the previous week`,
    );

    eventsByDay[date] = [
      {
        type: "activityShown",
        ts: nowMs,
        activities: options,
      },
    ];
    seenRecently.push(texts);
    if (seenRecently.length > 6) seenRecently.shift();
  }
});

test("local boards avoid exact and near duplicates", () => {
  const options = suggestActivities(
    {
      mood: "good",
      moodWords: ["Motivated", "Hopeful"],
      energy: "high",
      body: "great",
      boardStyle: "challenge",
      note: "",
    },
    "capable",
    "duplicate-seed",
  ).slice(0, VISIBLE_BOARD_COUNT);

  const normalizedTexts = options.map((option) => option.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  assert.equal(new Set(normalizedTexts).size, normalizedTexts.length);

  const families = options.map((option) => option.repetitionFamily);
  assert.equal(new Set(families).size, families.length);
});

test("local boards avoid visible duplicates across changing history", () => {
  const eventsByDay = {};
  const startMs = Date.parse("2026-05-18T08:00:00.000Z");
  const dayMs = 24 * 60 * 60 * 1000;

  for (let day = 0; day < 45; day += 1) {
    const nowMs = startMs + day * dayMs;
    const date = new Date(nowMs).toISOString().slice(0, 10);
    const boardStyle = day % 2 === 0 ? "steady" : "challenge";
    const options = suggestActivities(
      {
        mood: "okay",
        moodWords: ["Okay"],
        energy: "okay",
        body: day % 9 === 0 ? "achey" : "manageable",
        boardStyle,
        note: "",
      },
      day % 5 === 0 ? "gentle" : "steady",
      `history-duplicate-${day}`,
      { eventsByDay, nowMs },
    ).slice(0, VISIBLE_BOARD_COUNT);

    const textKeys = options.map((option) => option.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    assert.equal(new Set(textKeys).size, textKeys.length, `day ${day + 1} repeated exact visible text`);

    eventsByDay[date] = [
      {
        type: "activityShown",
        ts: nowMs,
        activities: options,
      },
    ];
  }
});

test("returned options preserve compatibility fields and task metadata", () => {
  const options = suggestActivities(
    {
      mood: "low",
      moodWords: ["Tired"],
      energy: "low",
      body: "achey",
      boardStyle: "steady",
      note: "",
    },
    "gentle",
    "metadata-seed",
  );

  assert.ok(options.length >= VISIBLE_BOARD_COUNT);
  for (const option of options.slice(0, VISIBLE_BOARD_COUNT)) {
    assert.equal(typeof option.text, "string");
    assert.equal(typeof option.level, "string");
    assert.match(option.mode, /^(support|stretch)$/);
    assert.equal(typeof option.domain, "string");
    assert.equal(typeof option.effort, "number");
    assert.equal(typeof option.friction, "number");
    assert.equal(typeof option.pace, "string");
    assert.equal(typeof option.canonicalKey, "string");
    assert.equal(typeof option.repetitionFamily, "string");
    assert.equal(option.safetyReviewed, true);
  }
});
