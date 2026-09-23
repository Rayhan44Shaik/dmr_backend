import { applySchema, startTestDb } from "./tests/helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("./src/config/db.js");
await pool.query(`CREATE TABLE IF NOT EXISTS probe_iso (id int primary key, v text)`);

const c1 = await pool.connect();
const c2 = await pool.connect();
await c1.query("BEGIN");
await c1.query(`INSERT INTO probe_iso VALUES (1, 'uncommitted')`);
const seen = await c2.query(`SELECT * FROM probe_iso WHERE id = 1`);
console.log("C2 SEES UNCOMMITTED ROW:", seen.rowCount);
// advisory lock check
const t0 = Date.now();
await Promise.all([
  (async () => {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(999001)");
    await c.query("SELECT pg_sleep(2)");
    await c.query("COMMIT");
    c.release();
  })(),
  (async () => {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(999001)");
    await c.query("COMMIT");
    c.release();
    console.log("SECOND ADVISORY LOCK ACQUIRED AFTER MS:", Date.now() - t0);
  })(),
]);
await c1.query("ROLLBACK");
c1.release();
c2.release();
await pool.end();
await testDb.close();
