import assert from "node:assert/strict";
import test from "node:test";
import {
  getDistributedRateLimitConfigError,
  requiresDistributedRateLimiting,
} from "./rateLimitConfig.js";

test("production-like environments require distributed rate limiting", () => {
  assert.equal(requiresDistributedRateLimiting("production"), true);
  assert.equal(requiresDistributedRateLimiting("prod"), true);
  assert.equal(requiresDistributedRateLimiting("uat"), true);
  assert.equal(requiresDistributedRateLimiting("staging"), true);
  assert.equal(requiresDistributedRateLimiting("development"), false);
  assert.equal(requiresDistributedRateLimiting("test"), false);
});

test("strict environments fail closed without Upstash unless explicitly overridden", () => {
  assert.equal(
    getDistributedRateLimitConfigError({
      attuneEnv: "uat",
      hasDistributedStore: false,
      allowMemoryOverride: false,
    }),
    "distributed_rate_limiting_required"
  );

  assert.equal(
    getDistributedRateLimitConfigError({
      attuneEnv: "uat",
      hasDistributedStore: true,
      allowMemoryOverride: false,
    }),
    ""
  );

  assert.equal(
    getDistributedRateLimitConfigError({
      attuneEnv: "uat",
      hasDistributedStore: false,
      allowMemoryOverride: true,
    }),
    ""
  );
});
