export function redactClientErrorText(value, maxLen) {
  const text = typeof value === "string" ? value.trim().slice(0, maxLen) : "";
  if (!text) return undefined;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(access_token|refresh_token|code|token|otp)=([^&#\s]+)/gi, "$1=[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-jwt]");
}

export function registerClientErrorRoutes({
  app,
  enforceAllowedOrigin,
  limitClientError,
  logEvent,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  app.post("/api/client-error", enforceAllowedOrigin, limitClientError, (req, res) => {
    const payload = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

    const message = redactClientErrorText(payload.message, 300) || "client_error";
    const stack = redactClientErrorText(payload.stack, 1200);
    const source = typeof payload.source === "string" ? payload.source.trim().slice(0, 100) : "window.error";
    const pathname = typeof payload.pathname === "string" ? payload.pathname.trim().slice(0, 200) : undefined;
    const userAgent = typeof payload.userAgent === "string" ? payload.userAgent.trim().slice(0, 200) : undefined;

    setRequestErrorCode(req, "client_runtime_error");
    logEvent("error", "client_error", {
      requestId: getRequestLogContext(req).requestId,
      route: req.path,
      source,
      message,
      stack,
      pathname,
      userAgent,
    });

    res.status(202).json({ ok: true });
  });
}
