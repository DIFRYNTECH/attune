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
