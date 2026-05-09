const STRICT_RATE_LIMIT_ENVS = new Set(["production", "prod", "uat", "staging"]);

export function requiresDistributedRateLimiting(attuneEnv) {
  return STRICT_RATE_LIMIT_ENVS.has(String(attuneEnv || "").trim().toLowerCase());
}

export function getDistributedRateLimitConfigError({ attuneEnv, hasDistributedStore, allowMemoryOverride }) {
  if (!requiresDistributedRateLimiting(attuneEnv)) return "";
  if (hasDistributedStore) return "";
  if (allowMemoryOverride) return "";

  return "distributed_rate_limiting_required";
}
