/**
 * Rate Entry / Shop Sales / Trip-Delivery sync backend tests — the
 * production-readiness regression pass for the three tightly-coupled
 * modules: Trip -> Rate Entry -> (Save & Lock) -> Shop Sales.
 *
 * Runs the real Express app + real services against a real PostgreSQL
 * engine (PGlite WASM behind the pg-gateway wire-protocol server) — no
 * mocks. Mirrors the pattern used by tests/tripList.test.ts and
 * tests/salaryLifecycle.test.ts.
 *
 * Covers:
 *   - Rate Entry is invisible until the trip is Approved/Completed, and a
 *     saved-but-unlocked rate keeps the trip out of Shop Sales
 *   - Rate range (50-300 inclusive) is backend-enforced on Rate Entry
 *     itself, not just on the Shop Sales edit path (regression test for
 *     the gap fixed in this pass — see rateEntryService.ts)
 *   - Lock is idempotent (second lock attempt is rejected, no duplicate
 *     Shop Sales rows are created)
 *   - Shop Sales is gated on rate_entry.locked = TRUE
 *   - Birds/weight capacity validation spans all shops on the trip
 *   - Rate/birds/weight are all editable post-lock within the window,
 *     each independently validated; amount is always server-computed
 *   - Duplicate Shop Sale creation is rejected
 *   - The 10-day edit window boundary (inclusive) blocks edits afterwards
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, postJson, putJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let vehicleSeq = 0;
async function seedMasters() {
  vehicleSeq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `RS39V${String(vehicleSeq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    engineNumber: `RSENG${vehicleSeq}`,
    chassisNumber: `RSCHS${vehicleSeq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `RS Driver ${vehicleSeq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93000000${String(vehicleSeq).padStart(2, "0")}`,
    licenseNumber: `RSDL${vehicleSeq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `RS Supervisor ${vehicleSeq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94000000${String(vehicleSeq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `RS Test Farm ${vehicleSeq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `96500000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `Broiler ${vehicleSeq}`,
    averageWeight: 2.35,
    description: "Broiler",
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: `RS Shop A ${vehicleSeq}`,
    ownerName: "Shop Owner A",
    phoneNumber: `97000000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village A",
    address: "Addr A",
    status: "Active",
  });
  const shopB = await mastersService.upsertShop({
    shopName: `RS Shop B ${vehicleSeq}`,
    ownerName: "Shop Owner B",
    phoneNumber: `98000000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village B",
    address: "Addr B",
    status: "Active",
  });
  const shopInactive = await mastersService.upsertShop({
    shopName: `RS Shop Inactive ${vehicleSeq}`,
    ownerName: "Shop Owner C",
    phoneNumber: `99000000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village C",
    address: "Addr C",
    status: "Inactive",
  });
  return { vehicle, driver, supervisor, farm, birdType, shopA, shopB, shopInactive };
}

/** A finalized (Completed) trip with a fixed bird/weight capacity, created
 * directly via the production save() path (same as tripList.test.ts). */
async function makeCompletedTrip(
  m: Awaited<ReturnType<typeof seedMasters>>,
  opts: { tripNo: string; tripDate: string; totalBirds: number; dcWeight: number }
) {
  const trip = await tripsService.save(null, {
    tripNo: opts.tripNo,
    tripDate: opts.tripDate,
    status: "Completed",
    startTime: `${opts.tripDate}T05:30:00.000Z`,
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    farmBirdTypeId: m.birdType.id,
    farmBirdType: m.birdType.birdType,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    expensesStepSubmitted: true,
    totalKm: 100,
    totalBirds: opts.totalBirds,
    dcWeight: opts.dcWeight,
  } as Record<string, unknown>);
  // tripsService.save() (unlike the real Approve/Complete status-transition
  // path in tripsService.updateStatus) does not stamp approved_at — set it
  // explicitly to "now" so the 10-day Shop Sales edit window anchors to a
  // realistic completion time instead of falling back to trip_date, which
  // would put every fixture trip immediately outside the window.
  await pool.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [trip.id]);
  return trip;
}

