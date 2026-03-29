/**
 * useAppInit — single entry-point for app-level boot tasks.
 *
 * Responsibilities:
 *  1. Apply the persisted theme to the document.
 *  2. Run Capacitor-specific setup (deep links, status bar, splash).
 *  3. Restore the Supabase session.
 *  4. Prevent input-zoom on mobile.
 *
 * This hook should be called once, at the top of the App component.
 * It consolidates initialisation that previously lived in multiple
 * useEffect calls scattered around App.jsx and useAttuneStore.
 */

import { useEffect, useRef } from "react";
import { initMobile, preventInputZoom } from "../lib/mobile";

export function useAppInit({ theme }) {
  const didRun = useRef(false);

  // --- One-time initialisation ---
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    // Capacitor deep-link listener, status bar, splash screen.
    initMobile();

    // Prevent double-tap zoom on mobile inputs.
    preventInputZoom();
  }, []);

  // --- Theme sync (runs whenever theme preference changes) ---
  useEffect(() => {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = t;
  }, [theme]);
}
