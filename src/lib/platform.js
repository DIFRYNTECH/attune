/**
 * Platform detection for Capacitor / web hybrid.
 *
 * Uses @capacitor/core directly so native detection is synchronous
 * and reliable inside the Capacitor WebView.
 */

import { Capacitor } from "@capacitor/core";

/**
 * Returns true when the app is running inside a native Capacitor shell
 * (Android or iOS), false when running in a normal browser.
 */
export function isNativePlatform() {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Returns the current platform string.
 * "android" | "ios" | "web"
 */
export function getPlatform() {
  try {
    return Capacitor?.getPlatform?.() || "web";
  } catch {
    return "web";
  }
}

/**
 * Returns true when running on Android (native).
 */
export function isAndroid() {
  return getPlatform() === "android";
}

/**
 * Returns true when running on iOS (native).
 */
export function isIOS() {
  return getPlatform() === "ios";
}
