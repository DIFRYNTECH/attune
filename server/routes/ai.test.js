import assert from "node:assert/strict";
import test from "node:test";

import { registerAiRoutes } from "./ai.js";

test("registerAiRoutes registers board and daily-note endpoints", () => {
  const registered = [];
  const app = {
    post(path, ...handlers) {
      registered.push({ method: "POST", path, handlers });
    },
  };
  const noop = (_req, _res, next) => next?.();

  registerAiRoutes({
    app,
    enforceAllowedOrigin: noop,
    limitBoard: noop,
    limitNote: noop,
    requireAuthedUser: async () => null,
    supabaseAdmin: {},
    openAiApiKey: "test",
    defaultModel: "model",
    boardModel: "board-model",
    boardFallbackModel: "fallback-model",
    boardModelCandidates: ["board-model"],
    boardAiCandidateCount: 50,
    boardTotalTaskCount: 12,
    boardMaxCompletionTokens: 3200,
    openAiClient: {},
    OpenAIClient: class {},
    tasksByLevel: {},
    boardCache: { get: () => null, set: () => {} },
    noteCache: { get: () => null, set: () => {} },
    getUserAiContext: async () => ({}),
    reserveAiQuota: async () => ({ allowed: true }),
    finalizeReservedAiUsage: async () => {},
    rejectForQuota: async () => {},
    logEvent: () => {},
    summarizeError: () => ({}),
    getRequestLogContext: () => ({}),
    setRequestErrorCode: () => {},
    setRequestUserId: () => {},
  });

  assert.deepEqual(
    registered.map(({ method, path, handlers }) => ({ method, path, handlerCount: handlers.length })),
    [
      { method: "POST", path: "/api/generate-board", handlerCount: 3 },
      { method: "POST", path: "/api/daily-note", handlerCount: 3 },
    ],
  );
});
