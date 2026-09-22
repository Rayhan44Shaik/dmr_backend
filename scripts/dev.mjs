/**
 * Single-entry dev runner: free PORT, then run tsx watch.
 * Prevents the common Windows failure mode where several `npm run dev`
 * (or frontend `dev:api` + a second backend terminal) fight over :4000.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.dirname(fileURLToPath(import.meta.url));
const freePort = path.join(root, "free-port.mjs");

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      // Never shell-wrap node.exe — Windows breaks on "C:\Program Files\...".
      shell: false,
      ...opts,
    });
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`killed by ${signal}`));
      else resolve(code ?? 0);
    });
    child.on("error", reject);
  });
}

const freeCode = await run(process.execPath, [freePort], {
  env: process.env,
});
if (freeCode !== 0) {
  console.warn(`free-port exited with code ${freeCode} — continuing anyway`);
}

const watchScript = path.resolve(root, "watch.mjs");

const child = spawn(
  process.execPath,
  [watchScript],
  {
    stdio: "inherit",
    env: process.env,
    cwd: path.resolve(root, ".."),
  }
);

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
