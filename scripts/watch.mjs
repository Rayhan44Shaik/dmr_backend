import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(root, "..");
const tsxCli = path.resolve(backendRoot, "node_modules/tsx/dist/cli.mjs");
const entry = path.resolve(backendRoot, "src/index.ts");
const userInfoShim = path.resolve(backendRoot, "tests/helpers/osUserInfoShim.cjs");
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
const nodeOptions = [inheritedNodeOptions, `--require=${userInfoShim}`].filter(Boolean).join(" ");

const child = spawn(process.execPath, [tsxCli, "watch", "--clear-screen=false", entry], {
  stdio: "inherit",
  cwd: backendRoot,
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forward("SIGINT"));
process.once("SIGTERM", () => forward("SIGTERM"));
process.once("SIGHUP", () => forward("SIGHUP"));

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
child.on("error", (error) => {
  console.error("Failed to start backend watcher:", error);
  process.exit(1);
});
