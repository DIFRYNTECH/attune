import assert from "node:assert/strict";
import test from "node:test";
import { getAiBoardAccessError, isPlusAiContext } from "./aiAccess.js";

test("plus AI context can generate boards", () => {
  assert.equal(isPlusAiContext({ planId: "plus" }), true);
  assert.equal(getAiBoardAccessError({ planId: "plus" }), "");
});

test("free or missing AI context cannot generate boards", () => {
  assert.equal(isPlusAiContext({ planId: "free" }), false);
  assert.equal(getAiBoardAccessError({ planId: "free" }), "ai_board_plus_required");
  assert.equal(getAiBoardAccessError(null), "ai_board_plus_required");
});
