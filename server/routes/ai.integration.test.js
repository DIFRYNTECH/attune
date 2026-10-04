import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAiRoutes } from "./ai.js";
import { createRequireAuthedUser } from "../lib/auth.js";
import { makeTtlCache } from "../lib/cache.js";
import { createEnforceAllowedOrigin } from "../lib/securityMiddleware.js";
import { TASKS } from "../../src/data/tasks.js";
import { isActivityEligible } from "../../src/lib/activityPolicy.js";

test("recommendation HTTP route enforces auth, paid access, quota and failure accounting", async t => {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  const logs = [];
  const logging = { logEvent: (level, event, payload) => logs.push({ level, event, ...payload }), summarizeError: error => ({ message: error.message }),
    getRequestLogContext: () => ({}), setRequestErrorCode() {}, setRequestUserId() {} };
  const requireAuthedUser = createRequireAuthedUser({ ...logging, supabaseAuth: { auth: {
    getUser: async token => ({ data: { user: ["paid", "free"].includes(token) ? { id: token } : null } }),
  } } });
  let modelCalls = 0;
  let reservations = 0;
  let quotaAllowed = true;
  let providerFails = false;
  let dailyMode = "valid";
  let dailyCalls = 0;
  let finalizeFails = false;
  const completed = [];
  registerAiRoutes({ app, ...logging, requireAuthedUser,
    enforceAllowedOrigin: createEnforceAllowedOrigin({ ...logging, isOriginAllowed: origin => origin === "https://app.example.test" }),
    limitBoard: (_req, _res, next) => next(), limitNote: (_req, _res, next) => next(),
    supabaseAdmin: {}, openAiApiKey: "synthetic", defaultModel: "fixture", boardModel: "fixture", boardModelCandidates: ["fixture"],
    boardTotalTaskCount: 12, boardAiCandidateCount: 50, boardMaxCompletionTokens: 3200, tasksByLevel: TASKS,
    boardCache: makeTtlCache({ ttlMs: 60000, maxEntries: 10 }), noteCache: makeTtlCache({ ttlMs: 60000, maxEntries: 10 }),
    getUserAiContext: async id => ({ planId: id === "paid" ? "plus" : "free", useNoteForAi: true }),
    reserveAiQuota: async () => { reservations++; return { allowed: quotaAllowed, usageId: `usage-${reservations}` }; },
    finalizeReservedAiUsage: async value => { if (finalizeFails) throw new Error("ai_usage_finalize_failed"); completed.push(value); },
    rejectForQuota: async (_req, res) => res.status(429).json({ error: "daily_quota_exceeded" }),
    openAiClient: { chat: { completions: { create: async input => {
      modelCalls++;
      if (providerFails) throw new Error("provider_unavailable");
      const payload = JSON.parse(input.messages[1].content);
      return { model: "fixture-snapshot", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        choices: [{ message: { content: JSON.stringify({ tasks: payload.approvedActivities.slice(0, 50)
        .map(task => ({ canonicalKey: task.canonicalKey })) }) } }] };
    } } } },
    OpenAIClient: class {
      chat = { completions: { create: async () => {
        dailyCalls++;
        if (dailyMode === "error") throw Object.assign(new Error("private provider message"), { status: 503 });
        return { model: "fixture-snapshot", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
          choices: [{ message: { content: dailyMode === "invalid" ? "not-json" : JSON.stringify({
            note: { title: "A small step", body: "Choose one manageable thing for now.", focus: "One thing", themes: [] },
          }) } }] };
      } } };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const checkin = { energy: "verylow", body: "tender", pace: "rest", moodWords: ["Worn out"],
    activityConstraints: { seatedOnly: true, indoorsOnly: true, maxMinutes: 5 } };
  const send = (token, patch = {}, origin = "https://app.example.test", path = "/api/generate-board") => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ checkin, level: "rest", ...patch }),
  });
  const sendNote = (token, today = "2026-10-04") => send(token, { today }, undefined, "/api/daily-note");
  try {
    await t.test("unauthenticated, invalid-token and untrusted-origin requests never invoke the model", async () => {
      assert.equal((await send(null)).status, 401);
      assert.equal((await send("invalid")).status, 401);
      assert.equal((await send("paid", {}, "https://untrusted.example.test")).status, 403);
      assert.equal(modelCalls, 0);
    });
    await t.test("a client cannot claim paid access in the request body", async () => {
      assert.equal((await send("free", { planId: "plus", isPlus: true })).status, 403);
      assert.equal(modelCalls, 0);
      assert.equal(reservations, 0);
    });
    await t.test("paid requests return constrained catalogue activities and finalize quota before responding", async () => {
      const response = await send("paid");
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.tasks.length, 12);
      assert.ok(payload.tasks.every(task => isActivityEligible(task, checkin, "rest")));
      assert.equal(completed.length, 1);
      assert.equal(completed[0].success, true);
      assert.equal(completed[0].meta.providerUsage.knownTokens.totalTokens, 120);
      assert.equal(payload.meta.providerUsage, undefined);
    });
    await t.test("cached responses avoid new charges but do not bypass paid authorization", async () => {
      assert.equal((await send("paid")).status, 200);
      assert.equal(modelCalls, 1);
      assert.equal(reservations, 1);
      assert.equal(completed.length, 1);
      assert.equal((await send("free")).status, 403);
    });
    await t.test("quota rejection happens before a provider call", async () => {
      quotaAllowed = false;
      assert.equal((await send("paid", { checkin: { ...checkin, note: "A quiet afternoon" } })).status, 429);
      assert.equal(modelCalls, 1);
    });
    await t.test("provider failure returns an error and finalizes the failed reservation", async () => {
      quotaAllowed = true;
      providerFails = true;
      assert.equal((await send("paid", { checkin: { ...checkin, note: "A quiet afternoon" } })).status, 502);
      assert.equal(completed.at(-1).success, false);
      assert.equal(modelCalls, 2);
      assert.equal(completed.at(-1).meta.providerUsage.usageComplete, false);
    });
    await t.test("daily notes also enforce paid access and persist usage without exposing it to the client", async () => {
      assert.equal((await sendNote("free")).status, 403);
      assert.equal(dailyCalls, 0);
      const response = await sendNote("paid");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).meta.providerUsage, undefined);
      assert.equal(completed.at(-1).success, true);
      assert.equal(completed.at(-1).meta.providerUsage.knownTokens.totalTokens, 120);
      const count = completed.length;
      assert.equal((await sendNote("paid")).status, 200);
      assert.equal(completed.length, count);
      assert.equal(dailyCalls, 1);
    });
    await t.test("daily-note provider failures finalize immediately with unknown usage", async () => {
      dailyMode = "error";
      const response = await sendNote("paid", "2026-10-05");
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, "model_request_failed");
      assert.equal(completed.at(-1).success, false);
      assert.equal(completed.at(-1).meta.providerUsage.usageComplete, false);
      assert.equal(completed.at(-1).meta.providerUsage.sdkCalls, 1);
    });
    await t.test("rejected daily-note responses retain spend for both correction attempts", async () => {
      dailyMode = "invalid";
      assert.equal((await sendNote("paid", "2026-10-06")).status, 502);
      assert.equal(completed.at(-1).success, false);
      assert.equal(completed.at(-1).meta.providerUsage.sdkCalls, 2);
      assert.equal(completed.at(-1).meta.providerUsage.knownTokens.totalTokens, 240);
    });
    await t.test("database finalization failure prevents success but leaves metadata in structured logs", async () => {
      dailyMode = "valid";
      finalizeFails = true;
      assert.equal((await sendNote("paid", "2026-10-07")).status, 500);
      const usageLog = logs.filter(entry => entry.event === "ai_provider_usage" && entry.kind === "daily_note").at(-1);
      assert.equal(usageLog.providerUsage.knownTokens.totalTokens, 120);
      assert.ok(usageLog.usageId);
      assert.doesNotMatch(JSON.stringify(usageLog), /private provider message|manageable thing/);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
