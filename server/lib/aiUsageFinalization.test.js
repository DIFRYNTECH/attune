import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const aiRoutesSource = readFileSync(new URL("../routes/ai.js", import.meta.url), "utf8");

test("AI usage reservations are finalized before API responses", () => {
  const fireAndForgetFinalizers = aiRoutesSource.match(/finalizeReservedAiUsage\(\{[\s\S]*?\}\)\.catch\(\(\) => \{\}\);/g) || [];

  assert.deepEqual(fireAndForgetFinalizers, []);
});
