import assert from "node:assert/strict";
import { after, test } from "node:test";
import { applySchema, startTestDb } from "./helpers/testDb.js";

const db = await startTestDb();
process.env.DATABASE_URL = db.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await pool.end();
  await db.close();
});

test("database uniqueness rejects competing collection-container retries", async () => {
  const day = "2026-09-18";
  const first = await tripsService.createDraft({ tripDate: day, remarks: "[ORDER_COLLECTION]" });
  assert.ok(first.id > 0);
  const attempts = await Promise.allSettled(
    Array.from({ length: 9 }, () =>
      tripsService.createDraft({ tripDate: day, remarks: "[ORDER_COLLECTION]" }),
    ),
  );

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 0);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 9);
  const persisted = await pool.query(
    `SELECT id, trip_no FROM trips
      WHERE trip_date=$1 AND deleted=FALSE AND vehicle_id IS NULL
        AND remarks='[ORDER_COLLECTION]'`,
    [day],
  );
  assert.equal(persisted.rowCount, 1);
  assert.ok(Number(persisted.rows[0].id) > 0);
  assert.ok(String(persisted.rows[0].trip_no).length > 0);
});
