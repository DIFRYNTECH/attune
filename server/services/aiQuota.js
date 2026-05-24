import { hasPlusEntitlement, normalizePlanId } from "./entitlements.js";

export const DEFAULT_PLAN_LIMITS = {
  free: { daily: 20, monthly: null },
  plus: { daily: 200, monthly: null },
};

export function buildQuotaRejectionBody({ planId, quota }) {
  return {
    error: quota.error,
    planId,
    period: quota.period,
    limit: quota.limit,
    used: quota.used,
    remaining: 0,
    resetAt: quota.resetAt,
  };
}

export function isRecoverableAiLookupError(errorCode) {
  return [
    "supabase_admin_not_configured",
    "profile_lookup_failed",
    "entitlement_lookup_failed",
    "plan_lookup_failed",
    "quota_lookup_failed",
  ].includes(String(errorCode || ""));
}

export function createAiQuotaService({
  supabaseAdmin,
  defaultModel,
  planCatalogCache,
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
  setRequestUserId,
}) {
  async function recordAiUsage({ userId, kind, model, success, errorCode, meta }) {
    if (!supabaseAdmin) return;
    if (!userId || typeof userId !== "string") return;

    const payload = {
      user_id: userId,
      kind: typeof kind === "string" && kind ? kind : "unknown",
      model: typeof model === "string" && model ? model : defaultModel,
      success: success !== false,
      error_code: typeof errorCode === "string" ? errorCode : null,
      meta: meta && typeof meta === "object" ? meta : {},
    };

    try {
      await supabaseAdmin.from("ai_usage").insert(payload);
    } catch (error) {
      logEvent("warn", "ai_usage_record_failed", {
        userId,
        kind: payload.kind,
        success: payload.success,
        errorCode: payload.error_code,
        error: summarizeError(error),
      });
    }
  }

  async function getUserAiContext(userId) {
    if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

    const [profileResult, entitlementResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("use_note_for_ai")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_entitlements")
        .select("plan_id, status, current_period_end")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) throw new Error("profile_lookup_failed");
    if (entitlementResult.error) throw new Error("entitlement_lookup_failed");

    const requestedPlanId = hasPlusEntitlement(entitlementResult.data) ? "plus" : "free";
    let planRow = planCatalogCache.get(requestedPlanId);
    let planError = null;

    if (!planRow) {
      const planResult = await supabaseAdmin
        .from("plan_catalog")
        .select("plan_id, ai_daily_request_limit, ai_monthly_request_limit, is_active")
        .eq("plan_id", requestedPlanId)
        .maybeSingle();

      planRow = planResult.data || null;
      planError = planResult.error || null;

      if (planRow) planCatalogCache.set(requestedPlanId, planRow);
    }

    if (planError) throw new Error("plan_lookup_failed");

    const planIsUsable =
      !!planRow &&
      planRow.is_active !== false &&
      normalizePlanId(planRow.plan_id) === requestedPlanId;
    const resolvedPlanId = planIsUsable ? requestedPlanId : "free";
    const defaults = DEFAULT_PLAN_LIMITS[resolvedPlanId];

    return {
      useNoteForAi: profileResult.data?.use_note_for_ai !== false,
      planId: resolvedPlanId,
      dailyLimit:
        planIsUsable && Number.isInteger(planRow.ai_daily_request_limit)
          ? planRow.ai_daily_request_limit
          : defaults.daily,
      monthlyLimit:
        planIsUsable &&
        (planRow.ai_monthly_request_limit === null || Number.isInteger(planRow.ai_monthly_request_limit))
          ? planRow.ai_monthly_request_limit
          : defaults.monthly,
    };
  }

  async function reserveAiQuota({ userId, kind, model, planId, useNoteForAi, dailyLimit, monthlyLimit }) {
    if (!supabaseAdmin) throw new Error("supabase_admin_not_configured");

    const rpcResult = await supabaseAdmin.rpc("reserve_ai_usage_quota", {
      p_user_id: userId,
      p_kind: kind,
      p_model: typeof model === "string" && model ? model : defaultModel,
      p_meta: {
        cached: false,
        planId,
        useNoteForAi,
        quotaState: "reserved",
      },
      p_daily_limit: Number.isInteger(dailyLimit) ? dailyLimit : null,
      p_monthly_limit: Number.isInteger(monthlyLimit) ? monthlyLimit : null,
      p_reservation_ttl_seconds: 900,
    });

    if (rpcResult.error) throw new Error("quota_lookup_failed");

    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (!row) throw new Error("quota_lookup_failed");

    return {
      allowed: row.allowed === true,
      error: typeof row.error === "string" ? row.error : "",
      usageId: typeof row.usage_id === "string" ? row.usage_id : "",
      dailyUsed: Number(row.daily_used) || 0,
      monthlyUsed: Number(row.monthly_used) || 0,
      resetAt: row.reset_at || null,
      period: row.period || null,
      used: row.period === "month" ? Number(row.monthly_used) || 0 : Number(row.daily_used) || 0,
      limit: row.period === "month" ? monthlyLimit : dailyLimit,
    };
  }

  async function finalizeReservedAiUsage({ usageId, success, errorCode, meta, model }) {
    if (!supabaseAdmin || !usageId) return;

    const current = await supabaseAdmin
      .from("ai_usage")
      .select("meta")
      .eq("id", usageId)
      .maybeSingle();

    if (current.error) throw new Error("ai_usage_finalize_failed");

    const nextMeta = {
      ...(current.data?.meta && typeof current.data.meta === "object" && !Array.isArray(current.data.meta) ? current.data.meta : {}),
      ...(meta && typeof meta === "object" ? meta : {}),
      cached: false,
      quotaState: success ? "billed" : "released",
    };

    const updates = {
      success: success === true,
      error_code: success === true ? null : (typeof errorCode === "string" ? errorCode : null),
      meta: nextMeta,
    };

    if (typeof model === "string" && model) {
      updates.model = model;
    }

    const result = await supabaseAdmin
      .from("ai_usage")
      .update(updates)
      .eq("id", usageId)
      .select("id")
      .single();

    if (result.error) throw new Error("ai_usage_finalize_failed");
  }

  async function rejectForQuota(req, res, { userId, kind, model, planId, quota }) {
    setRequestUserId(req, userId);
    setRequestErrorCode(req, quota.error);
    logEvent("warn", "ai_quota_rejected", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      userId,
      kind,
      planId,
      errorCode: quota.error,
      period: quota.period,
      limit: quota.limit,
      used: quota.used,
      resetAt: quota.resetAt,
    });

    await recordAiUsage({
      userId,
      kind,
      model,
      success: false,
      errorCode: quota.error,
      meta: {
        cached: false,
        planId,
        dailyUsed: quota.dailyUsed,
        monthlyUsed: quota.monthlyUsed,
        limit: quota.limit,
        period: quota.period,
      },
    });

    res.status(429).json(buildQuotaRejectionBody({ planId, quota }));
  }

  return {
    recordAiUsage,
    getUserAiContext,
    reserveAiQuota,
    finalizeReservedAiUsage,
    rejectForQuota,
  };
}