async function addDelivery(
  tripId: number,
  shopId: number,
  shopName: string,
  birds: number,
  weight: number,
  mortality = 0
) {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0) RETURNING id`,
    [tripId, `${tripId}-SEED-${shopId}`, shopId, shopName, birds, weight, mortality]
  );
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// 1. Full lifecycle: Rate Entry visibility -> save -> lock -> Shop Sales
// ---------------------------------------------------------------------------

describe("Rate Entry -> Lock -> Shop Sales lifecycle", () => {
  it("trip is hidden from Rate Entry before Completed, visible after; hidden from Shop Sales until locked", async () => {
    const m = await seedMasters();
    // Separate masters for the Draft fixture: a trip left in Draft never
    // releases its vehicle/driver/supervisor (tripResourceValidation.ts), so
    // it must not share resources with the Completed trip created below.
    const draftMasters = await seedMasters();
    const draft = await tripsService.save(null, {
      tripNo: "RS-DRAFT-1",
      tripDate: "2026-07-01",
      status: "Draft",
      vehicleId: draftMasters.vehicle.id,
      driverId: draftMasters.driver.id,
      supervisorId: draftMasters.supervisor.id,
      sourceFarmId: draftMasters.farm.id,
      startStepSubmitted: false,
    } as Record<string, unknown>);

    const rateListBeforeCompletion = await getJson(baseUrl, "/api/operations/rate-entry");
    assert.ok(
      !rateListBeforeCompletion.body.some((t: { tripId: number }) => t.tripId === draft.id),
      "Draft trip must not appear in Rate Entry"
    );

    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-LIFECYCLE-1",
      tripDate: "2026-07-01",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const deliveryA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    const deliveryB = await addDelivery(trip.id, m.shopB.id, m.shopB.shopName, 250, 450);

    const rateList = await getJson(baseUrl, "/api/operations/rate-entry");
    assert.ok(
      rateList.body.some((t: { tripId: number }) => t.tripId === trip.id),
      "Completed trip must appear in Rate Entry"
    );

    const shopSalesBeforeLock = await getJson(baseUrl, "/api/operations/shop-sales");
    assert.ok(
      !shopSalesBeforeLock.body.some((s: { tripId: number }) => s.tripId === trip.id),
      "Trip must NOT appear in Shop Sales before rate lock"
    );

    const saved = await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 90,
      deliveries: [
        { id: deliveryA, rate: 90 },
        { id: deliveryB, rate: 110 },
      ],
    });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));

    const shopSalesStillBeforeLock = await getJson(baseUrl, "/api/operations/shop-sales");
    assert.ok(
      !shopSalesStillBeforeLock.body.some((s: { tripId: number }) => s.tripId === trip.id),
      "Saved-but-unlocked rate must NOT unlock Shop Sales"
    );

    const lock = await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {
      lockedBy: "tester",
    });
    assert.equal(lock.status, 200, JSON.stringify(lock.body));
    assert.equal(lock.body.locked, true);

    const rateListAfterLock = await getJson(baseUrl, "/api/operations/rate-entry");
    assert.ok(
      !rateListAfterLock.body.some((t: { tripId: number }) => t.tripId === trip.id),
      "Trip must disappear from Rate Entry once locked"
    );

    const shopSalesAfterLock = await getJson(baseUrl, "/api/operations/shop-sales");
    const rows = shopSalesAfterLock.body.filter((s: { tripId: number }) => s.tripId === trip.id);
    assert.equal(rows.length, 2, "both shop deliveries must appear in Shop Sales");
    const a = rows.find((r: { shopId: number }) => r.shopId === m.shopA.id);
    const b = rows.find((r: { shopId: number }) => r.shopId === m.shopB.id);
    assert.equal(a.rate, 90);
    assert.equal(a.amount, 500 * 90);
    assert.equal(b.rate, 110);
    assert.equal(b.amount, 450 * 110);
  });

  it("locking twice is rejected (idempotent lock, no duplicate Shop Sales rows)", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-DOUBLE-LOCK",
      tripDate: "2026-07-02",
      totalBirds: 500,
      dcWeight: 900,
    });
    const delivery = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 200, 350);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: delivery, rate: 100 }],
    });
    const first = await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});
    assert.equal(first.status, 200);

    const second = await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});
    assert.equal(second.status, 409, "second lock attempt must be rejected");

    const shopSales = await getJson(baseUrl, "/api/operations/shop-sales");
    const rows = shopSales.body.filter((s: { tripId: number }) => s.tripId === trip.id);
    assert.equal(rows.length, 1, "locking twice must not duplicate Shop Sales rows");
  });

  it("Shop Sales create is rejected while Rate Entry is unlocked, even with a valid trip/shop", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-UNLOCKED-CREATE",
      tripDate: "2026-07-03",
      totalBirds: 500,
      dcWeight: 900,
    });
    const res = await postJson(baseUrl, "/api/operations/shop-sales", {
      tripId: trip.id,
      shopId: m.shopA.id,
      birds: 100,
      weight: 150,
      rate: 100,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
  });
});

// ---------------------------------------------------------------------------
// 2. Rate range enforcement — backend authoritative, both Rate Entry and
//    Shop Sales, direct API bypass (never trust the frontend min/max).
// ---------------------------------------------------------------------------

describe("Rate range validation (50-300 inclusive) is backend-enforced", () => {
  it("Rate Entry create rejects rates outside 50-300 via direct API, accepts the boundary values", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-RATE-RANGE",
      tripDate: "2026-07-04",
      totalBirds: 500,
      dcWeight: 900,
    });

    for (const bad of [49, 301, 0, -10]) {
      const res = await postJson(baseUrl, "/api/operations/rate-entry", {
        tripId: trip.id,
        rate: bad,
      });
      assert.equal(res.status, 400, `rate ${bad} must be rejected by Rate Entry, got ${res.status}`);
    }

    for (const good of [50, 300, 90]) {
      const res = await postJson(baseUrl, "/api/operations/rate-entry", {
        tripId: trip.id,
        rate: good,
      });
      assert.equal(res.status, 201, `rate ${good} must be accepted, got ${res.status} ${JSON.stringify(res.body)}`);
    }
  });

  it("Rate Entry per-delivery rate lines are also range-checked (not just the header rate)", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-RATE-RANGE-LINE",
      tripDate: "2026-07-05",
      totalBirds: 500,
      dcWeight: 900,
    });
    const delivery = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 100, 150);

    const badLine = await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: delivery, rate: 999 }],
    });
    assert.equal(badLine.status, 400, JSON.stringify(badLine.body));

    const row = await pool.query(`SELECT rate FROM trip_deliveries WHERE id = $1`, [delivery]);
    assert.equal(
      Number(row.rows[0].rate ?? 0),
      0,
      "an out-of-range delivery rate line must not be persisted"
    );
  });

  it("Shop Sales edit rejects rates outside 50-300 within the edit window", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-SHOPSALES-RATE-RANGE",
      tripDate: "2026-07-06",
      totalBirds: 500,
      dcWeight: 900,
    });
    const delivery = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 200, 350);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: delivery, rate: 100 }],
    });
    await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});

    for (const bad of [49, 301]) {
      const res = await putJson(baseUrl, `/api/operations/shop-sales/${delivery}`, { rate: bad });
      assert.equal(res.status, 400, `rate ${bad} must be rejected`);
    }
    const ok = await putJson(baseUrl, `/api/operations/shop-sales/${delivery}`, { rate: 150 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.rate, 150);
    assert.equal(ok.body.amount, 350 * 150, "amount must be server-recalculated from weight x rate");
  });
});

// ---------------------------------------------------------------------------
// 3. Capacity validation spans all shops on the trip
// ---------------------------------------------------------------------------

describe("Shop Sales capacity validation", () => {
  it("rejects an edit that would push total birds/weight (incl. mortality) past the trip's loaded capacity", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-CAPACITY",
      tripDate: "2026-07-07",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const dA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500, 20);
    const dB = await addDelivery(trip.id, m.shopB.id, m.shopB.shopName, 250, 450);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [
        { id: dA, rate: 90 },
        { id: dB, rate: 110 },
      ],
    });
    await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});

    // Remaining birds = 1000 - 300 - 250 - 20(mortality) = 430. Pushing shop A
    // to 320 birds (delta +20) still fits (total birds allocated = 320+250+20=590 <= 1000).
    const validBirds = await putJson(baseUrl, `/api/operations/shop-sales/${dA}`, { birds: 320 });
    assert.equal(validBirds.status, 200, JSON.stringify(validBirds.body));
    assert.equal(validBirds.body.birds, 320);

    // Now push shop A to a birds count that overflows total capacity:
    // 320(A, already saved) ... try setting A to 1000 (>> capacity with B + mortality).
    const overBirds = await putJson(baseUrl, `/api/operations/shop-sales/${dA}`, { birds: 1000 });
    assert.equal(overBirds.status, 422, "exceeding capacity must be rejected with 422");

    // DB must be unchanged after the rejected attempt.
    const afterReject = await pool.query(`SELECT birds FROM trip_deliveries WHERE id = $1`, [dA]);
    assert.equal(Number(afterReject.rows[0].birds), 320, "rejected edit must not mutate the DB");

    // Weight equivalent: dcWeight=1800, allocated so far 500+450=950 -> remaining 850.
    const overWeight = await putJson(baseUrl, `/api/operations/shop-sales/${dB}`, { weight: 5000 });
    assert.equal(overWeight.status, 422);
  });

  it("combined birds+weight+rate edit is all-or-nothing: an invalid rate rolls back valid birds/weight too", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-ATOMIC",
      tripDate: "2026-07-08",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const dA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 300, 500);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: dA, rate: 100 }],
    });
    await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});

    const res = await putJson(baseUrl, `/api/operations/shop-sales/${dA}`, {
      birds: 320,
      weight: 550,
      rate: 301, // invalid
    });
    assert.equal(res.status, 400);

    const row = await pool.query(
      `SELECT birds, weight, rate FROM trip_deliveries WHERE id = $1`,
      [dA]
    );
    assert.equal(Number(row.rows[0].birds), 300, "birds must remain unchanged");
    assert.equal(Number(row.rows[0].weight), 500, "weight must remain unchanged");
    assert.equal(Number(row.rows[0].rate), 100, "rate must remain unchanged");
  });
});

// ---------------------------------------------------------------------------
// 4. Duplicate Shop Sale prevention
// ---------------------------------------------------------------------------

describe("Duplicate Shop Sale prevention", () => {
  it("an identical (trip, shop, birds, weight) create is rejected as a duplicate", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-DUP",
      tripDate: "2026-07-09",
      totalBirds: 1000,
      dcWeight: 1800,
    });
    const dA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 0, 0);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: dA, rate: 100 }],
    });
    await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});

    const first = await postJson(baseUrl, "/api/operations/shop-sales", {
      tripId: trip.id,
      shopId: m.shopB.id,
      birds: 100,
      weight: 150,
      rate: 100,
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const dup = await postJson(baseUrl, "/api/operations/shop-sales", {
      tripId: trip.id,
      shopId: m.shopB.id,
      birds: 100,
      weight: 150,
      rate: 100,
    });
    assert.equal(dup.status, 409, "identical repeat create must be rejected");
  });
});

// ---------------------------------------------------------------------------
// 5. 10-day edit window boundary
// ---------------------------------------------------------------------------

describe("10-day Shop Sales edit window", () => {
  it("day 10 (inclusive) still allows edits; day 11 rejects everything, including delete", async () => {
    const m = await seedMasters();
    const trip = await makeCompletedTrip(m, {
      tripNo: "RS-WINDOW",
      tripDate: "2026-07-10",
      totalBirds: 500,
      dcWeight: 900,
    });
    const dA = await addDelivery(trip.id, m.shopA.id, m.shopA.shopName, 200, 350);
    await postJson(baseUrl, "/api/operations/rate-entry", {
      tripId: trip.id,
      rate: 100,
      deliveries: [{ id: dA, rate: 100 }],
    });
    await postJson(baseUrl, `/api/operations/rate-entry/trip/${trip.id}/lock`, {});

    // The window anchor is rate_locked_at (when Shop Sales actually became
    // available — see tripDeliverySync.ts editWindowAnchor), not approved_at.
    // Backdate rate_locked_at to just under 10 full days before "now" (a
    // small safety margin below the exact boundary avoids test flakiness
    // from the few milliseconds of request latency between computing "now"
    // here and the server evaluating its own `new Date() <= expiresAt`
    // check) — still inside the window per isTripEditable()'s inclusive
    // `<=` comparison. approved_at is also backdated so the fallback path
    // is exercised identically for any legacy trip locked before
    // rate_locked_at existed.
    const justUnderTenDays = new Date(
      Date.now() - (10 * 24 * 60 * 60 * 1000 - 60_000)
    ).toISOString();
    await pool.query(
      `UPDATE trips SET approved_at = $2, rate_locked_at = $2 WHERE id = $1`,
      [trip.id, justUnderTenDays]
    );
    const atDay10 = await putJson(baseUrl, `/api/operations/shop-sales/${dA}`, { rate: 120 });
    assert.equal(atDay10.status, 200, "day 10 must still be editable (inclusive boundary)");

    // Backdate to 11 days ago — now past the window.
    const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
    await pool.query(
      `UPDATE trips SET approved_at = $2, rate_locked_at = $2 WHERE id = $1`,
      [trip.id, elevenDaysAgo]
    );
    const atDay11 = await putJson(baseUrl, `/api/operations/shop-sales/${dA}`, { rate: 150 });
    assert.equal(atDay11.status, 409, "day 11 must be rejected");

    const del = await fetch(`${baseUrl}/api/operations/shop-sales/${dA}`, { method: "DELETE" });
    assert.equal(del.status, 409, "delete must also be rejected past the window");

    const row = await pool.query(`SELECT rate FROM trip_deliveries WHERE id = $1`, [dA]);
    assert.equal(Number(row.rows[0].rate), 120, "value must remain at its last valid (day-10) edit");
  });
});
