/**
 * Farm Payment multi-load support (Accounts → Farm Payment only).
 *
 * One authoritative parent Farm Payment per completed trip, with a complete
 * load-level breakdown (legId/load/farm/rate/amount) in `loads`, plus
 * load-scoped rate updates that recompute the parent aggregate as the exact
 * sum of submitted load amounts.
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

let seq = 0;
const tag = () => `MLFP-${Date.now()}-${(seq += 1)}`;

interface LegSeed {
  farm: string;
  birdType: string;
  birds: number;
  weight: number;
  rate?: number | null;
  amount?: number | null;
  submitted?: boolean;
}

async function seedTrip(opts: {
  status?: string;
  deleted?: boolean;
  rate?: number;
  legs?: LegSeed[];
}): Promise<number> {
  const name = tag();
  const trip = await pool.query<{ id: number }>(
    `INSERT INTO trips (
       trip_no, trip_date, status, deleted, pickup_step_submitted,
       source_farm, vehicle_no, supervisor_name, farm_bird_type,
       total_birds, dc_weight, farm_rate, farm_amount
     ) VALUES ($1, '2026-11-01', $2, $3, TRUE,
       'Legacy Farm', 'TS09ML0001', 'Sup', 'Broiler',
       10, 20, $4, 0) RETURNING id`,
    [name, opts.status ?? "Completed", opts.deleted ?? false, opts.rate ?? 0]
  );
  const tripId = trip.rows[0].id;
  for (const [index, leg] of (opts.legs ?? []).entries()) {
    await pool.query(
      `INSERT INTO trip_legs (
         trip_id, leg_index, source_farm, farm_bird_type,
         total_birds, dc_weight, farm_rate, farm_amount,
         farm_step_submitted, pickup_step_submitted
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
      [
        tripId,
        index + 1,
        leg.farm,
        leg.birdType,
        leg.birds,
        leg.weight,
        leg.rate ?? null,
        leg.amount ?? null,
        leg.submitted ?? true,
      ]
    );
  }
  return tripId;
}

async function findRow(tripId: number) {
  const listed = await farmPaymentsService.list();
  assert.ok(Array.isArray(listed));
  const row = listed.find((candidate) => candidate.tripId === tripId);
  assert.ok(row, `trip ${tripId} must be listed`);
  return row;
}

describe("farm payment multi-load", () => {
  it("legacy completed trip with no legs shows one direct trip row", async () => {
    const tripId = await seedTrip({ rate: 50 });
    const row = await findRow(tripId);
    assert.equal(row.loads.length, 0);
    assert.equal(row.totalBirds, 10);
    assert.equal(row.dcWeight, 20);
    assert.equal(row.rate, 50);
    assert.equal(row.amount, 1000);
  });

  it("one submitted load stays a single direct row (no -L1 split server-side)", async () => {
    const tripId = await seedTrip({
      rate: 50,
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80 }],
    });
    const row = await findRow(tripId);
    assert.equal(row.loads.length, 1);
    assert.equal(row.loads[0].load, 1);
    assert.ok(row.loads[0].legId > 0);
    assert.equal(row.totalBirds, 40);
    assert.equal(row.dcWeight, 80);
    // Missing leg rate falls back to the parent rate for display/calculation.
    assert.equal(row.loads[0].rate, 50);
    assert.equal(row.loads[0].amount, 4000);
    assert.equal(row.amount, 4000);
  });

  it("two submitted loads carry their own farms, birds, weights, rates and amounts", async () => {
    const tripId = await seedTrip({
      legs: [
        { farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 },
        { farm: "Farm B", birdType: "Country Chicken", birds: 60, weight: 120, rate: 100, amount: 12000 },
      ],
    });
    const row = await findRow(tripId);
    assert.equal(row.loads.length, 2);
    const [l1, l2] = row.loads;
    assert.deepEqual([l1.load, l2.load], [1, 2]);
    assert.ok(l1.legId > 0 && l2.legId > 0 && l1.legId !== l2.legId);
    assert.equal(l1.farmName, "Farm A");
    assert.equal(l2.farmName, "Farm B");
    assert.equal(l1.birdType, "Broiler");
    assert.equal(l2.birdType, "Country Chicken");
    assert.equal(l1.totalBirds, 40);
    assert.equal(l2.totalBirds, 60);
    assert.equal(l1.dcWeight, 80);
    assert.equal(l2.dcWeight, 120);
    assert.equal(l1.rate, 90);
    assert.equal(l2.rate, 100);
    assert.equal(l1.amount, 7200);
    assert.equal(l2.amount, 12000);
    // Parent aggregate is the exact sum of load amounts.
    assert.equal(row.totalBirds, 100);
    assert.equal(row.dcWeight, 200);
    assert.equal(row.amount, 19200);
  });

  it("missing leg amount is calculated from effective rate × leg DC weight", async () => {
    const tripId = await seedTrip({
      rate: 70,
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 10, weight: 25, rate: 80 }],
    });
    const row = await findRow(tripId);
    assert.equal(row.loads[0].rate, 80);
    assert.equal(row.loads[0].amount, 2000);
    assert.equal(row.amount, 2000);
  });

  it("an unsubmitted second load does not split the payment", async () => {
    const tripId = await seedTrip({
      rate: 50,
      legs: [
        { farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80 },
        { farm: "Farm B", birdType: "Broiler", birds: 60, weight: 120, submitted: false },
      ],
    });
    const row = await findRow(tripId);
    assert.equal(row.loads.length, 1);
    assert.equal(row.totalBirds, 40);
    assert.equal(row.dcWeight, 80);
  });

  it("updating L1 does not change L2 (and vice versa)", async () => {
    const tripId = await seedTrip({
      legs: [
        { farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 },
        { farm: "Farm B", birdType: "Broiler", birds: 60, weight: 120, rate: 100, amount: 12000 },
      ],
    });
    const before = await findRow(tripId);
    const l1LegId = before.loads[0].legId;

    const [afterL1] = await farmPaymentsService.upsertMany([
      { tripId, legId: l1LegId, load: 1, rate: 95 },
    ]);
    const l1 = afterL1.loads.find((load) => load.legId === l1LegId)!;
    const l2 = afterL1.loads.find((load) => load.legId !== l1LegId)!;
    assert.equal(l1.rate, 95);
    assert.equal(l1.amount, 7600);
    assert.equal(l2.rate, 100, "L2 rate untouched");
    assert.equal(l2.amount, 12000, "L2 amount untouched");
    assert.equal(afterL1.amount, 19600, "parent is the exact sum of load amounts");

    const l2LegId = afterL1.loads.find((load) => load.legId !== l1LegId)!.legId;
    const [afterL2] = await farmPaymentsService.upsertMany([
      { tripId, legId: l2LegId, load: 2, rate: 110 },
    ]);
    const l1Again = afterL2.loads.find((load) => load.legId === l1LegId)!;
    assert.equal(l1Again.rate, 95, "L1 untouched by the L2 update");
    assert.equal(l1Again.amount, 7600);
    assert.equal(afterL2.amount, 7600 + 13200);
  });

  it("saving two changed loads updates both correctly", async () => {
    const tripId = await seedTrip({
      legs: [
        { farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 },
        { farm: "Farm B", birdType: "Broiler", birds: 60, weight: 120, rate: 100, amount: 12000 },
      ],
    });
    const before = await findRow(tripId);
    const [saved] = await farmPaymentsService.upsertMany(
      before.loads.map((load) => ({ tripId, legId: load.legId, load: load.load, rate: 50 }))
    );
    assert.deepEqual(saved.loads.map((load) => load.rate), [50, 50]);
    assert.deepEqual(saved.loads.map((load) => load.amount), [4000, 6000]);
    assert.equal(saved.amount, 10000);
    assert.equal(saved.rate, 50, "uniform rate stays the single effective rate");
  });

  it("rejects a cross-trip legId and leaves aggregates untouched", async () => {
    const tripA = await seedTrip({
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 }],
    });
    const tripB = await seedTrip({
      legs: [{ farm: "Farm B", birdType: "Broiler", birds: 10, weight: 20, rate: 50, amount: 1000 }],
    });
    const rowB = await findRow(tripB);
    const beforeA = await findRow(tripA);
    await assert.rejects(
      () => farmPaymentsService.upsertMany([{ tripId: tripA, legId: rowB.loads[0].legId, rate: 1 }]),
      (err: unknown) => err instanceof AppError
    );
    const afterA = await findRow(tripA);
    assert.deepEqual(afterA, beforeA, "failed update writes nothing (atomic)");
  });

  it("rejects a leg update for a load index that does not match", async () => {
    const tripId = await seedTrip({
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80 }],
    });
    const row = await findRow(tripId);
    await assert.rejects(
      () => farmPaymentsService.upsertMany([{ tripId, legId: row.loads[0].legId, load: 2, rate: 10 }]),
      (err: unknown) => err instanceof AppError
    );
  });

  it("repeated identical save is idempotent", async () => {
    const tripId = await seedTrip({
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 }],
    });
    const row = await findRow(tripId);
    const input = { tripId, legId: row.loads[0].legId, load: 1, rate: 90 };
    const [first] = await farmPaymentsService.upsertMany([input]);
    const [second] = await farmPaymentsService.upsertMany([input]);
    assert.deepEqual(second, first);
  });

  it("deleted and non-completed trips stay excluded", async () => {
    const deleted = await seedTrip({ deleted: true });
    const pending = await seedTrip({ status: "Pending" });
    const listed = await farmPaymentsService.list();
    assert.ok(Array.isArray(listed));
    assert.ok(!listed.some((row) => row.tripId === deleted));
    assert.ok(!listed.some((row) => row.tripId === pending));
  });

  it("parseFarmPaymentUpsertBody validates legId and load", async () => {
    assert.deepEqual(parseFarmPaymentUpsertBody([{ tripId: 1, legId: 3, load: 2, rate: 10 }]), [
      { tripId: 1, legId: 3, load: 2, rate: 10 },
    ]);
    assert.throws(
      () => parseFarmPaymentUpsertBody([{ tripId: 1, legId: -2, rate: 10 }]),
      (err: unknown) => err instanceof AppError
    );
    assert.throws(
      () => parseFarmPaymentUpsertBody([{ tripId: 1, legId: 2.5, rate: 10 }]),
      (err: unknown) => err instanceof AppError
    );
    assert.throws(
      () => parseFarmPaymentUpsertBody([{ tripId: 1, legId: 2, load: 5, rate: 10 }]),
      (err: unknown) => err instanceof AppError
    );
  });

  it("settlement fields still save on a multi-load trip without disturbing loads", async () => {
    const tripId = await seedTrip({
      legs: [{ farm: "Farm A", birdType: "Broiler", birds: 40, weight: 80, rate: 90, amount: 7200 }],
    });
    const [saved] = await farmPaymentsService.upsertMany([
      { tripId, paidAmount: 1000, paymentDate: "2026-11-02", paymentMode: "Cash", referenceNo: "R1" },
    ]);
    assert.equal(saved.paidAmount, 1000);
    assert.equal(saved.paymentDate, "2026-11-02");
    assert.equal(saved.loads[0].rate, 90, "settlement-only save keeps leg rates");
    assert.equal(saved.amount, 7200);
  });
});
