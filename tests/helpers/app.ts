/**
 * Starts the real Express app (src/index.ts) on an ephemeral port and exposes
 * an HTTP test client. Must be called AFTER process.env.DATABASE_URL is set
 * and the schema has been applied.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface TestApp {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const { app } = await import("../../src/index.js");
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      const { pool } = await import("../../src/config/db.js");
      await pool.end();
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function getJson(
  baseUrl: string,
  apiPath: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${apiPath}`);
  return { status: res.status, body: await res.json() };
}
