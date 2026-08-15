/**
 * Rate Entry backend tests — eligibility, save, lock, immutability.
 *
 * Runs the real Express app against PGlite (PostgreSQL engine) so the DB
 * trigger that makes locked rates immutable is exercised end-to-end.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, putJson, postJson, startApp, type TestApp } from "./helpers/app.js";
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
// Seed masters + trips
// ---------------------------------------------------------------------------

let m: Awaited<ReturnType<typeof seedMasters>>;

async function seedMasters() {
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: "AP39RE0001",
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: "RE Driver",
    department: "Fleet",
    role: "Driver",
    phoneNumber: "9000000010",
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: "RE Supervisor",
    department: "Ops",
    role: "Supervisor",
    phoneNumber: "9000000011",
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: "RE Farm",
    ownerName: "Owner",
    supervisorName: "Sup",
    phoneNumber: "9650000010",
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: "RE Chicken A",
    ownerName: "A",
    phoneNumber: "9000000020",
    village: "V",
    address: "Addr",
    status: "Active",
  });
  const shopB = await mastersService.upsertShop({
    shopName: "RE Chicken B",
    ownerName: "B",
    phoneNumber: "9000000021",
    village: "V",
    address: "Addr",
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: "Broiler-RE",
    averageWeight: 2.3,
    description: "Broiler",
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm, shopA, shopB, birdType };
}

interface MakeTripOpts {
  tripNo: string;
  tripDate: string;
  status?: "Draft" | "Pending" | "Completed" | "Deleted";
  deliveries?: Array<{
    shopId: number;
    shopName: string;
    birds: number;
    weight: number;
    rate?: number | null;
  }>;
}

async function makeTrip(opts: MakeTripOpts) {
  const trip = await tripsService.save(null, {
    tripNo: opts.tripNo,
    tripDate: opts.tripDate,
    status: opts.status ?? "Completed",
    startTime: `${opts.tripDate}T05:30:00.000Z`,
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    closingMeter: 1100,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    expensesStepSubmitted: true,
    endStepSubmitted: true,
    deliveries: (opts.deliveries ?? []).map((d, i) => ({
      id: 0,
      serialNo: i + 1,
      shopId: d.shopId,
      shopName: d.shopName,
      birdTypeId: m.birdType.id,
      birdType: m.birdType.birdType,
      birds: d.birds,
      weight: d.weight,
      mortality: 0,
      rate: d.rate ?? null,
      amount: d.rate != null ? Number((d.weight * d.rate).toFixed(2)) : 0,
      remarks: "",
      deliveryMode: "weight" as const,
    })),
  });
  return trip;
}

let eligibleTrip: Awaited<ReturnType<typeof makeTrip>>;
let pendingTrip: Awaited<ReturnType<typeof makeTrip>>;
let draftTrip: Awaited<ReturnType<typeof makeTrip>>;
let lockedTrip: Awaited<ReturnType<typeof makeTrip>>;

before(async () => {
  m = await seedMasters();

  eligibleTrip = await makeTrip({
    tripNo: "TRP-RE-ELIG-001",
    tripDate: "2026-08-20",
    status: "Completed",
    deliveries: [
      { shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 100, weight: 230 },
      { shopId: m.shopB.id, shopName: m.shopB.shopName, birds: 120, weight: 280 },
    ],
  });

  pendingTrip = await makeTrip({
    tripNo: "TRP-RE-PEND-001",
    tripDate: "2026-08-21",
    status: "Pending",
    deliveries: [
      { shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 100, weight: 230 },
    ],
  });

  draftTrip = await makeTrip({
    tripNo: "TRP-RE-DRAFT-001",
    tripDate: "2026-08-22",
    status: "Draft",
    deliveries: [
      { shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 100, weight: 230 },
    ],
  });

  // Seed an already-locked trip so Shop Sales / market-rate references work.
  lockedTrip = await makeTrip({
    tripNo: "TRP-RE-LOCKED-001",
    tripDate: "2026-08-10",
    status: "Completed",
    deliveries: [
      { shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 90, weight: 200, rate: 140 },
    ],
  });
  await pool.query(`UPDATE trips SET rate_completed = TRUE WHERE id = $1`, [lockedTrip.id]);
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe("Rate Entry eligibility", () => {
  it("GET /rate-entry returns only Completed, non-deleted, unlocked trips", async () => {
    const { status, body } = await getJson(baseUrl, "/api/operations/rate-entry");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    const nos = body.map((t: { tripNo: string }) => t.tripNo);
    assert.ok(nos.includes("TRP-RE-ELIG-001"));
    assert.ok(!nos.includes("TRP-RE-PEND-001"), "Pending trips must not appear");
    assert.ok(!nos.includes("TRP-RE-DRAFT-001"), "Draft trips must not appear");
    assert.ok(!nos.includes("TRP-RE-LOCKED-001"), "Locked trips must not appear");
  });

  it("GET /rate-entry/:id returns trip detail with deliveries and market rate", async () => {
    const { status, body } = await getJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}`
    );
    assert.equal(status, 200);
    assert.equal(body.id, eligibleTrip.id);
    assert.equal(body.rateLocked, false);
    assert.equal(body.deliveries.length, 2);
    for (const d of body.deliveries) {
      assert.equal(d.rate, null);
      assert.equal(d.amount, 0);
      assert.ok(d.marketRate !== undefined, "market rate field must be present");
    }
    const shopADelivery = body.deliveries.find(
      (d: { shopId: number }) => d.shopId === m.shopA.id
    );
    assert.ok(shopADelivery.marketRate, "shop A must have market rate reference");
    assert.equal(shopADelivery.marketRate.lastTripRate, 140);
    assert.equal(shopADelivery.marketRate.lastTripNo, "TRP-RE-LOCKED-001");
  });

  it("GET /rate-entry/:id returns 404 for a non-completed trip", async () => {
    const { status } = await getJson(
      baseUrl,
      `/api/operations/rate-entry/${pendingTrip.id}`
    );
    assert.equal(status, 404);
  });

  it("GET /rate-entry/:id still returns a locked trip (read-only)", async () => {
    const { status, body } = await getJson(
      baseUrl,
      `/api/operations/rate-entry/${lockedTrip.id}`
    );
    assert.equal(status, 200);
    assert.equal(body.rateLocked, true);
    assert.equal(body.deliveries[0].rate, 140);
  });

  it("supports server-side filters and pagination", async () => {
    const { body } = await getJson(
      baseUrl,
      `/api/operations/rate-entry?search=TRP-RE-ELIG-001&page=1&limit=10`
    );
    assert.equal(body.meta.total, 1);
    assert.equal(body.data[0].tripNo, "TRP-RE-ELIG-001");
  });
});

// ---------------------------------------------------------------------------
// Save (draft) and Save & Lock
// ---------------------------------------------------------------------------

describe("Rate Entry save and lock", () => {
  it("PUT /rate-entry/:id saves partial rates and recomputes amount server-side", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    const { status, body } = await putJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}`,
      { rates: [{ deliveryId, rate: 150 }] }
    );
    assert.equal(status, 200);
    assert.equal(body.rateLocked, false);
    assert.equal(body.ratesEntered, 1);
    const d0 = body.deliveries.find((x: { id: number }) => x.id === deliveryId);
    assert.equal(d0.rate, 150);
    assert.equal(d0.amount, 34500); // 230 * 150
  });

  it("rejects rates for a delivery that doesn't belong to the trip", async () => {
    const otherDeliveryId = lockedTrip.deliveries[0].id;
    const { status } = await putJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}`,
      { rates: [{ deliveryId: otherDeliveryId, rate: 999 }] }
    );
    assert.equal(status, 422);
  });

  it("POST /rate-entry/:id/lock finalizes remaining rates and locks the trip", async () => {
    const secondDeliveryId = eligibleTrip.deliveries[1].id;
    const { status, body } = await postJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}/lock`,
      { rates: [{ deliveryId: secondDeliveryId, rate: 160 }], lockedBy: "rate-officer" }
    );
    assert.equal(status, 200);
    assert.equal(body.rateLocked, true);
    assert.equal(body.rateLockedBy, "rate-officer");
    assert.equal(body.ratesEntered, 2);
    assert.ok(body.rateLockedAt);
    assert.equal(body.totalAmount, 34500 + 280 * 160);
  });

  it("lock fails if any delivery is still missing a rate", async () => {
    const incomplete = await makeTrip({
      tripNo: "TRP-RE-INCOMPLETE-001",
      tripDate: "2026-08-23",
      status: "Completed",
      deliveries: [
        { shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 50, weight: 100 },
        { shopId: m.shopB.id, shopName: m.shopB.shopName, birds: 60, weight: 140 },
      ],
    });
    const { status } = await postJson(
      baseUrl,
      `/api/operations/rate-entry/${incomplete.id}/lock`,
      { rates: [{ deliveryId: incomplete.deliveries[0].id, rate: 150 }] }
    );
    assert.equal(status, 422);
  });

  it("locked trip disappears from the work queue", async () => {
    const { body } = await getJson(baseUrl, "/api/operations/rate-entry");
    const nos = body.map((t: { tripNo: string }) => t.tripNo);
    assert.ok(!nos.includes("TRP-RE-ELIG-001"));
  });
});

// ---------------------------------------------------------------------------
// Immutability (DB trigger + service guards)
// ---------------------------------------------------------------------------

describe("Locked rates are immutable", () => {
  it("PUT /rate-entry/:id on a locked trip returns 409", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    const { status } = await putJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}`,
      { rates: [{ deliveryId, rate: 1 }] }
    );
    assert.equal(status, 409);
  });

  it("POST /rate-entry/:id/lock on an already locked trip returns 409", async () => {
    const { status } = await postJson(
      baseUrl,
      `/api/operations/rate-entry/${eligibleTrip.id}/lock`,
      {}
    );
    assert.equal(status, 409);
  });

  it("direct SQL UPDATE of rate on a locked delivery is rejected by the DB trigger", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    await assert.rejects(
      pool.query(
        `UPDATE trip_deliveries SET rate = 1 WHERE id = $1`,
        [deliveryId]
      ),
      /locked by rate entry/
    );
  });

  it("direct SQL DELETE of a locked delivery is rejected by the DB trigger", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    await assert.rejects(
      pool.query(`DELETE FROM trip_deliveries WHERE id = $1`, [deliveryId]),
      /locked by rate entry/
    );
  });

  it("harmless UPDATE (e.g. remarks touch) on a locked trip is allowed", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    // Does not change rate/amount → trigger allows it.
    const r = await pool.query(
      `UPDATE trip_deliveries SET remarks = 'sealed' WHERE id = $1 RETURNING remarks`,
      [deliveryId]
    );
    assert.equal(r.rows[0].remarks, "sealed");
  });

  it("Shop Sales cannot mutate the rate of a locked trip", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    const res = await fetch(
      `${baseUrl}/api/operations/shop-sales/${deliveryId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saleDate: "2026-08-20", rate: 123 }),
      }
    );
    assert.equal(res.status, 409);
  });

  it("Shop Sales still READS the finalized rate for a locked trip", async () => {
    const deliveryId = eligibleTrip.deliveries[0].id;
    const { status, body } = await getJson(
      baseUrl,
      `/api/operations/shop-sales/${deliveryId}`
    );
    assert.equal(status, 200);
    assert.equal(body.rate, 150);
    assert.equal(body.amount, 34500);
    assert.equal(body.status, "Approved");
  });
});

// ---------------------------------------------------------------------------
// Trip autosave cannot bypass the lock
// ---------------------------------------------------------------------------

describe("Trip Entry cannot bypass the Rate Entry lock", () => {
  it("tripsService.save strips rateCompleted from client payloads", async () => {
    const updated = await tripsService.save(eligibleTrip.id, {
      remarks: "attempted unlock",
      rateCompleted: false as unknown as undefined,
    });
    assert.equal(updated.rateCompleted, true, "lock must remain intact");
  });

  it("trip autosave rejects replacing deliveries on a locked trip", async () => {
    await assert.rejects(
      tripsService.save(eligibleTrip.id, {
        deliveries: [
          {
            id: 0,
            shopId: m.shopA.id,
            shopName: m.shopA.shopName,
            birdTypeId: m.birdType.id,
            birdType: m.birdType.birdType,
            birds: 1,
            weight: 1,
            mortality: 0,
            rate: 1,
            amount: 1,
            remarks: "",
            deliveryMode: "weight",
          },
        ],
      }),
      /locked by Rate Entry/
    );
  });
});
