import { spawnSync } from "node:child_process";

for (const script of ["simulate-recommendations.mjs", "probe-recommendation-release.mjs", "grade-recommendations.mjs"]) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
