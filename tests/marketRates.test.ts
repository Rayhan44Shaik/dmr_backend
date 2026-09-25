/**
 * Market Rates master — production coverage against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP → marketRatesService → PostgreSQL → HTTP.
 *
 * Covers the existing /api/masters/market-rates contract:
 *   • empty list behavior on a fresh database
 *   • batch upsert with one row per business date (re-save updates in place,
 *     never duplicates)
 *   • date-range filtering
 *   • duplicate dates within a batch rejected (409)
 *   • invalid rows rejected (400) without partial writes
 *   • authorization (401 without a session)
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, putJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

function rateRow(businessDate: string, vij: number) {
  return {
    businessDate,
    vij, gun: 100, rp: 100, sneha: 100,
    vencobRate: 100, vencobVii: 100, vencobGun: 100, associationVii: 100,
    c17: 100, c15: 100, c13: 100, c12: 100, c10: 100,
  };
}

describe("Market rates master", () => {
  it("1. empty database lists no rows", async () => {
    const { status, body } = await getJson(baseUrl, "/api/masters/market-rates");
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it("2. batch upsert stores one row per business date in range order", async () => {
    const saved = await putJson(baseUrl, "/api/masters/market-rates/batch", [
      rateRow("2026-06-02", 120),
      rateRow("2026-06-01", 110),
    ]);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.length, 2);

    const all = await getJson(baseUrl, "/api/masters/market-rates");
    assert.equal(all.body.length, 2);
    assert.equal(all.body[0].businessDate, "2026-06-01");
    assert.equal(all.body[0].vij, 110);
    assert.equal(all.body[1].businessDate, "2026-06-02");

    const ranged = await getJson(
      baseUrl, "/api/masters/market-rates?fromDate=2026-06-02&toDate=2026-06-02"
    );
    assert.equal(ranged.body.length, 1);
    assert.equal(ranged.body[0].businessDate, "2026-06-02");
  });

  it("3. re-saving a date updates its single row instead of duplicating", async () => {
    const resaved = await putJson(baseUrl, "/api/masters/market-rates/batch", [rateRow("2026-06-01", 150)]);
    assert.equal(resaved.status, 200);
    assert.equal(resaved.body[0].vij, 150);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM market_rates WHERE business_date = '2026-06-01'`
    );
    assert.equal(count.rows[0].c, 1, "no duplicate master record for the date");
    const all = await getJson(baseUrl, "/api/masters/market-rates");
    assert.equal(all.body.length, 2);
  });

  it("4. duplicate dates within one batch are rejected", async () => {
    const dup = await putJson(baseUrl, "/api/masters/market-rates/batch", [
      rateRow("2026-06-03", 120),
      rateRow("2026-06-03", 130),
    ]);
    assert.equal(dup.status, 409);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM market_rates WHERE business_date = '2026-06-03'`
    );
    assert.equal(count.rows[0].c, 0, "rejected batch writes nothing");
  });

  it("5. invalid rows are rejected without partial writes", async () => {
    for (const rows of [
      [],
      [{ ...rateRow("2026-06-04", 120), businessDate: "" }],
      [{ ...rateRow("2026-06-04", 120), businessDate: "06-04-2026" }],
      [{ ...rateRow("2026-06-04", 120), vij: -5 }],
      [{ ...rateRow("2026-06-04", 120), vij: "a lot" }],
      [rateRow("2026-06-05", 120), { ...rateRow("2026-06-06", 120), gun: -1 }],
    ]) {
      const res = await putJson(baseUrl, "/api/masters/market-rates/batch", rows);
      assert.equal(res.status, 400, JSON.stringify(rows).slice(0, 120));
    }
    const leaked = await pool.query(
      `SELECT COUNT(*)::int AS c FROM market_rates WHERE business_date IN ('2026-06-04','2026-06-05','2026-06-06')`
    );
    assert.equal(leaked.rows[0].c, 0, "failed batches persist nothing");
  });

  it("6. market rates require authorization", async () => {
    const anonGet = await fetch(`${baseUrl}/api/masters/market-rates`);
    assert.equal(anonGet.status, 401);
    const anonPut = await fetch(`${baseUrl}/api/masters/market-rates/batch`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([rateRow("2026-06-07", 120)]),
    });
    assert.equal(anonPut.status, 401);
  });
});
