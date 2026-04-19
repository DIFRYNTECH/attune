import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config as loadDotenv } from "dotenv";

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn("cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
          cwd: process.cwd(),
          stdio: "inherit",
          env,
        })
      : spawn(command, args, {
          cwd: process.cwd(),
          stdio: "inherit",
          env,
        });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });
}

async function main() {
  const rawTarget = normalize(process.argv[2]).toLowerCase();
  const target = rawTarget === "prod" ? "production" : rawTarget;
  if (target !== "uat" && target !== "production") {
    throw new Error("Usage: node scripts/cap-sync-env.mjs <uat|production>");
  }

  const rootDir = process.cwd();
  const baseEnvPath = path.resolve(rootDir, ".env");
  const modeEnvPath = path.resolve(rootDir, `.env.${target}`);

  if (fs.existsSync(baseEnvPath)) loadDotenv({ path: baseEnvPath });
  if (fs.existsSync(modeEnvPath)) loadDotenv({ path: modeEnvPath, override: true });

  const defaultAppId = target === "uat" ? "com.attune.app.uat" : "com.attune.app";
  const defaultAppName = target === "uat" ? "Attune UAT" : "Attune";
  const defaultAuthHost = target === "uat" ? "uat.attune.app" : "app.attune.app";

  const nextEnv = {
    ...process.env,
    ATTUNE_APP_ID: normalize(process.env.ATTUNE_APP_ID) || defaultAppId,
    ATTUNE_APP_NAME: normalize(process.env.ATTUNE_APP_NAME) || defaultAppName,
    ATTUNE_AUTH_SCHEME: normalize(process.env.ATTUNE_AUTH_SCHEME) || (normalize(process.env.ATTUNE_APP_ID) || defaultAppId),
    ATTUNE_AUTH_CUSTOM_HOST: normalize(process.env.ATTUNE_AUTH_CUSTOM_HOST) || "login-callback",
    ATTUNE_AUTH_HOST: normalize(process.env.ATTUNE_AUTH_HOST) || defaultAuthHost,
    ATTUNE_AUTH_PATH_PREFIX: normalize(process.env.ATTUNE_AUTH_PATH_PREFIX) || "/auth/callback",
    VITE_NATIVE_AUTH_SCHEME: normalize(process.env.VITE_NATIVE_AUTH_SCHEME) || (normalize(process.env.ATTUNE_AUTH_SCHEME) || normalize(process.env.ATTUNE_APP_ID) || defaultAppId),
    VITE_NATIVE_AUTH_HOST: normalize(process.env.VITE_NATIVE_AUTH_HOST) || (normalize(process.env.ATTUNE_AUTH_CUSTOM_HOST) || "login-callback"),
  };

  const androidEnvFile = path.resolve(rootDir, "android", "attune.env.properties");

  // Preserve signing vars — read from environment, fall through to existing file if present.
  const existingProps = {};
  if (fs.existsSync(androidEnvFile)) {
    for (const line of fs.readFileSync(androidEnvFile, "utf8").split("\n")) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length) existingProps[k.trim()] = rest.join("=").trim();
    }
  }
  const signingVars = ["ATTUNE_KEYSTORE_PATH", "ATTUNE_KEYSTORE_PASSWORD", "ATTUNE_KEY_ALIAS", "ATTUNE_KEY_PASSWORD"];
  const signingLines = signingVars
    .map((k) => {
      const val = normalize(process.env[k]) || existingProps[k] || "";
      return val ? `${k}=${val}` : null;
    })
    .filter(Boolean);

  fs.writeFileSync(
    androidEnvFile,
    [
      `ATTUNE_APP_ID=${nextEnv.ATTUNE_APP_ID}`,
      `ATTUNE_APP_NAME=${nextEnv.ATTUNE_APP_NAME}`,
      `ATTUNE_AUTH_SCHEME=${nextEnv.ATTUNE_AUTH_SCHEME}`,
      `ATTUNE_AUTH_CUSTOM_HOST=${nextEnv.ATTUNE_AUTH_CUSTOM_HOST}`,
      `ATTUNE_AUTH_HOST=${nextEnv.ATTUNE_AUTH_HOST}`,
      `ATTUNE_AUTH_PATH_PREFIX=${nextEnv.ATTUNE_AUTH_PATH_PREFIX}`,
      ...signingLines,
    ].join("\n") + "\n",
    "utf8",
  );

  const npxCommand = "npx";

  await run(npxCommand, ["vite", "build", "--mode", target], nextEnv);
  await run(npxCommand, ["cap", "sync", "android"], nextEnv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
