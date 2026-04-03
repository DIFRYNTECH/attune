import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = process.cwd();
  const envFromFile = loadDotenv({ path: path.resolve(rootDir, ".env") }).parsed || {};
  const publicAppUrl = String(process.env.VITE_PUBLIC_APP_URL || envFromFile.VITE_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const apiBaseUrl = String(process.env.VITE_API_BASE_URL || envFromFile.VITE_API_BASE_URL || publicAppUrl || "").trim().replace(/\/+$/, "");

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "react-vendor";
            }

            if (id.includes("node_modules/@supabase/")) {
              return "supabase-vendor";
            }

            if (id.includes("node_modules/@capacitor/") || id.includes("src/lib/mobile")) {
              return "mobile-vendor";
            }

            if (id.includes("node_modules/fluentui-emoji")) {
              return "emoji-assets";
            }
          },
        },
      },
    },
    define: {
      __ATTUNE_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          "**/.git/**",
          "**/.next/**",
          "**/out/**"
        ]
      }
    },
    plugins: [react()],
  };
})
