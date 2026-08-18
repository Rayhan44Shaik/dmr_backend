/**
 * Test-only process entry. Production `src/index.ts` has no SIGTERM handler,
 * so SIGKILL/SIGTERM dropped the child's `pg` sockets into pg-gateway as
 * ECONNRESET. This wrapper ends the child's pool first, then exits.
 */
import { pool } from "../../src/config/db.js";

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await pool.end();
  } catch {
    /* pool already ended */
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
process.on("message", (msg) => {
  if (msg === "shutdown") void stop();
});

await import("../../src/index.js");
