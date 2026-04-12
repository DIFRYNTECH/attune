import { createClient } from "@supabase/supabase-js";

import { isNativePlatform } from "./platform";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const publicAppUrl = normalizeBaseUrl(import.meta.env.VITE_PUBLIC_APP_URL);
const authRedirectUrl = normalizeAbsoluteUrl(import.meta.env.VITE_AUTH_REDIRECT_URL);
const authCallbackPath = normalizeCallbackPath(import.meta.env.VITE_AUTH_CALLBACK_PATH || "/auth/callback");
const nativeAuthScheme = normalizeScheme(import.meta.env.VITE_NATIVE_AUTH_SCHEME || "com.attune.app");
const nativeAuthHost = normalizeHost(import.meta.env.VITE_NATIVE_AUTH_HOST || "login-callback");

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

function normalizeScheme(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/:\/\/$/, "");
}

function normalizeHost(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Build the Supabase client with settings that work in both browser
 * and Capacitor WebView environments.
 *
 * Key considerations:
 *  - `persistSession: true` keeps the session in localStorage (which
 *    Capacitor's WebView supports out of the box).
 *  - `detectSessionInUrl: true` lets Supabase pick up hosted callback
 *    tokens from the URL hash/query when the app is opened via redirect.
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
    })
  : null;

let _client = null;

export function getSupabaseClient() {
	if (_client) return _client;
	_client = supabase;
	return _client;
}

/**
 * Returns the correct redirect URL for hosted callback auth, accounting for
 * Capacitor deep links vs normal browser origin.
 *
 * On the web this returns `window.location.origin` (e.g. https://app.attune.com/).
 * Inside Capacitor it returns the custom scheme deep-link that the Android
 * manifest is configured to handle (com.attune.app://login-callback/).
 */
export function getAuthRedirectUrl() {
  if (authRedirectUrl) return authRedirectUrl;
  if (publicAppUrl) return `${publicAppUrl}${authCallbackPath}`;
  if (isNativePlatform() && nativeAuthScheme && nativeAuthHost) return `${nativeAuthScheme}://${nativeAuthHost}/`;

  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }
  return undefined;
}