import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

// Shared pool for runtime, migrations, and seed scripts.
// Connection target comes from DATABASE_URL (default: dmr_poultries @ localhost:5432 / user dmr).
// P3 (pool-exhaustion closure): connectionTimeoutMillis bounds the wait for a
// free client, so an exhausted pool surfaces a timely controlled error (via
// errorHandler, sanitized + correlated) instead of hanging the request.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // A pathological report/query must not hold a pool client indefinitely.
  // query_timeout is a client-side guard; statement_timeout is enforced by
  // PostgreSQL for every statement on the connection.
  statement_timeout: 30_000,
  query_timeout: 35_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error", err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
