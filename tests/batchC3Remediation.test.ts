/**
 * Batch C3 remediation evidence — API/service + DB level.
 *
 * Covers the C3 acceptance matrix that the C2 journey suite did not:
 * - CORS multiple explicit origins over real HTTP, sanitized denial, startup validation
 * - Rental/owned diesel mandatory field, rounding, update, delete, idempotency,
 *   fuel-bill numbering, expense synchronization and fleet-odometer isolation
 * - Pickup import fingerprint validation, trip/leg isolation and erase semantics
 *
 * Runs on the isolated PGlite gateway only; never touches the operational DB.
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
const { parseCorsOrigins } = await import("../src/config/env.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let seq = 0;
async function masters() {
  seq += 1;
  const n = String(seq).padStart(3, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `C3V${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `C3E${n}`,
    chassisNumber: `C3C${n}`,
    status: "Active",
  });
  const rental = await mastersService.upsertVehicle({
    vehicleNumber: `C3R${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 20,
    birdCapacity: 1000,
    capacityKg: 1500,
    status: "Active",
    isRented: true,
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `C3 Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9710${n}1`.slice(0, 10).padEnd(10, "0"),
    licenseNumber: `C3DL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `C3 Sup ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9720${n}1`.slice(0, 10).padEnd(10, "0"),
    salary: 22000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `C3 Farm ${n}`,
    ownerName: "Owner",
    supervisorName: "FarmSup",
    phoneNumber: `9730${n}1`.slice(0, 10).padEnd(10, "0"),
    village: "Village",
    address: "Address",
    capacity: 10000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `C3 Bird ${n}`,
    averageWeight: 2,
    description: "",
    status: "Active",
  });
  return { vehicle, rental, driver, supervisor, farm, birdType };
}

type M = Awaited<ReturnType<typeof masters>>;

async function pickupTrip(m: M, boxes: { boxNo: number; birds: number; weight: number }[], vehicle = m.vehicle) {
  const isRented = Boolean((vehicle as { isRented?: boolean }).isRented);
  return tripsService.save(null, {
    tripDate: `2026-09-${String((seq % 27) + 1).padStart(2, "0")}`,
    status: "Draft",
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmBirdTypeId: m.birdType.id,
    farmBirdType: m.birdType.birdType,
    openingMeter: isRented ? null : 40000 + seq,
    destMeter: isRented ? null : 40100 + seq,
    isRentedVehicle: isRented,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: boxes,
  } as Record<string, unknown>);
}

function dieselBody(overrides: Record<string, unknown> = {}) {
  return {
    litres: 10,
    amount: 950,
    meter: null,
    bunkName: "C3 Bunk",
    gpsLat: 17.38,
    gpsLon: 78.48,
    gpsAccuracy: 1,
    imageData: `data:image/jpeg;base64,${"Q".repeat(80)}`,
    imageName: "bill.jpg",
    clientKey: "c3-diesel",
    rowIndex: 1,
    ...overrides,
  };
}

describe("C3 CORS startup and HTTP behavior", () => {
  it("rejects wildcard and malformed origins independent of NODE_ENV", () => {
    const prior = process.env.NODE_ENV;
    try {
      for (const mode of ["development", "production"]) {
        process.env.NODE_ENV = mode;
        assert.throws(() => parseCorsOrigins("*"), /wildcard origin is not allowed with credentials/i);
        assert.throws(() => parseCorsOrigins("https://ok.example,*"), /wildcard origin is not allowed/i);
        assert.throws(() => parseCorsOrigins("https://ok.example,"), /must not be empty/i);
        assert.throws(() => parseCorsOrigins("ftp://ok.example"), /absolute HTTP\(S\) origin/i);
        assert.throws(() => parseCorsOrigins("https://user:pw@ok.example"), /absolute HTTP\(S\) origin/i);
        assert.deepEqual(parseCorsOrigins(" https://a.example , https://b.example "), [
          "https://a.example",
          "https://b.example",
        ]);
      }
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it("allows every configured explicit origin and denies others without leaking internals", async () => {
    const twoOrigins = await startApp({
      DATABASE_URL: testDb.url,
      CORS_ORIGIN: "https://one.example, https://two.example",
    });
    try {
      for (const origin of ["https://one.example", "https://two.example"]) {
        const res = await fetch(`${twoOrigins.baseUrl}/api/health`, { headers: { Origin: origin } });
        assert.equal(res.status, 200, origin);
        assert.equal(res.headers.get("access-control-allow-origin"), origin);
        assert.equal(res.headers.get("access-control-allow-credentials"), "true");
      }
      const preflight = await fetch(`${twoOrigins.baseUrl}/api/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://two.example",
          "Access-Control-Request-Method": "GET",
        },
      });
      assert.ok([200, 204].includes(preflight.status), String(preflight.status));
      assert.equal(preflight.headers.get("access-control-allow-origin"), "https://two.example");

      const denied = await fetch(`${twoOrigins.baseUrl}/api/health`, {
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(denied.status, 403);
      const body = await denied.text();
      assert.equal(body, JSON.stringify({ error: "CORS origin not allowed" }));
      assert.ok(!/stack|node_modules|\\bat\\s+\w+/i.test(body), body);

      const absent = await fetch(`${twoOrigins.baseUrl}/api/health`);
      assert.equal(absent.status, 200);
    } finally {
      await twoOrigins.close();
    }
  });
});

describe("C3 Step 5 diesel acceptance matrix", () => {
  it("owned vehicle requires litres, amount and meter and stores a finite rate", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }]);
    const saved = await tripsService.upsertDieselEntry(trip.id, dieselBody({ meter: 40200 }));
    const entry = (saved.dieselEntries ?? [])[0];
    assert.equal(Number(entry.litres), 10);
    assert.equal(Number(entry.amount), 950);
    assert.equal(Number(entry.rate), 95);
    assert.equal(Number(entry.meter), 40200);

    const withMeter = await tripsService.updateDieselEntry(trip.id, entry.id as number, dieselBody({ meter: 40210 }));
    assert.equal(Number((withMeter.dieselEntries ?? [])[0].meter), 40210);

    await assert.rejects(
      () => tripsService.upsertDieselEntry(trip.id, dieselBody({ rowIndex: 2, clientKey: "c3-no-litre", litres: null })),
      /litres must be greater than zero/i,
    );
    await assert.rejects(
      () => tripsService.upsertDieselEntry(trip.id, dieselBody({ rowIndex: 2, clientKey: "c3-no-amount", amount: null })),
      /amount must be greater than zero/i,
    );
    await assert.rejects(
      () => tripsService.upsertDieselEntry(trip.id, dieselBody({ rowIndex: 2, clientKey: "c3-zero-amount", amount: 0 })),
      /amount must be greater than zero/i,
    );
    await assert.rejects(
      () => tripsService.upsertDieselEntry(trip.id, dieselBody({ rowIndex: 2, clientKey: "c3-no-meter", meter: null })),
      /meter reading is required/i,
    );
  });

  it("rounds the calculated rate and never yields Infinity or NaN", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }]);
    const saved = await tripsService.upsertDieselEntry(
      trip.id,
      dieselBody({ litres: 3, amount: 100, meter: 40500, clientKey: "rounding" }),
    );
    const entry = (saved.dieselEntries ?? [])[0];
    assert.equal(Number(entry.rate), 33.33);
    assert.ok(Number.isFinite(Number(entry.rate)));
    const db = await pool.query(`SELECT rate, amount, litres FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    assert.equal(Number(db.rows[0].rate), 33.33);
    assert.equal(Number(db.rows[0].amount), 100);
  });

  it("rental diesel: optional meter, update, delete, idempotent replay, fuel bill and expense sync", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }], m.rental);

    const first = await tripsService.upsertDieselEntry(
      trip.id,
      dieselBody({ clientKey: "rental-1", imageData: `data:image/jpeg;base64,${"A".repeat(80)}` }),
    );
    const firstEntry = (first.dieselEntries ?? [])[0];
    assert.equal(firstEntry.meter, null);
    assert.equal(Number(firstEntry.rate), 95);

    // Repeated submission with the same client key must not duplicate rows.
    await tripsService.upsertDieselEntry(
      trip.id,
      dieselBody({ clientKey: "rental-1", imageData: `data:image/jpeg;base64,${"A".repeat(80)}` }),
    );
    let dieselRows = await pool.query(`SELECT * FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    assert.equal(dieselRows.rowCount, 1);
    let fuelRows = await pool.query(
      `SELECT * FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP' AND deleted = FALSE`,
      [trip.id],
    );
    assert.equal(fuelRows.rowCount, 1);
    assert.equal(fuelRows.rows[0].vehicle_id, null, "rental fuel must not link an owned fleet vehicle");
    assert.equal(Number(fuelRows.rows[0].meter_reading), 0, "rental fuel carries no fleet meter reading");
    assert.equal(Number(fuelRows.rows[0].litres), 10);
    assert.equal(Number(fuelRows.rows[0].amount), 950);
    assert.equal(Number(fuelRows.rows[0].rate), 95);
    assert.match(String(fuelRows.rows[0].bill_no), /-F\d{3}$/);
    const firstBillNo = String(fuelRows.rows[0].bill_no);

    // Update keeps a single row and keeps the allocated bill number.
    const updated = await tripsService.updateDieselEntry(
      trip.id,
      firstEntry.id as number,
      dieselBody({
        litres: 20,
        amount: 1000,
        clientKey: "rental-1",
        imageData: `data:image/jpeg;base64,${"A".repeat(80)}`,
      }),
    );
    const updatedEntry = (updated.dieselEntries ?? [])[0];
    assert.equal(Number(updatedEntry.litres), 20);
    assert.equal(Number(updatedEntry.rate), 50);
    assert.equal(updatedEntry.meter, null);
    fuelRows = await pool.query(
      `SELECT * FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP' AND deleted = FALSE`,
      [trip.id],
    );
    assert.equal(fuelRows.rowCount, 1);
    assert.equal(String(fuelRows.rows[0].bill_no), firstBillNo);
    assert.equal(Number(fuelRows.rows[0].amount), 1000);

    // Rental diesel must never create a fleet odometer reading for the vehicle.
    const meterRows = await pool.query(
      `SELECT COUNT(*)::int AS count FROM fuel_expenses WHERE vehicle_id = $1`,
      [m.rental.id],
    );
    assert.equal(Number(meterRows.rows[0].count), 0);

    // Delete removes the diesel row and its pending trip fuel bill.
    await tripsService.deleteDieselEntry(trip.id, firstEntry.id as number);
    dieselRows = await pool.query(`SELECT * FROM trip_diesel_entries WHERE trip_id = $1`, [trip.id]);
    assert.equal(dieselRows.rowCount, 0);
    fuelRows = await pool.query(
      `SELECT * FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP' AND deleted = FALSE`,
      [trip.id],
    );
    assert.equal(fuelRows.rowCount, 0);
  });

  it("owned multi-row diesel allocates distinct sequential bill numbers", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, [{ boxNo: 1, birds: 20, weight: 40 }]);
    await tripsService.upsertDieselEntry(
      trip.id,
      dieselBody({ rowIndex: 1, meter: 40600, clientKey: "own-1", imageData: `data:image/jpeg;base64,${"B".repeat(80)}` }),
    );
    await tripsService.upsertDieselEntry(
      trip.id,
      dieselBody({ rowIndex: 2, meter: 40700, clientKey: "own-2", imageData: `data:image/jpeg;base64,${"C".repeat(80)}` }),
    );
    const bills = await pool.query(
      `SELECT bill_no FROM fuel_expenses WHERE trip_id = $1 AND source_type = 'TRIP' AND deleted = FALSE ORDER BY trip_fuel_entry_index`,
      [trip.id],
    );
    assert.equal(bills.rowCount, 2);
    assert.equal(new Set(bills.rows.map((r) => r.bill_no)).size, 2);
    assert.match(String(bills.rows[0].bill_no), /-F001$/);
    assert.match(String(bills.rows[1].bill_no), /-F002$/);
  });
});

describe("C3 pickup import fingerprint validation and isolation", () => {
  const fp = (hash: string, name = "boxes.xlsx", extra: Record<string, unknown> = {}) => ({
    algorithm: "SHA-256",
    version: 1,
    contentHash: hash,
    originalFilename: name,
    byteLength: 123,
    ...extra,
  });
  const boxes = [{ boxNo: 1, birds: 20, weight: 40 }];

  it("rejects invalid hash metadata and persists nothing", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, []);
    const bad = [
      fp("a".repeat(63)),
      fp("a".repeat(64), "boxes.xlsx", { algorithm: "MD5" }),
      fp("a".repeat(64), "boxes.xlsx", { version: 2 }),
      fp("a".repeat(64), ""),
      fp("a".repeat(64), "boxes.xlsx", { byteLength: 0 }),
      fp("zz".repeat(32)),
    ];
    for (const [index, payload] of bad.entries()) {
      await assert.rejects(
        () => tripsService.save(trip.id, { boxDetails: boxes, importFingerprint: payload } as Record<string, unknown>),
        (error: unknown) => error instanceof AppError && error.status === 422,
        `payload ${index}`,
      );
    }
    const count = await pool.query(
      `SELECT COUNT(*)::int AS count FROM trip_pickup_import_fingerprints WHERE trip_id = $1`,
      [trip.id],
    );
    assert.equal(Number(count.rows[0].count), 0);
    const boxCount = await pool.query(`SELECT COUNT(*)::int AS count FROM trip_boxes WHERE trip_id = $1`, [trip.id]);
    assert.equal(Number(boxCount.rows[0].count), 0);
  });

  it("uses bytes not filename, and isolates trips and loads", async () => {
    const hash = "c".repeat(64);

    const tripA = await pickupTrip(await masters(), []);
    await tripsService.save(tripA.id, { boxDetails: boxes, importFingerprint: fp(hash, "a.xlsx") } as Record<string, unknown>);

    // Same filename, different bytes is a normal (non-duplicate) import.
    const tripB = await pickupTrip(await masters(), []);
    await tripsService.save(tripB.id, { boxDetails: boxes, importFingerprint: fp("d".repeat(64), "a.xlsx") } as Record<string, unknown>);
    assert.equal(
      Number((await pool.query(`SELECT COUNT(*)::int AS c FROM trip_pickup_import_fingerprints WHERE trip_id = $1`, [tripB.id])).rows[0].c),
      1,
    );

    // Identical bytes are accepted as an idempotent retry. The fingerprint
    // remains a single row and the submitted complete box list is re-saved.
    await tripsService.save(tripB.id, {
      boxDetails: boxes,
      importFingerprint: fp("d".repeat(64), "renamed.xlsx"),
    } as Record<string, unknown>);
    assert.equal(
      Number((await pool.query(`SELECT COUNT(*)::int AS c FROM trip_pickup_import_fingerprints WHERE trip_id = $1`, [tripB.id])).rows[0].c),
      1,
    );

    // A different trip may import the identical bytes independently.
    const tripC = await pickupTrip(await masters(), []);
    await tripsService.save(tripC.id, { boxDetails: boxes, importFingerprint: fp(hash, "a.xlsx") } as Record<string, unknown>);

    // A different load (leg) of the same trip is isolated too.
    const tripD = await pickupTrip(await masters(), []);
    await tripsService.save(tripD.id, { boxDetails: boxes, importFingerprint: fp(hash, "a.xlsx") } as Record<string, unknown>);
    // Second load fixture: addLeg requires load 1 deliveries to be complete, so
    // the extra leg is created directly for this isolation assertion only.
    await pool.query(`INSERT INTO trip_legs (trip_id, leg_index) VALUES ($1, 2)`, [tripD.id]);
    await tripsService.save(tripD.id, {
      legIndex: 2,
      boxDetails: [{ boxNo: 1, birds: 30, weight: 60 }],
      importFingerprint: fp(hash, "a.xlsx"),
    } as Record<string, unknown>);
    const legFingerprints = await pool.query(
      `SELECT leg_id, COUNT(*)::int AS count FROM trip_pickup_import_fingerprints WHERE trip_id = $1 GROUP BY leg_id`,
      [tripD.id],
    );
    assert.equal(legFingerprints.rowCount, 2);
    assert.ok(legFingerprints.rows.every((row) => Number(row.count) === 1));
  });

  it("erase clears the fingerprint and allows the corrected same-name file", async () => {
    const m = await masters();
    const trip = await pickupTrip(m, []);
    const hash = "e".repeat(64);
    await tripsService.save(trip.id, { boxDetails: boxes, importFingerprint: fp(hash, "same.xlsx") } as Record<string, unknown>);
    await tripsService.save(trip.id, {
      boxDetails: boxes,
      importFingerprint: fp(hash, "same.xlsx"),
    } as Record<string, unknown>);
    await tripsService.save(trip.id, { boxDetails: [], clearBoxDetails: true } as Record<string, unknown>);
    const afterErase = await pool.query(
      `SELECT COUNT(*)::int AS count FROM trip_pickup_import_fingerprints WHERE trip_id = $1`,
      [trip.id],
    );
    assert.equal(Number(afterErase.rows[0].count), 0);
    await tripsService.save(trip.id, {
      boxDetails: [{ boxNo: 1, birds: 22, weight: 44 }],
      importFingerprint: fp(hash, "same.xlsx"),
    } as Record<string, unknown>);
    const final = await pool.query(`SELECT box_no, birds FROM trip_boxes WHERE trip_id = $1`, [trip.id]);
    assert.equal(final.rowCount, 1);
    assert.equal(Number(final.rows[0].birds), 22);
  });
});
