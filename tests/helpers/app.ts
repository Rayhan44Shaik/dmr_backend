/**
 * Boots the production server (src/index.ts, unmodified) as a child process
 * on an ephemeral port and exposes an HTTP test client.
 *
 * Spawning a child process keeps the production entry point untouched — tests
 * talk to the exact same server the app runs in production.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const testAuth = new Map<string, Record<string, string>>();

export interface TestApp {
  baseUrl: string;
  authHeaders: Record<string, string>;
  close: () => Promise<void>;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close();
        reject(new Error("could not allocate test port"));
        return;
      }
      srv.close(() => resolve(address.port));
    });
  });
}

export async function startApp(env: Record<string, string>, requestedPort?: number): Promise<TestApp> {
  const port = requestedPort ?? await getFreePort();
  const { pool } = await import("../../src/config/db.js");
  const { hashPassword } = await import("../../src/utils/passwordHash.js");
  const username = `test-owner-${port}`;
  const password = "Test-only-password-123!";
  await pool.query(`INSERT INTO application_users (username,display_name,password_hash,role) VALUES ($1,'Test Owner',$2,'OWNER')`, [username, await hashPassword(password)]);

  // Test sources normally run through tsx. A precompiled test run is also
  // supported so CI can use Node directly when a platform-level tsx bootstrap
  // is unavailable. Both paths execute the same production entry point.
  const compiledEntry = path.join(repoRoot, "src", "index.js");
  const isCompiledRun = fs.existsSync(compiledEntry);

  const child: ChildProcess = spawn(
    process.execPath,
    isCompiledRun
      ? [compiledEntry]
      : ["-r", path.join(repoRoot, "tests", "helpers", "osUserInfoShim.cjs"), "--import", "tsx", "src/index.ts"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        CORS_ORIGIN: "*",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    if (process.env.DEBUG_TEST_SERVER === "1") process.stderr.write(chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Wait for the health endpoint to come up (the server does
  // `SELECT 1`-equivalent checks before listening).
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`test server exited early (code ${child.exitCode}):\n${stderr}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`test server did not start within 30s:\n${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  if (!login.ok) throw new Error(`test login failed: ${login.status} ${await login.text()}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("test login did not return a session cookie");
  const authHeaders = { cookie };
  testAuth.set(baseUrl, authHeaders);

  return {
    baseUrl,
    authHeaders,
    close: async () => {
      testAuth.delete(baseUrl);
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((resolve) => child.once("exit", () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
        ]);
      }
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    },
  };
}

export async function postJson(
  baseUrl: string,
  apiPath: string,
  body: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(testAuth.get(baseUrl) ?? {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function putJson(
  baseUrl: string,
  apiPath: string,
  body: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(testAuth.get(baseUrl) ?? {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function patchJson(
  baseUrl: string,
  apiPath: string,
  body: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(testAuth.get(baseUrl) ?? {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function getJson(
  baseUrl: string,
  apiPath: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${apiPath}`, { headers: testAuth.get(baseUrl) ?? {} });
  return { status: res.status, body: await res.json() };
}
