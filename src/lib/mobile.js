/**
 * Mobile-specific helpers for Capacitor.
 *
 * Handles:
 *  - Deep-link listener (hosted/custom auth callback on Android/iOS)
 *  - Status bar / safe-area setup
 *  - Keyboard behaviour tweaks
 *  - Splash screen dismiss
 *
 * All imports are lazy so this module never crashes in a plain browser
 * where Capacitor packages aren't installed.
 */

import { isNativePlatform } from "./platform";
import { supabase } from "./supabase";
import { KEYBOARD_VISIBILITY_EVENT } from "./inputViewport";

export const AUTH_CALLBACK_ERROR_EVENT = "attune:auth-callback-error";

let mobileInitPromise = null;
let deepLinkListenerHandle = null;
let lastHandledAuthUrl = null;

function emitAuthCallbackError(message) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(AUTH_CALLBACK_ERROR_EVENT, {
      detail: {
        message: typeof message === "string" && message.trim()
          ? message.trim()
          : "We couldn't complete sign-in. Try requesting a new code.",
      },
    }),
  );
}

async function handleAuthDeepLink(url) {
  if (!url || !supabase || url === lastHandledAuthUrl) return;

  try {
    const hashOrQuery = url.includes("#") ? url.split("#")[1] : url.split("?")[1];
    if (!hashOrQuery) return;

    const params = new URLSearchParams(hashOrQuery);
    const code = params.get("code");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDescription = params.get("error_description") || params.get("error");

    if (!code && !(accessToken && refreshToken) && !errorDescription) return;

    lastHandledAuthUrl = url;

    if (errorDescription) {
      throw new Error(errorDescription);
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return;
    }

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    }
  } catch (error) {
    lastHandledAuthUrl = null;
    emitAuthCallbackError(error?.message);
  }
}

/**
 * Call once at app startup (e.g. in main.jsx or App.jsx useEffect).
 * Sets up Capacitor-specific listeners that make the mobile shell
 * behave correctly.  No-ops gracefully when running in a browser.
 */
export async function initMobile() {
  if (!isNativePlatform()) return;
  if (mobileInitPromise) return mobileInitPromise;

  mobileInitPromise = (async () => {
    // --- Deep-link listener (hosted or custom-scheme auth redirect) ---
    try {
      const { App: CapApp } = await import("@capacitor/app");

      if (!deepLinkListenerHandle) {
        deepLinkListenerHandle = await CapApp.addListener("appUrlOpen", ({ url }) => {
          handleAuthDeepLink(url);
        });
      }

      // Cold start (user taps link when app is closed)
      try {
        const launch = await CapApp.getLaunchUrl();
        await handleAuthDeepLink(launch?.url);
      } catch {
        // ignore
      }
    } catch {
      // @capacitor/app not installed — skip.
    }

    // Native IME events also cover WebViews that resize their layout viewport.
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      const notify = visible => window.dispatchEvent(new CustomEvent(KEYBOARD_VISIBILITY_EVENT, { detail: { visible } }));
      await Keyboard.addListener("keyboardWillShow", () => notify(true));
      await Keyboard.addListener("keyboardDidShow", () => notify(true));
      await Keyboard.addListener("keyboardDidHide", () => notify(false));
    } catch {
      // VisualViewport remains available if native keyboard events are unavailable.
    }

    // --- Splash screen ---
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      SplashScreen.hide().catch(() => {});
    } catch {
      // Plugin not installed — skip.
    }
  })();

  return mobileInitPromise;
}
