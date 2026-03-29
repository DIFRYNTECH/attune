import { createClient } from "@supabase/supabase-js";

import { isNativePlatform } from "./platform";

export const AUTH_REQUEST_DEBUG_EVENT = "attune:auth-request-debug";

function emitAuthRequestDebug(detail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(AUTH_REQUEST_DEBUG_EVENT, {
      detail,
    }),
  );
}

async function instrumentedAuthFetch(input, init) {
  const requestUrl = typeof input === "string" ? input : input?.url;

  if (typeof requestUrl === "string" && requestUrl.includes("/auth/v1/otp")) {
    try {
      const parsed = new URL(requestUrl);
      emitAuthRequestDebug({
        url: requestUrl,
        redirectTo: parsed.searchParams.get("redirect_to") || "",
      });
    } catch {
      emitAuthRequestDebug({
        url: requestUrl,
        redirectTo: "",
      });
    }
  }

  return fetch(input, init);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const publicAppUrl = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL);
const authRedirectUrl = normalizeAbsoluteUrl(import.meta.env.VITE_AUTH_REDIRECT_URL);
const authCallbackPath = normalizeCallbackPath(import.meta.env.VITE_AUTH_CALLBACK_PATH || "/auth/callback");

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  return trimmed.replace(/\/+$/, "");
}

function normalizeAbsoluteUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeCallbackPath(value) {
  if (typeof value !== "string") return "/auth/callback";

  const trimmed = value.trim();
  if (!trimmed) return "/auth/callback";

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Build the Supabase client with settings that work in both browser
 * and Capacitor WebView environments.
 *
 * Key considerations:
 *  - `persistSession: true` keeps the session in localStorage (which
 *    Capacitor's WebView supports out of the box).
 *  - `detectSessionInUrl: true` lets Supabase pick up magic-link tokens
 *    from the URL hash/query when the app is opened via redirect.
 *  - `flowType: "pkce"` (Proof Key for Code Exchange) is the
 *    recommended auth flow for mobile/native apps.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
      global: {
        fetch: instrumentedAuthFetch,
      },
    })
  : null;

let _client = null;

export function getSupabaseClient() {
	if (_client) return _client;
	_client = supabase;
	return _client;
}

/**
 * Returns the correct redirect URL for magic-link auth, accounting for
 * Capacitor deep links vs normal browser origin.
 *
 * On the web this returns `window.location.origin` (e.g. https://app.attune.com/).
 * Inside Capacitor it returns the custom scheme deep-link that the Android
 * manifest is configured to handle (com.attune.app://login-callback/).
 */
export function getAuthRedirectUrl() {
  if (authRedirectUrl) return authRedirectUrl;
  if (publicAppUrl) return `${publicAppUrl}${authCallbackPath}`;
  if (isNativePlatform()) return "com.attune.app://login-callback/";

  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }
  return undefined;
}