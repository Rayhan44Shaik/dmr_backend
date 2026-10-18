/**
 * IMP-05 — atomic pickup commit: valid early rows + invalid later row must
 * fail completely with zero partial writes and no sequence corruption.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

async function seedTripWithExistingBoxes() {
  const n = String(Date.now()).slice(-6);
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `ATM${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `ATMENG${n}`,
    chassisNumber: `ATMCHS${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `Atomic Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9710${n}`.slice(0, 10).padEnd(10, "0"),
    licenseNumber: `ATMDL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `Atomic Sup ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9720${n}`.slice(0, 10).padEnd(10, "0"),
    salary: 22000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `Atomic Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "Sup",
    phoneNumber: `9730${n}`.slice(0, 10).padEnd(10, "0"),
    village: "V",
    address: "A",
    capacity: 10000,
    status: "Active",
  });
  const existing = [
    { boxNo: 1, birds: 10, weight: 20 },
    { boxNo: 2, birds: 12, weight: 24 },
  ];
  const trip = await tripsService.save(null, {
    tripDate: "2026-09-01",
    status: "Draft",
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    openingMeter: 1000,
    destMeter: 1100,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: existing,
  } as Record<string, unknown>);
  return { trip, existing, vehicle };
}

async function boxSnapshot(tripId: number) {
  const res = await pool.query(
    `SELECT box_no, birds, weight FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`,
    [tripId],
  );
  return res.rows.map((r) => ({
    boxNo: Number(r.box_no),
    birds: Number(r.birds),
    weight: Number(r.weight),
  }));
}

describe("IMP-05 atomic pickup import rollback", () => {
  it("rejects valid-first + invalid-later pickup submit with zero partial writes", async () => {
    const { trip, existing } = await seedTripWithExistingBoxes();
    const before = await boxSnapshot(trip.id);
    assert.deepEqual(before, existing);

    const totalsBefore = await pool.query(
      `SELECT total_birds, dc_weight FROM trips WHERE id = $1`,
      [trip.id],
    );

    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "pickup", {
          boxDetails: [
            { boxNo: 1, birds: 40, weight: 80 },
            { boxNo: 2, birds: 35, weight: 70 },
            { boxNo: 3, birds: -5, weight: 10 }, // deliberate invalid later row
          ],
          dcPhotoKey: "atomic-dc",
          dcPhotoMime: "image/jpeg",
          dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AppError, "must be AppError");
        assert.equal(err.status, 422);
        assert.match(
          String(err.message),
          /box 3|bird|negative|non-negative|invalid|greater than or equal to 0/i,
        );
        return true;
      },
    );

    const after = await boxSnapshot(trip.id);
    assert.deepEqual(after, existing, "existing dataset must be unchanged (zero partial writes)");

    const totalsAfter = await pool.query(
      `SELECT total_birds, dc_weight FROM trips WHERE id = $1`,
      [trip.id],
    );
    assert.equal(Number(totalsAfter.rows[0].total_birds), Number(totalsBefore.rows[0].total_birds));
    assert.equal(Number(totalsAfter.rows[0].dc_weight), Number(totalsBefore.rows[0].dc_weight));
  });

  it("rejects duplicate later box without corrupting sequence", async () => {
    const { trip, existing } = await seedTripWithExistingBoxes();
    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "pickup", {
          boxDetails: [
            { boxNo: 1, birds: 10, weight: 20 },
            { boxNo: 2, birds: 10, weight: 20 },
            { boxNo: 2, birds: 10, weight: 20 },
          ],
          dcPhotoKey: "atomic-dup",
          dcPhotoMime: "image/jpeg",
          dcPhotoData: `data:image/jpeg;base64,${"B".repeat(80)}`,
        }),
      /duplicate|sequential/i,
    );
    assert.deepEqual(await boxSnapshot(trip.id), existing);
  });

  it("retry after failed invalid import can commit a fully valid dataset", async () => {
    const { trip, existing } = await seedTripWithExistingBoxes();
    await assert.rejects(() =>
      tripsService.submitStep(trip.id, "pickup", {
        boxDetails: [
          { boxNo: 1, birds: 8, weight: 16 },
          { boxNo: 2, birds: 8, weight: -1 },
        ],
        dcPhotoKey: "atomic-retry-fail",
        dcPhotoMime: "image/jpeg",
        dcPhotoData: `data:image/jpeg;base64,${"C".repeat(80)}`,
      }),
    );
    assert.deepEqual(await boxSnapshot(trip.id), existing);

    await tripsService.submitStep(trip.id, "pickup", {
      boxDetails: [
        { boxNo: 1, birds: 8, weight: 16 },
        { boxNo: 2, birds: 9, weight: 18 },
      ],
      dcPhotoKey: "atomic-retry-ok",
      dcPhotoMime: "image/jpeg",
      dcPhotoData: `data:image/jpeg;base64,${"D".repeat(80)}`,
    });
    assert.deepEqual(await boxSnapshot(trip.id), [
      { boxNo: 1, birds: 8, weight: 16 },
      { boxNo: 2, birds: 9, weight: 18 },
    ]);
  });
});
