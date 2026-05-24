export function getBearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

export function createRequireAuthedUser({
  supabaseAuth,
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
  setRequestUserId,
}) {
  return async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      setRequestErrorCode(req, "missing_bearer_token");
      logEvent("warn", "auth_missing_bearer_token", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
      });
      res.status(401).json({ error: "missing_bearer_token" });
      return null;
    }

    if (!supabaseAuth) {
      setRequestErrorCode(req, "supabase_auth_not_configured");
      logEvent("error", "auth_not_configured", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
      });
      res.status(503).json({ error: "supabase_auth_not_configured" });
      return null;
    }

    try {
      const { data, error } = await supabaseAuth.auth.getUser(token);
      if (error || !data?.user?.id) {
        setRequestErrorCode(req, "invalid_token");
        logEvent("warn", "auth_invalid_token", {
          requestId: getRequestLogContext(req).requestId,
          route: req.path,
          error: summarizeError(error),
        });
        res.status(401).json({ error: "invalid_token" });
        return null;
      }
      setRequestUserId(req, data.user.id);
      return data.user;
    } catch (error) {
      setRequestErrorCode(req, "invalid_token");
      logEvent("error", "auth_lookup_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        error: summarizeError(error),
      });
      res.status(401).json({ error: "invalid_token" });
      return null;
    }
  };
}
