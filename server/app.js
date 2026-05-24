import express from "express";
import OpenAI from "openai";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { TASKS } from "../src/data/tasks.js";
import { getServerConfig } from "./config.js";
import { getDistributedRateLimitConfigError } from "./lib/rateLimitConfig.js";
import {
  createRequestLoggingMiddleware,
  getRequestLogContext,
  logEvent,
  setRequestErrorCode,
  setRequestUserId,
  summarizeError,
} from "./lib/httpLogging.js";
import {
  apiHardeningHeaders,
  createCorsMiddleware,
  createEnforceAllowedOrigin,
  createIsOriginAllowed,
  createJsonErrorMiddleware,
} from "./lib/securityMiddleware.js";
import { makeRateLimiter } from "./lib/rateLimit.js";
import { makeTtlCache } from "./lib/cache.js";
import { createRequireAuthedUser } from "./lib/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerClientErrorRoutes } from "./routes/clientError.js";
import { registerBillingRoutes, registerPaddleWebhookRoute } from "./routes/billing.js";
import { registerAiRoutes } from "./routes/ai.js";
import { createAiQuotaService } from "./services/aiQuota.js";

export function createApp({ config = getServerConfig() } = {}) {
  const {
    attuneEnv,
    openAiApiKey,
    model,
    boardTotalTaskCount,
    boardModel,
    boardFallbackModel,
    boardModelCandidates,
    boardAiCandidateCount,
    boardMaxCompletionTokens,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    trustProxy,
  } = config;

  const openAiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
  const isOriginAllowed = createIsOriginAllowed(config);

  const upstashRedis = upstashRedisRestUrl && upstashRedisRestToken
    ? Redis.fromEnv()
    : null;

  const rateLimitConfigError = getDistributedRateLimitConfigError({
    attuneEnv,
    hasDistributedStore: Boolean(upstashRedis),
    allowMemoryOverride: process.env.ALLOW_MEMORY_RATE_LIMITING === "1",
  });

  if (rateLimitConfigError) {
    throw new Error(rateLimitConfigError);
  }

  const supabaseAuth = supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

  const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

  const app = express();
  if (trustProxy) app.set("trust proxy", 1);

  app.use(createRequestLoggingMiddleware());

  registerPaddleWebhookRoute({
    app,
    supabaseAdmin,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
  });

  app.use(express.json({ limit: "64kb" }));

  app.use(createJsonErrorMiddleware({
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
  }));
  app.use(createCorsMiddleware({ isOriginAllowed }));
  app.use(apiHardeningHeaders);

  const enforceAllowedOrigin = createEnforceAllowedOrigin({
    isOriginAllowed,
    logEvent,
    getRequestLogContext,
    setRequestErrorCode,
  });

  const boardCache = makeTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 250 });
  const noteCache = makeTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 400 });
  const planCatalogCache = makeTtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 8 });

  const rateLimiterDeps = {
    upstashRedis,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
  };
  const limitBoard = makeRateLimiter({ ...rateLimiterDeps, windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "board" });
  const limitNote = makeRateLimiter({ ...rateLimiterDeps, windowMs: 10 * 60 * 1000, max: 60, keyPrefix: "note" });
  const limitClientError = makeRateLimiter({ ...rateLimiterDeps, windowMs: 10 * 60 * 1000, max: 20, keyPrefix: "client-error" });
  const limitBilling = makeRateLimiter({ ...rateLimiterDeps, windowMs: 10 * 60 * 1000, max: 30, keyPrefix: "billing" });

  registerHealthRoutes(app);
  registerClientErrorRoutes({
    app,
    enforceAllowedOrigin,
    limitClientError,
    logEvent,
    getRequestLogContext,
    setRequestErrorCode,
  });

  const requireAuthedUser = createRequireAuthedUser({
    supabaseAuth,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
    setRequestUserId,
  });

  registerBillingRoutes({
    app,
    supabaseAdmin,
    enforceAllowedOrigin,
    limitBilling,
    requireAuthedUser,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
    setRequestUserId,
  });

  const {
    getUserAiContext,
    reserveAiQuota,
    finalizeReservedAiUsage,
    rejectForQuota,
  } = createAiQuotaService({
    supabaseAdmin,
    defaultModel: model,
    planCatalogCache,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
    setRequestUserId,
  });

  registerAiRoutes({
    app,
    enforceAllowedOrigin,
    limitBoard,
    limitNote,
    requireAuthedUser,
    supabaseAdmin,
    openAiApiKey,
    defaultModel: model,
    boardModel,
    boardFallbackModel,
    boardModelCandidates,
    boardAiCandidateCount,
    boardTotalTaskCount,
    boardMaxCompletionTokens,
    openAiClient,
    OpenAIClient: OpenAI,
    tasksByLevel: TASKS,
    boardCache,
    noteCache,
    getUserAiContext,
    reserveAiQuota,
    finalizeReservedAiUsage,
    rejectForQuota,
    logEvent,
    summarizeError,
    getRequestLogContext,
    setRequestErrorCode,
    setRequestUserId,
  });

  return app;
}
