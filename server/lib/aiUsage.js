function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function identifier(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value) ? value : null;
}

export function normalizeCompletionUsage(usage) {
  const inputTokens = count(usage?.prompt_tokens);
  const outputTokens = count(usage?.completion_tokens);
  const totalTokens = count(usage?.total_tokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null ||
      totalTokens !== inputTokens + outputTokens) return null;
  const cached = count(usage?.prompt_tokens_details?.cached_tokens);
  return { inputTokens, outputTokens, totalTokens,
    cachedInputTokens: cached !== null && cached <= inputTokens ? cached : null };
}

// Track SDK-visible metadata only. A missing response is unknown spend, not zero.
export function createAiUsageTracker({ now = Date.now } = {}) {
  const attempts = [];
  return {
    async complete(client, request) {
      const started = now();
      const base = { requestedModel: identifier(request.model) };
      try {
        const response = await client.chat.completions.create(request);
        attempts.push({ ...base, outcome: "response", model: identifier(response.model),
          requestId: identifier(response._request_id), latencyMs: Math.max(0, now() - started),
          usage: normalizeCompletionUsage(response.usage) });
        return response;
      } catch (error) {
        const status = count(error?.status);
        attempts.push({ ...base, outcome: "error", model: null, usage: null,
          requestId: identifier(error?.request_id), latencyMs: Math.max(0, now() - started),
          status: status !== null && status >= 400 && status <= 599 ? status : null });
        throw error;
      }
    },
    snapshot() {
      const known = attempts.filter(attempt => attempt.usage !== null);
      return {
        schemaVersion: 1,
        scope: "sdk_visible_responses",
        sdkCalls: attempts.length,
        knownUsageCalls: known.length,
        usageComplete: attempts.length > 0 && known.length === attempts.length,
        cachedUsageComplete: attempts.length > 0 && known.length === attempts.length &&
          known.every(attempt => attempt.usage.cachedInputTokens !== null),
        knownTokens: known.reduce((sum, { usage }) => ({
          inputTokens: sum.inputTokens + usage.inputTokens,
          outputTokens: sum.outputTokens + usage.outputTokens,
          totalTokens: sum.totalTokens + usage.totalTokens,
          cachedInputTokens: sum.cachedInputTokens + (usage.cachedInputTokens ?? 0),
        }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 }),
        attempts: structuredClone(attempts),
      };
    },
  };
}
