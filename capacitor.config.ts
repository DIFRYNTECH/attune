import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.attune.app",
  appName: "Attune",
  webDir: "dist",
  bundledWebRuntime: false,

  android: {
    // Keep mixed content disabled in production builds.
    allowMixedContent: false,
    // Use Chrome-based WebView for dev tools support.
    webContentsDebuggingEnabled: false,
  },

  server: {
    // Use the standard Capacitor scheme so cookies / localStorage persist.
    androidScheme: "https",
    // Allow navigation to Supabase for auth redirects.
    allowNavigation: ["*.supabase.co"],
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#f0f2f5",
      showSpinner: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#f0f2f5",
    },
  },
};

export default config;
