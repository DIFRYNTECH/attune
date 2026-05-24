import assert from "node:assert/strict";
import test from "node:test";

import { getServerConfig } from "./config.js";

test("server config provides production defaults for app and AI settings", () => {
  const config = getServerConfig({});

  assert.equal(config.port, 8787);
  assert.equal(config.attuneEnv, "development");
  assert.equal(config.model, "gpt-4o-mini");
  assert.equal(config.boardTotalTaskCount, 12);
  assert.equal(config.boardModel, "gpt-4o-mini");
  assert.equal(config.boardFallbackModel, "gpt-4o-mini");
  assert.deepEqual(config.boardModelCandidates, ["gpt-4o-mini"]);
  assert.equal(config.boardAiCandidateCount, 50);
  assert.equal(config.boardMaxCompletionTokens, 3200);
  assert.equal(config.trustProxy, false);
  assert.equal(config.allowedOrigins.includes("https://useattune.co"), true);
});

test("server config normalizes environment overrides", () => {
  const config = getServerConfig({
    PORT: "9000",
    ATTUNE_ENV: "uat",
    OPENAI_MODEL: "base-model",
    OPENAI_BOARD_MODEL: "board-model",
    OPENAI_BOARD_FALLBACK_MODEL: "fallback-model",
    OPENAI_BOARD_MAX_COMPLETION_TOKENS: "99999",
    TRUST_PROXY: "1",
    ALLOWED_ORIGINS: " https://example.com,https://app.example.com ",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "token",
  });

  assert.equal(config.port, 9000);
  assert.equal(config.attuneEnv, "uat");
  assert.equal(config.model, "base-model");
  assert.equal(config.boardModel, "board-model");
  assert.equal(config.boardFallbackModel, "fallback-model");
  assert.deepEqual(config.boardModelCandidates, ["board-model", "fallback-model"]);
  assert.equal(config.boardMaxCompletionTokens, 5000);
  assert.equal(config.trustProxy, true);
  assert.equal(config.allowedOrigins.includes("https://example.com"), true);
  assert.equal(config.allowedOrigins.includes("https://app.example.com"), true);
  assert.equal(config.supabaseUrl, "https://supabase.example");
  assert.equal(config.supabaseAnonKey, "anon");
  assert.equal(config.supabaseServiceRoleKey, "service");
  assert.equal(config.upstashRedisRestUrl, "https://redis.example");
  assert.equal(config.upstashRedisRestToken, "token");
});
