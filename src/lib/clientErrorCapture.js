import { getApiUrl } from "./api";

let installed = false;
const recentErrorTs = new Map();
const DEDUPE_WINDOW_MS = 30_000;

function trimString(value, maxLen) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function shouldReport(signature) {
  const now = Date.now();
  const last = recentErrorTs.get(signature) || 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;
  recentErrorTs.set(signature, now);

  if (recentErrorTs.size > 100) {
    for (const [key, ts] of recentErrorTs.entries()) {
      if (now - ts > DEDUPE_WINDOW_MS) recentErrorTs.delete(key);
    }
  }

  return true;
}

function postClientError(payload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(getApiUrl("/api/client-error"), blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  fetch(getApiUrl("/api/client-error"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function buildPayload({ source, message, stack }) {
  return {
    source: trimString(source, 100) || "window.error",
    message: trimString(message, 300) || "client_error",
    stack: trimString(stack, 2000),
    href: typeof window !== "undefined" ? trimString(window.location.href, 300) : "",
    pathname: typeof window !== "undefined" ? trimString(window.location.pathname, 200) : "",
    userAgent: typeof navigator !== "undefined" ? trimString(navigator.userAgent, 200) : "",
  };
}

function handleWindowError(event) {
  const message = trimString(event?.message, 300) || trimString(event?.error?.message, 300) || "window_error";
  const stack = trimString(event?.error?.stack, 2000);
  const payload = buildPayload({
    source: trimString(event?.filename, 100) || "window.error",
    message,
    stack,
  });

  const signature = `${payload.source}|${payload.message}|${payload.stack}`;
  if (!shouldReport(signature)) return;
  postClientError(payload);
}

function handleUnhandledRejection(event) {
  const reason = event?.reason;
  const message = typeof reason === "string"
    ? trimString(reason, 300)
    : trimString(reason?.message, 300) || "unhandled_rejection";
  const stack = trimString(reason?.stack, 2000);
  const payload = buildPayload({
    source: "window.unhandledrejection",
    message,
    stack,
  });

  const signature = `${payload.source}|${payload.message}|${payload.stack}`;
  if (!shouldReport(signature)) return;
  postClientError(payload);
}

export function installClientErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
}