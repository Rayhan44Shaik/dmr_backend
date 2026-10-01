/**
 * Farm payments service — list + bulk upsert against completed trips.
 * Lightweight unit-style checks (no HTTP server): validation + status/amount
 * mapping helpers exercised through the public parse + service against PGlite.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const {
  farmPaymentsService,
  parseFarmPaymentUpsertBody,
} = await import("../src/services/farmPaymentsService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("farmPaymentsService", () => {
  it("rejects malformed upsert bodies", () => {
    assert.throws(() => parseFarmPaymentUpsertBody(null), (err: unknown) => err instanceof AppError);
    assert.throws(
      () => parseFarmPaymentUpsertBody({ payments: [{ tripId: "x" }] }),
      (err: unknown) => err instanceof AppError
    );
  });

  it("lists completed trips and upserts farm payment fields", async () => {
    const trip = await pool.query<{ id: number }>(
      `INSERT INTO trips (
         trip_no, trip_date, status, deleted, pickup_step_submitted,
         source_farm, vehicle_no, supervisor_name, farm_bird_type,
         total_birds, dc_weight, farm_rate, farm_amount
       ) VALUES (
         'TRP-FP-001', '2026-09-10', 'Completed', FALSE, TRUE,
         'Test Farm', 'TS09AB1234', 'Sup One', 'Broiler',
         100, 250.5, 90, 22545
       ) RETURNING id`
    );
    const tripId = trip.rows[0].id;

    const listed = await farmPaymentsService.list();
    assert.ok(Array.isArray(listed), "default list stays a bare array"); const row = listed.find((r) => r.tripId === tripId);
    assert.ok(row);
    assert.equal(row.rate, 90);
    assert.equal(row.amount, 22545);
    assert.equal(row.paidAmount, 0);
    assert.equal(row.status, "Pending");
    assert.equal(row.farmName, "Test Farm");
    assert.equal(row.totalBirds, 100, "Farm Payments uses Step 3 pickup birds");
    assert.equal(row.dcWeight, 250.5, "Farm Payments uses Step 3 DC weight");

    const incomplete = await pool.query<{ id: number }>(
      `INSERT INTO trips (
         trip_no, trip_date, status, deleted, pickup_step_submitted,
         source_farm, vehicle_no, supervisor_name, total_birds, dc_weight
       ) VALUES (
         'TRP-FP-INCOMPLETE', '2026-09-10', 'Pending', FALSE, TRUE,
         'Test Farm', 'TS09AB1234', 'Sup One', 999, 999
       ) RETURNING id`
    );
    const completedOnly = await farmPaymentsService.list();
    assert.ok(Array.isArray(completedOnly));
    assert.ok(!completedOnly.some((candidate) => candidate.tripId === incomplete.rows[0].id),
      "non-completed trips must never appear in Farm Payments");

    const updated = await farmPaymentsService.upsertMany([
      {
        tripId,
        rate: 100,
        paidAmount: 10000,
        paymentDate: "2026-09-11",
        paymentMode: "Cash",
        referenceNo: "REF-1",
      },
    ]);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].rate, 100);
    assert.equal(updated[0].amount, 25050); // 250.5 * 100
    assert.equal(updated[0].paidAmount, 10000);
    assert.equal(updated[0].balance, 15050);
    assert.equal(updated[0].status, "Partially Paid");
    assert.equal(updated[0].paymentMode, "Cash");
    assert.equal(updated[0].referenceNo, "REF-1");

    // Unknown trip ids are skipped (no throw).
    const skipped = await farmPaymentsService.upsertMany([{ tripId: 99999999, rate: 1 }]);
    assert.equal(skipped.length, 0);

    // Optional server pagination (production volumes): the default list stays
    // a bare array; page/limit returns { data, meta } with no overlap.
    for (let i = 0; i < 3; i += 1) {
      await pool.query(
        `INSERT INTO trips (trip_no, trip_date, status, deleted, pickup_step_submitted,
           source_farm, vehicle_no, supervisor_name, total_birds, dc_weight)
         VALUES ($1, '2026-09-12', 'Completed', FALSE, TRUE,
           'Page Farm', 'TS09PG1234', 'Sup Page', 10, 20)`,
        [`TRP-FP-PAGE-${Date.now()}-${i}`]
      );
    }
    const full = await farmPaymentsService.list();
    assert.ok(Array.isArray(full), "default list stays a bare array");
    assert.ok(full.length >= 4);

    const page1 = await farmPaymentsService.list({ pagination: { page: 1, limit: 2, offset: 0 } });
    assert.ok(!Array.isArray(page1) && "data" in page1, "paginated list has meta");
    assert.equal(page1.data.length, 2);
    assert.equal(page1.meta.total, full.length);
    assert.equal(page1.meta.page, 1);
    assert.equal(page1.meta.limit, 2);

    const page2 = await farmPaymentsService.list({ pagination: { page: 2, limit: 2, offset: 2 } });
    assert.ok(!Array.isArray(page2) && "data" in page2);
    const ids1 = new Set(page1.data.map((r) => r.tripId));
    for (const row of page2.data) {
      assert.ok(!ids1.has(row.tripId), "pages do not overlap");
    }
  });

  it("combines every submitted load into one completed-trip farm payment", async () => {
    const trip = await pool.query<{ id: number }>(
      `INSERT INTO trips (
         trip_no, trip_date, status, deleted, pickup_step_submitted, leg_count,
         source_farm, vehicle_no, supervisor_name, farm_bird_type,
         total_birds, dc_weight, farm_rate, farm_amount
       ) VALUES (
         'TRP-FP-MULTI-001', '2026-09-20', 'Completed', FALSE, TRUE, 2,
         'Farm One', 'TS09ML1234', 'Sup Multi', 'Broiler',
         40, 80, 0, 0
       ) RETURNING id`
    );
    const tripId = trip.rows[0].id;

    await pool.query(
      `INSERT INTO trip_legs (
         trip_id, leg_index, source_farm, farm_bird_type,
         total_birds, dc_weight, farm_step_submitted, pickup_step_submitted
       ) VALUES
         ($1, 1, 'Farm One', 'Broiler', 40, 80, TRUE, TRUE),
         ($1, 2, 'Farm Two', 'Country Chicken', 60, 120, TRUE, TRUE)`,
      [tripId]
    );

    const listed = await farmPaymentsService.list();
    assert.ok(Array.isArray(listed));
    const row = listed.find((candidate) => candidate.tripId === tripId);
    assert.ok(row);
    assert.equal(row.totalBirds, 100);
    assert.equal(row.dcWeight, 200);
    assert.equal(row.farmName, "Farm One, Farm Two");
    assert.equal(row.loads.length, 2);
    assert.deepEqual(row.loads.map((load) => [load.load, load.totalBirds, load.dcWeight]), [
      [1, 40, 80],
      [2, 60, 120],
    ]);

    const [saved] = await farmPaymentsService.upsertMany([{ tripId, rate: 10 }]);
    assert.equal(saved.totalBirds, 100);
    assert.equal(saved.dcWeight, 200);
    assert.equal(saved.amount, 2000, "rate applies to Load 1 + Load 2 DC weight");
    assert.equal(saved.loads.length, 2);
  });
});
