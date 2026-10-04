import assert from "node:assert/strict";
import test from "node:test";
import { createAiUsageTracker, normalizeCompletionUsage } from "./aiUsage.js";

const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
  prompt_tokens_details: { cached_tokens: 40 } };
const clientFor = create => ({ chat: { completions: { create } } });

test("completion usage accepts only consistent nonnegative integer counts", () => {
  assert.deepEqual(normalizeCompletionUsage(usage), { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 40 });
  for (const patch of [{ prompt_tokens: "100" }, { completion_tokens: -1 }, { total_tokens: 119 }, { total_tokens: NaN }, { prompt_tokens: 1.1 }]) {
    assert.equal(normalizeCompletionUsage({ ...usage, ...patch }), null);
  }
  assert.equal(normalizeCompletionUsage(null), null);
  assert.equal(normalizeCompletionUsage({ ...usage, prompt_tokens_details: {} }).cachedInputTokens, null);
  assert.equal(normalizeCompletionUsage({ ...usage, prompt_tokens_details: { cached_tokens: 101 } }).cachedInputTokens, null);
});

test("usage tracking retains numeric metadata without prompts, response text or credentials", async () => {
  let time = 100;
  const tracker = createAiUsageTracker({ now: () => time += 10 });
  const response = { model: "test-2026-10-04", _request_id: "req_123", usage,
    choices: [{ message: { content: "private-response" } }], private: "secret" };
  assert.equal(await tracker.complete(clientFor(async () => response), {
    model: "test", messages: [{ content: "private-note" }], apiKey: "secret",
  }), response);
  const summary = tracker.snapshot();
  assert.equal(summary.usageComplete, true);
  assert.equal(summary.cachedUsageComplete, true);
  assert.equal(summary.attempts[0].latencyMs, 10);
  assert.equal(summary.attempts[0].model, "test-2026-10-04");
  assert.doesNotMatch(JSON.stringify(summary), /private|secret|messages|choices/);
  summary.attempts[0].usage.inputTokens = 0;
  assert.equal(tracker.snapshot().attempts[0].usage.inputTokens, 100);
});

test("mixed responses and transport errors preserve known spend and mark missing usage", async () => {
  const tracker = createAiUsageTracker();
  await tracker.complete(clientFor(async () => ({ usage, model: "primary" })), { model: "primary" });
  const error = Object.assign(new Error("private-note"), { status: 429, request_id: "req_limit", usage, secret: "secret" });
  await assert.rejects(tracker.complete(clientFor(async () => { throw error; }), { model: "fallback" }), error);
  await tracker.complete(clientFor(async () => ({ model: "fallback" })), { model: "fallback" });
  const summary = tracker.snapshot();
  assert.equal(summary.sdkCalls, 3);
  assert.equal(summary.knownUsageCalls, 1);
  assert.equal(summary.usageComplete, false);
  assert.equal(summary.cachedUsageComplete, false);
  assert.equal(summary.knownTokens.totalTokens, 120);
  assert.equal(summary.attempts[1].status, 429);
  assert.equal(summary.attempts[1].usage, null);
  assert.doesNotMatch(JSON.stringify(summary), /private-note|secret/);
});

test("missing cache breakdown and zero calls are not reported as complete usage", async () => {
  const tracker = createAiUsageTracker();
  assert.equal(tracker.snapshot().usageComplete, false);
  await tracker.complete(clientFor(async () => ({ usage: { ...usage, prompt_tokens_details: undefined } })), { model: "test" });
  assert.equal(tracker.snapshot().usageComplete, true);
  assert.equal(tracker.snapshot().cachedUsageComplete, false);
});
