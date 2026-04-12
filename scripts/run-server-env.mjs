import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config as loadDotenv } from "dotenv";

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const rawTarget = normalize(process.argv[2]).toLowerCase();
  const target = rawTarget === "prod" ? "production" : rawTarget;
  if (target !== "uat" && target !== "production") {
    throw new Error("Usage: node scripts/run-server-env.mjs <uat|production>");
  }

  const rootDir = process.cwd();
  const baseEnvPath = path.resolve(rootDir, ".env");
  const modeEnvPath = path.resolve(rootDir, `.env.${target}`);

  if (fs.existsSync(baseEnvPath)) loadDotenv({ path: baseEnvPath });
  if (fs.existsSync(modeEnvPath)) loadDotenv({ path: modeEnvPath, override: true });

  const nextEnv = {
    ...process.env,
    ATTUNE_ENV: normalize(process.env.ATTUNE_ENV) || target,
  };

  const child = spawn(process.execPath, [path.resolve(rootDir, "server", "index.js")], {
    cwd: rootDir,
    stdio: "inherit",
    env: nextEnv,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});