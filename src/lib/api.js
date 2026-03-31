import { isNativePlatform } from "./platform";

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

const nativeApiBaseUrl = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_PUBLIC_APP_URL,
);

export function getApiUrl(path) {
  const nextPath = typeof path === "string" ? path.trim() : "";
  if (!nextPath) return nativeApiBaseUrl || "/";
  if (/^https?:\/\//i.test(nextPath)) return nextPath;

  if (isNativePlatform() && nativeApiBaseUrl) {
    return nextPath.startsWith("/") ? `${nativeApiBaseUrl}${nextPath}` : `${nativeApiBaseUrl}/${nextPath}`;
  }

  return nextPath;
}