import { getAiBoardAccessError, getAiDailyNoteAccessError } from "../lib/aiAccess.js";
import { clampString } from "../services/aiText.js";
import { buildBoardRequest, generateBoardWithRetries } from "../services/boardService.js";
import { buildDailyNoteRequest, generateDailyNoteWithRetries } from "../services/dailyNoteService.js";
import { isRecoverableAiLookupError } from "../services/aiQuota.js";

export function registerAiRoutes({
  app,
  enforceAllowedOrigin,
  limitBoard,
  limitNote,
  requireAuthedUser,
  supabaseAdmin,
  openAiApiKey,
  defaultModel,
  boardModel,
  boardFallbackModel,
  boardModelCandidates,
  boardAiCandidateCount,
  boardTotalTaskCount,
  boardMaxCompletionTokens,
  openAiClient,
  OpenAIClient,
  tasksByLevel,
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
}) {
  app.post("/api/generate-board", enforceAllowedOrigin, limitBoard, async (req, res) => {
    try {
      const totalStartedMs = Date.now();
      const authedUser = await requireAuthedUser(req, res);
      if (!authedUser) return;
      setRequestUserId(req, authedUser.id);

      if (!supabaseAdmin) {
        setRequestErrorCode(req, "supabase_admin_not_configured");
        logEvent("error", "ai_generate_board_admin_missing", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
        });
        res.status(503).json({ error: "supabase_admin_not_configured" });
        return;
      }

      const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
      const allowedLevels = new Set(["rest", "gentle", "light", "steady", "capable", "brave"]);
      const levelRaw = (clampString(req.body?.level, 24) || "gentle").toLowerCase();
      const level = allowedLevels.has(levelRaw) ? levelRaw : "gentle";
      const aiContextStartedMs = Date.now();
      const aiContext = await getUserAiContext(authedUser.id);
      const aiContextMs = Date.now() - aiContextStartedMs;

      const accessError = getAiBoardAccessError(aiContext);
      if (accessError) {
        setRequestErrorCode(req, accessError);
        logEvent("warn", "ai_generate_board_plus_required", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext?.planId,
          aiContextMs,
        });
        res.status(403).json({ error: accessError });
        return;
      }

      if (!openAiApiKey) {
        setRequestErrorCode(req, "ai_not_configured_openai_key_missing");
        logEvent("error", "ai_generate_board_openai_missing", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext.planId,
          aiContextMs,
        });
        res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
        return;
      }

      const boardRequest = buildBoardRequest({
        tasksByLevel,
        userId: authedUser.id,
        checkin,
        level,
        boardHistory: req.body?.boardHistory,
        useNoteForAi: aiContext.useNoteForAi,
        totalTaskCount: boardTotalTaskCount,
        aiCandidateCount: boardAiCandidateCount,
      });
      const cached = boardCache.get(boardRequest.cacheKey);
      if (cached) {
        logEvent("info", "ai_generate_board_cache_hit", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext.planId,
        });
        res.json(cached);
        return;
      }

      const quotaReservation = await reserveAiQuota({
        userId: authedUser.id,
        kind: "generate_board",
        model: boardModel,
        planId: aiContext.planId,
        useNoteForAi: aiContext.useNoteForAi,
        dailyLimit: aiContext.dailyLimit,
        monthlyLimit: aiContext.monthlyLimit,
      });
      if (!quotaReservation.allowed) {
        await rejectForQuota(req, res, {
          userId: authedUser.id,
          kind: "generate_board",
          model: boardModel,
          planId: aiContext.planId,
          quota: quotaReservation,
        });
        return;
      }

      const generationStartedMs = Date.now();
      const generated = await generateBoardWithRetries(openAiClient, {
        system: boardRequest.system,
        userPayload: boardRequest.userPayload,
        models: boardModelCandidates,
        candidateCount: boardAiCandidateCount,
        finalCount: boardTotalTaskCount,
        fallbackTasks: boardRequest.fallbackTasks,
        boardHistory: boardRequest.boardHistory,
        maxCompletionTokens: boardMaxCompletionTokens,
        totalTaskCount: boardTotalTaskCount,
        summarizeError,
      });
      const generationMs = Date.now() - generationStartedMs;
      const resolvedBoardModel = generated.model || boardModel;
      const attemptedBoardModels = Array.isArray(generated.attemptedModels) ? generated.attemptedModels : boardModelCandidates;
      const boardModelErrors = Array.isArray(generated.modelErrors) ? generated.modelErrors : [];
      const boardFallbackUsed = resolvedBoardModel !== boardModel;

      if (!generated.ok) {
        setRequestErrorCode(req, generated.error || "invalid_board");
        logEvent("warn", "ai_generate_board_invalid", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          errorCode: generated.error || "invalid_board",
          planId: aiContext.planId,
          model: resolvedBoardModel,
          requestedModel: boardModel,
          fallbackModel: boardFallbackModel,
          attemptedModels: attemptedBoardModels,
          modelErrors: boardModelErrors,
          aiContextMs,
          generationMs,
        });
        await finalizeReservedAiUsage({
          usageId: quotaReservation.usageId,
          success: false,
          errorCode: generated.error || "invalid_board",
          model: resolvedBoardModel,
          meta: {
            planId: aiContext.planId,
            useNoteForAi: aiContext.useNoteForAi,
            model: resolvedBoardModel,
            requestedModel: boardModel,
            fallbackModel: boardFallbackModel,
            attemptedModels: attemptedBoardModels,
            modelErrors: boardModelErrors,
          },
        });
        res.status(502).json({ error: generated.error || "Invalid board" });
        return;
      }

      const warnings = [
        ...(Array.isArray(generated.warnings) ? generated.warnings : []),
        ...(boardRequest.noteGuard.omitted ? ["Omitted unsafe optional note context."] : []),
      ];

      const payload = {
        tasks: generated.tasks,
        meta: {
          model: resolvedBoardModel,
          requestedModel: boardModel,
          fallbackModel: boardFallbackModel,
          attemptedModels: attemptedBoardModels,
          fallbackUsed: boardFallbackUsed,
          createdAt: new Date().toISOString(),
          warnings,
          quality: generated.quality || null,
          strategy: "ai",
          cached: false,
        },
      };

      await finalizeReservedAiUsage({
        usageId: quotaReservation.usageId,
        success: true,
        model: resolvedBoardModel,
        meta: {
          planId: aiContext.planId,
          useNoteForAi: aiContext.useNoteForAi,
          model: resolvedBoardModel,
          requestedModel: boardModel,
          fallbackModel: boardFallbackModel,
          attemptedModels: attemptedBoardModels,
          fallbackUsed: boardFallbackUsed,
          strategy: "ai",
          quality: generated.quality || null,
        },
      });

      boardCache.set(boardRequest.cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });

      logEvent("info", "ai_generate_board_completed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        planId: aiContext.planId,
        model: resolvedBoardModel,
        requestedModel: boardModel,
        fallbackModel: boardFallbackModel,
        attemptedModels: attemptedBoardModels,
        fallbackUsed: boardFallbackUsed,
        aiContextMs,
        generationMs,
        totalMs: Date.now() - totalStartedMs,
        aiTaskCount: generated.tasks.length,
        quality: generated.quality || null,
        warnings: warnings.length,
      });

      res.json(payload);
    } catch (err) {
      const errorCode = String(err?.message || "");
      if (isRecoverableAiLookupError(errorCode)) {
        setRequestErrorCode(req, errorCode);
        logEvent("warn", "ai_generate_board_recoverable_error", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: getRequestLogContext(req).userId,
          errorCode,
          error: summarizeError(err),
        });
        res.status(503).json({ error: errorCode });
        return;
      }
      setRequestErrorCode(req, "generate_board_failed");
      logEvent("error", "ai_generate_board_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(err),
      });
      res.status(500).json({ error: "Failed to generate board" });
    }
  });

  app.post("/api/daily-note", enforceAllowedOrigin, limitNote, async (req, res) => {
    try {
      const authedUser = await requireAuthedUser(req, res);
      if (!authedUser) return;
      setRequestUserId(req, authedUser.id);

      if (!supabaseAdmin) {
        setRequestErrorCode(req, "supabase_admin_not_configured");
        logEvent("error", "ai_daily_note_admin_missing", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
        });
        res.status(503).json({ error: "supabase_admin_not_configured" });
        return;
      }

      const checkin = req.body?.checkin && typeof req.body.checkin === "object" ? req.body.checkin : {};
      const level = clampString(req.body?.level, 24) || "gentle";
      const today = clampString(req.body?.today, 20) || "";
      const aiContextStartedMs = Date.now();
      const aiContext = await getUserAiContext(authedUser.id);
      const aiContextMs = Date.now() - aiContextStartedMs;

      const accessError = getAiDailyNoteAccessError(aiContext);
      if (accessError) {
        setRequestErrorCode(req, accessError);
        logEvent("warn", "ai_daily_note_plus_required", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext?.planId,
          aiContextMs,
        });
        res.status(403).json({ error: accessError });
        return;
      }

      if (!openAiApiKey) {
        setRequestErrorCode(req, "ai_not_configured_openai_key_missing");
        logEvent("error", "ai_daily_note_openai_missing", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext.planId,
          aiContextMs,
        });
        res.status(503).json({ error: "AI not configured (missing OPENAI_API_KEY)." });
        return;
      }

      const dailyNoteRequest = buildDailyNoteRequest({
        userId: authedUser.id,
        checkin,
        level,
        today,
        useNoteForAi: aiContext.useNoteForAi,
      });
      const cached = noteCache.get(dailyNoteRequest.cacheKey);
      if (cached) {
        logEvent("info", "ai_daily_note_cache_hit", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          planId: aiContext.planId,
        });
        res.json(cached);
        return;
      }

      const quotaReservation = await reserveAiQuota({
        userId: authedUser.id,
        kind: "daily_note",
        model: defaultModel,
        planId: aiContext.planId,
        useNoteForAi: aiContext.useNoteForAi,
        dailyLimit: aiContext.dailyLimit,
        monthlyLimit: aiContext.monthlyLimit,
      });
      if (!quotaReservation.allowed) {
        await rejectForQuota(req, res, {
          userId: authedUser.id,
          kind: "daily_note",
          model: defaultModel,
          planId: aiContext.planId,
          quota: quotaReservation,
        });
        return;
      }

      const client = new OpenAIClient({ apiKey: openAiApiKey });

      const generated = await generateDailyNoteWithRetries(client, {
        system: dailyNoteRequest.system,
        userPayload: dailyNoteRequest.userPayload,
        model: defaultModel,
      });

      if (!generated.ok) {
        setRequestErrorCode(req, generated.error || "invalid_note");
        logEvent("warn", "ai_daily_note_invalid", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: authedUser.id,
          errorCode: generated.error || "invalid_note",
          planId: aiContext.planId,
        });
        await finalizeReservedAiUsage({
          usageId: quotaReservation.usageId,
          success: false,
          errorCode: generated.error || "invalid_note",
          meta: { planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
        });
        res.status(502).json({ error: generated.error || "Invalid note" });
        return;
      }

      const payload = {
        note: generated.note,
        meta: {
          model: defaultModel,
          createdAt: new Date().toISOString(),
          cached: false,
          optionalNoteOmitted: dailyNoteRequest.meta.optionalNoteOmitted,
        },
      };

      await finalizeReservedAiUsage({
        usageId: quotaReservation.usageId,
        success: true,
        meta: { planId: aiContext.planId, useNoteForAi: aiContext.useNoteForAi },
      });

      noteCache.set(dailyNoteRequest.cacheKey, { ...payload, meta: { ...payload.meta, cached: true } });
      res.json(payload);
    } catch (err) {
      const errorCode = String(err?.message || "");
      if (isRecoverableAiLookupError(errorCode)) {
        setRequestErrorCode(req, errorCode);
        logEvent("warn", "ai_daily_note_recoverable_error", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          userId: getRequestLogContext(req).userId,
          errorCode,
          error: summarizeError(err),
        });
        res.status(503).json({ error: errorCode });
        return;
      }
      setRequestErrorCode(req, "daily_note_failed");
      logEvent("error", "ai_daily_note_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(err),
      });
      res.status(500).json({ error: "Failed to generate daily note" });
    }
  });
}
