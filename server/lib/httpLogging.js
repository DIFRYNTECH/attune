import { randomUUID } from "node:crypto";

export function createRequestId() {
  try {
    return randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function logEvent(level, event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function summarizeError(error) {
  const err = error && typeof error === "object" ? error : null;
  const stack = typeof err?.stack === "string"
    ? err.stack.split("\n").slice(0, 6).join("\n")
    : undefined;

  return {
    name: typeof err?.name === "string" ? err.name : undefined,
    message: typeof err?.message === "string" ? err.message : String(error || "unknown_error"),
    stack,
  };
}

export function getRequestLogContext(req) {
  if (!req.attuneRequestLog) {
    req.attuneRequestLog = {
      requestId: createRequestId(),
      startMs: Date.now(),
      route: req.path,
      userId: null,
      errorCode: null,
    };
  }
  return req.attuneRequestLog;
}

export function setRequestUserId(req, userId) {
  if (!userId || typeof userId !== "string") return;
  getRequestLogContext(req).userId = userId;
}

export function setRequestErrorCode(req, errorCode) {
  if (!errorCode || typeof errorCode !== "string") return;
  getRequestLogContext(req).errorCode = errorCode;
}

export function createRequestLoggingMiddleware() {
  return (req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      next();
      return;
    }

    const context = getRequestLogContext(req);
    res.setHeader("X-Request-Id", context.requestId);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      let nextBody = body;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        if (typeof body.error === "string") setRequestErrorCode(req, body.error);
        nextBody = { ...body, requestId: context.requestId };
      }
      return originalJson(nextBody);
    };

    res.on("finish", () => {
      const current = getRequestLogContext(req);
      logEvent("info", "api_request", {
        requestId: current.requestId,
        method: req.method,
        route: req.path,
        status: res.statusCode,
        durationMs: Date.now() - current.startMs,
        userId: current.userId,
        errorCode: current.errorCode,
      });
    });

    next();
  };
}
