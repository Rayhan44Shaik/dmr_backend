import assert from "node:assert/strict";
import { after, test } from "node:test";

const runRealPostgresGate = process.env.ORDERS_REAL_PG === "1";

test(
  "Orders: 50 concurrent collection-container creates leave exactly one persisted container",
  { skip: !runRealPostgresGate },
  async () => {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    assert.match(
      databaseUrl,
      /\/[^/]*_e2e(?:\?|$)/i,
      "This destructive concurrency test must target an isolated *_e2e database."
    );

    const { pool } = await import("../src/config/db.js");
    const { tripsService } = await import("../src/services/tripsService.js");

    const suffix = Math.floor(Math.random() * 3650);
    const base = new Date("2035-01-01T00:00:00Z");
    base.setUTCDate(base.getUTCDate() + suffix);
    const day = base.toISOString().slice(0, 10);

    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 50 }, () =>
          tripsService.createDraft({
            tripDate: day,
            remarks: "[ORDER_COLLECTION]",
          })
        )
      );

      const fulfilled = attempts.filter((r) => r.status === "fulfilled");
      const rejected = attempts.filter((r) => r.status === "rejected");

      assert.equal(
        fulfilled.length,
        1,
        "the database uniqueness invariant must allow exactly one winner"
      );
      assert.equal(
        rejected.length,
        49,
        "all competing creates must be rejected rather than creating duplicate containers"
      );

      const persisted = await pool.query(
        `SELECT id, trip_no
           FROM trips
          WHERE trip_date = $1
            AND deleted = FALSE
            AND vehicle_id IS NULL
            AND remarks = '[ORDER_COLLECTION]'`,
        [day]
      );

      assert.equal(persisted.rowCount, 1, "exactly one collection container must persist");
      assert.ok(Number(persisted.rows[0].id) > 0);
      assert.match(String(persisted.rows[0].trip_no), /^TR-/);
    } finally {
      await pool.query(
        `DELETE FROM trips
          WHERE trip_date = $1
            AND vehicle_id IS NULL
            AND remarks = '[ORDER_COLLECTION]'`,
        [day]
      );
      await pool.end();
    }
  }
);
