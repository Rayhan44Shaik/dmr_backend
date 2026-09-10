/**
 * In-memory PostgreSQL test server (PGlite WASM build behind the pg-gateway
 * Postgres wire protocol implementation). Lets the real `pg` driver and the
 * real application code (pool, services, migrations) run against a genuine
 * PostgreSQL engine without external infrastructure.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { fromNodeSocket } from "pg-gateway/node";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export interface TestDb {
  url: string;
  close: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.waitReady;

  const server = net.createServer((socket) => {
    fromNodeSocket(socket, {
      serverVersion: "16.3 (PGlite test server)",
      async onMessage(data) {
        return db.execProtocolRaw(data);
      },
    }).catch((err: unknown) => {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== "ECONNRESET") console.error("[test-db] connection error:", error.message);
    });
    socket.on("error", () => {
      /* connection teardown noise */
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test database failed to start");
  }

  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

/**
 * Applies the repository SQL migrations (sql/*.sql) to the current pool.
 * The pgcrypto extension line is skipped for PGlite (gen_random_uuid() is a
 * core function in PostgreSQL 13+); the rest of the schema is applied as-is.
 */
export async function applySchema(): Promise<void> {
  const { pool } = await import("../../src/config/db.js");
  const client = await pool.connect();
  try {
    const files = fs
      .readdirSync(path.join(repoRoot, "sql"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      let sql = fs.readFileSync(path.join(repoRoot, "sql", file), "utf8");
      if (file === "001_init_schema.sql") {
        sql = sql.replace(
          'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
          "-- pgcrypto not bundled in PGlite; gen_random_uuid() is core in PostgreSQL 13+"
        );
      }
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

/** Wipes all master data between tests (also resets serial sequences). */
export async function resetMasters(): Promise<void> {
  const { pool } = await import("../../src/config/db.js");
  await pool.query(
    `TRUNCATE employees, vehicles, farms, shops, banks, bird_types, routes, master_number_counters RESTART IDENTITY CASCADE`
  );
}

export async function countRows(table: string): Promise<number> {
  const { pool } = await import("../../src/config/db.js");
  const result = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${table}`
  );
  return result.rows[0].n;
}
