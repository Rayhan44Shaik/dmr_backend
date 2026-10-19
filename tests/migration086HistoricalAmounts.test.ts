/**
 * Batch C5 — migration 086 historical-data safety.
 *
 * Runs the migration's real SQL against a real, disposable PostgreSQL cluster
 * (set C5_REAL_PG_URL). The migration is applied inside a private schema whose
 * `trip_deliveries` table stands in for the production table, so historical
 * rows can be inserted BEFORE the migration and inspected AFTER it.
 *
 * Contract:
 *   • an existing non-null amount is never rewritten;
 *   • only NULL amounts (with both inputs present) are backfilled;
 *   • a new delivery gets weight × rate;
 *   • changing weight or rate recalculates;
 *   • changing remarks, or updating amount directly, does not;
 *   • NULL inputs never invent or erase an amount.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.C5_REAL_PG_URL;
if (!url) {
  describe("C5 migration 086 historical amounts (real PostgreSQL)", () => {
    it.skip("C5_REAL_PG_URL not set", () => undefined);
  });
} else {
  const migrationPath = fileURLToPath(new URL("../sql/086_trip_delivery_amount_sync.sql", import.meta.url));
  const schema = `c5_mig086_${Date.now().toString(36)}`;
  const client = new pg.Client({ connectionString: url });

  const historical: Record<string, number> = {};

  const amountOf = async (id: number): Promise<number | null> => {
    const res = await client.query<{ amount: string | null }>(
      `SELECT amount::text AS amount FROM trip_deliveries WHERE id = $1`,
      [id]
    );
    assert.equal(res.rowCount, 1, `row ${id} must exist`);
    return res.rows[0].amount == null ? null : Number(res.rows[0].amount);
  };

  before(async () => {
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE trip_deliveries (
        id BIGSERIAL PRIMARY KEY,
        weight NUMERIC,
        rate NUMERIC,
        amount NUMERIC,
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Historical rows, created BEFORE the migration runs.
    const rows: Array<[string, number | null, number | null, number | null]> = [
      ["negotiated", 500, 200, 1234.56], // negotiated amount must survive
      ["null-derivable", 500, 10, null], // backfill: 5,000
      ["null-no-rate", 500, null, null], // cannot derive: stays NULL
      ["explicit-zero", 500, 10, 0], // non-null zero must survive
      ["null-no-weight", null, 10, null], // cannot derive: stays NULL
    ];
    for (const [label, weight, rate, amount] of rows) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, amount, remarks) VALUES ($1,$2,$3,$4) RETURNING id`,
        [weight, rate, amount, label]
      );
      historical[label] = inserted.rows[0].id;
    }

    await client.query(readFileSync(migrationPath, "utf8"));
  });

  after(async () => {
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await client.end();
    }
  });

  describe("C5 migration 086 historical amounts (real PostgreSQL)", () => {
    it("preserves every existing non-null amount", async () => {
      assert.equal(await amountOf(historical.negotiated), 1234.56);
      assert.equal(await amountOf(historical["explicit-zero"]), 0);
    });

    it("backfills only NULL amounts that can be derived", async () => {
      assert.equal(await amountOf(historical["null-derivable"]), 5000);
      assert.equal(await amountOf(historical["null-no-rate"]), null);
      assert.equal(await amountOf(historical["null-no-weight"]), null);
    });

    it("derives the amount for a new delivery", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'new') RETURNING id`
      );
      assert.equal(await amountOf(inserted.rows[0].id), 10000);
    });

    it("recalculates when weight is deliberately changed", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'weight-change') RETURNING id`
      );
      const id = inserted.rows[0].id;
      await client.query(`UPDATE trip_deliveries SET weight = 600 WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 12000);
    });

    it("recalculates when rate is deliberately changed", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'rate-change') RETURNING id`
      );
      const id = inserted.rows[0].id;
      await client.query(`UPDATE trip_deliveries SET rate = 30 WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 15000);
    });

    it("does not touch the amount when unrelated columns change", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'unrelated') RETURNING id`
      );
      const id = inserted.rows[0].id;
      await client.query(`UPDATE trip_deliveries SET remarks = 'just a remark' WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 10000);
    });

    it("does not touch an amount updated directly", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'direct-amount') RETURNING id`
      );
      const id = inserted.rows[0].id;
      await client.query(`UPDATE trip_deliveries SET amount = 999.99 WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 999.99);
    });

    it("keeps the stored amount when an input is cleared", async () => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO trip_deliveries (weight, rate, remarks) VALUES (500, 20, 'cleared') RETURNING id`
      );
      const id = inserted.rows[0].id;
      await client.query(`UPDATE trip_deliveries SET weight = NULL WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 10000, "clearing weight must not erase the stored amount");
      await client.query(`UPDATE trip_deliveries SET weight = 500, rate = NULL WHERE id = $1`, [id]);
      assert.equal(await amountOf(id), 10000, "clearing rate must not erase the stored amount");
    });
  });
}
