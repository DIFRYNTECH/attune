import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function testsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? testsIn(path) : /\.test\.[cm]?js$/.test(entry.name) ? [path] : [];
  });
}

const result = spawnSync(process.execPath, ["--test", ...testsIn("src"), ...testsIn("server")], { stdio: "inherit" });
process.exit(result.status ?? 1);
