import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_BOARD_VERSION,
  AI_DAILY_NOTE_VERSION,
  BOARD_TILE_COUNT,
  EVENT_DAYS_TO_KEEP,
  NOTE_MEMORY_MAX,
  SCHEMA_VERSION,
} from "./storeConstants.js";

test("store constants preserve persisted data and AI cache versions", () => {
  assert.equal(SCHEMA_VERSION, 9);
  assert.equal(AI_BOARD_VERSION, 7);
  assert.equal(AI_DAILY_NOTE_VERSION, 2);
});

test("store constants preserve retention and board limits", () => {
  assert.equal(EVENT_DAYS_TO_KEEP, 90);
  assert.equal(NOTE_MEMORY_MAX, 30);
  assert.equal(BOARD_TILE_COUNT, 12);
});
