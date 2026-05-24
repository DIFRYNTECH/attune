import { Ratelimit } from "@upstash/ratelimit";

export function getClientIp(req) {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.ip || "unknown";
}

export function makeMemoryRateLimiter({
  windowMs,
  max,
  keyPrefix,
  logEvent,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  const hits = new Map();
  const cleanupEveryMs = Math.max(10_000, Math.floor(windowMs / 2));
  let lastCleanup = 0;

  function cleanup(now) {
    if (now - lastCleanup < cleanupEveryMs) return;
    lastCleanup = now;
    for (const [key, entry] of hits.entries()) {
      if (!entry || entry.resetAt <= now) hits.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);

    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    cur.count += 1;
    if (cur.count > max) {
      const retryAfter = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      setRequestErrorCode(req, "rate_limited");
      logEvent("warn", "rate_limit_rejected", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        limiter: keyPrefix,
        retryAfter,
      });
      return res.status(429).json({ error: "rate_limited" });
    }
    return next();
  };
}

export function formatRateLimitWindow(windowMs) {
  const totalSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  if (totalSeconds % 86_400 === 0) return `${totalSeconds / 86_400} d`;
  if (totalSeconds % 3_600 === 0) return `${totalSeconds / 3_600} h`;
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} m`;
  return `${totalSeconds} s`;
}

export function makeRateLimiter({
  windowMs,
  max,
  keyPrefix,
  upstashRedis,
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  const memoryFallback = makeMemoryRateLimiter({
    windowMs,
    max,
    keyPrefix,
    logEvent,
    getRequestLogContext,
    setRequestErrorCode,
  });

  if (!upstashRedis) return memoryFallback;

  const ratelimit = new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.slidingWindow(max, formatRateLimitWindow(windowMs)),
    prefix: `attune:${keyPrefix}`,
    analytics: false,
  });

  return async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      const { success, limit, remaining, reset } = await ratelimit.limit(ip);

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
      if (reset) {
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(reset / 1000)));
      }

      if (!success) {
        const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;
        res.setHeader("Retry-After", String(retryAfter));
        setRequestErrorCode(req, "rate_limited");
        logEvent("warn", "rate_limit_rejected", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          limiter: keyPrefix,
          retryAfter,
        });
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      next();
    } catch (error) {
      logEvent("warn", "rate_limit_fallback", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        limiter: keyPrefix,
        error: summarizeError(error),
      });
      memoryFallback(req, res, next);
    }
  };
}
