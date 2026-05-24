export function createIsOriginAllowed({ allowedOrigins, allowedOriginPatterns }) {
  return (origin) => {
    if (allowedOrigins.includes(origin)) return true;
    return allowedOriginPatterns.some((re) => re.test(origin));
  };
}

export function createCorsMiddleware({ isOriginAllowed }) {
  return (req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

export function createJsonErrorMiddleware({
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  return (error, req, res, next) => {
    if (!req.path?.startsWith?.("/api/")) {
      next(error);
      return;
    }

    const errorType = typeof error?.type === "string" ? error.type : "";
    const errorCode =
      errorType === "entity.too.large"
        ? "payload_too_large"
        : error instanceof SyntaxError || errorType === "entity.parse.failed"
          ? "malformed_json"
          : "";

    if (!errorCode) {
      next(error);
      return;
    }

    setRequestErrorCode(req, errorCode);
    logEvent("warn", "api_json_payload_rejected", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      errorCode,
      error: summarizeError(error),
    });

    res.status(errorCode === "payload_too_large" ? 413 : 400).json({ error: errorCode });
  };
}

export function apiHardeningHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
}

export function createEnforceAllowedOrigin({
  isOriginAllowed,
  logEvent,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    if (isOriginAllowed(origin)) return next();
    setRequestErrorCode(req, "forbidden_origin");
    logEvent("warn", "origin_rejected", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      origin,
    });
    return res.status(403).json({ error: "forbidden_origin" });
  };
}
