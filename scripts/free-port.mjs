/**
 * Free TCP PORT before starting the API so only one backend owns it.
 * Also stops leftover `tsx watch` processes for this backend repo — common when
 * frontend `npm run dev` and a separate backend terminal both start watchers.
 */
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const port = Number(process.env.PORT ?? 4000);
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendNeedle = backendRoot.toLowerCase();

function uniq(pids) {
  return [...new Set(pids.filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid))];
}

function listeningPidsWin(p) {
  const pids = new Set();
  try {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
    // "TCP    0.0.0.0:4000    0.0.0.0:0    LISTENING    1234"
    const re = new RegExp(String.raw`^\s*TCP\s+\S+:${p}\s+\S+\s+LISTENING\s+(\d+)\s*$`, "im");
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(re);
      if (m) pids.add(Number(m[1]));
    }
  } catch {
    /* ignore */
  }
  return [...pids];
}

function listeningPidsUnix(p) {
  try {
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, { encoding: "utf8" });
    return out
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

/** Extra safety: any tsx watch still pointed at this backend tree. */
function staleWatchPidsWin() {
  try {
    const out = execFileSync(
      "wmic",
      [
        "process",
        "where",
        "name='node.exe'",
        "get",
        "ProcessId,CommandLine",
        "/FORMAT:LIST",
      ],
      { encoding: "utf8", windowsHide: true }
    );
    const blocks = out.split(/\r?\n\r?\n/);
    const pids = [];
    for (const block of blocks) {
      const cmdMatch = block.match(/CommandLine=(.*)/i);
      const pidMatch = block.match(/ProcessId=(\d+)/i);
      if (!cmdMatch || !pidMatch) continue;
      const cmd = String(cmdMatch[1] || "").toLowerCase();
      if (!cmd.includes("tsx") || !cmd.includes("watch")) continue;
      if (!cmd.includes(backendNeedle.replace(/\\/g, "\\").toLowerCase()) && !cmd.includes("dmr-poultries-erp\\backend")) {
        // path may use / or \
        if (!cmd.includes("dmr-poultries-erp") || !cmd.includes("backend")) continue;
      }
      pids.push(Number(pidMatch[1]));
    }
    return pids.filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore", windowsHide: true });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    return true;
  } catch {
    return false;
  }
}

const listenPids =
  process.platform === "win32" ? listeningPidsWin(port) : listeningPidsUnix(port);
const watchPids = process.platform === "win32" ? staleWatchPidsWin() : [];
const pids = uniq([...listenPids, ...watchPids]);

if (pids.length === 0) {
  process.exit(0);
}

for (const pid of pids) {
  const ok = killPid(pid);
  console.log(
    ok
      ? `Freed port ${port} (stopped PID ${pid})`
      : `Could not stop PID ${pid} on port ${port}`
  );
}

await new Promise((r) => setTimeout(r, 500));
