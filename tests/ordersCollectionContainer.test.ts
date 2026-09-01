/**
 * Orders module — the day's Shop Order Collection container.
 *
 * `POST /api/trips/0/steps/deliveries` with an ORD-YYYYMMDD-NN `tripNo` must
 * create / locate a vehicle-LESS collection container and upsert its
 * collected-shop plan rows — WITHOUT:
 *   - being treated as an ordinary "Trip 0" (the old 404 "Trip 0 not found"),
 *   - turning id 0 into a real numbered DB trip (`TR-…`),
 *   - creating a second container on a repeated save / retry,
 *   - running the vehicle-trip Step 1→3 gates or Step 3 capacity checks.
 *
 * A non-ORD `tripNo` with id 0 keeps the original behaviour (404).
 *
 * Runs the real service against real PGlite-Postgres — no mocks.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

const shops: Array<{ id: number; shopName: string }> = [];

before(async () => {
  for (let i = 1; i <= 5; i += 1) {
    const shop = await mastersService.upsertShop({
      associationType: "Ass Vij",
      shopName: `ORD Shop ${i}`,
      ownerName: "Owner",
      phoneNumber: `95550000${String(i).padStart(2, "0")}`,
      city: "Village",
      address: "Addr",
      email: `ord-shop-${i}@test.local`,
      status: "Active",
    });
    shops.push({ id: shop.id, shopName: shop.shopName });
  }
});

function planRow(shop: { id: number; shopName: string }, boxes: number, serialNo: number) {
  return {
    id: 0,
    clientKey: `ck-${shop.id}`,
    serialNo,
    boxNo: boxes,
    shopId: shop.id,
    shopName: shop.shopName,
    birdTypeId: 0,
    birdType: "",
    birds: boxes * 20,
    weight: 0,
    mortality: 0,
    mortKg: 0,
    rate: null,
    amount: 0,
    remarks: "[ORDER]",
    deliveryMode: "box" as const,
    selectedBoxIds: [],
  };
}

const ORD_NO = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-01`;

async function countTrips(like: string): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trips WHERE trip_no LIKE $1`,
    [like]
  );
  return Number(r.rows[0].c);
}

describe("Orders collection container (POST /trips/0/steps/deliveries)", () => {
  let containerId = 0;

  it("id 0 + ORD tripNo creates a vehicle-less container with [ORDER] plan rows", async () => {
    const trip = await tripsService.submitStep(0, "deliveries", {
      mode: "save",
      tripNo: ORD_NO,
      deliveries: [
        planRow(shops[0], 3, 1),
        planRow(shops[1], 2, 2),
        planRow(shops[2], 4, 3),
      ],
    } as Record<string, unknown>);

    assert.ok(trip.id > 0, "container has a real primary key");
    assert.equal(trip.tripNo, ORD_NO, "keeps the ORD number verbatim");
    assert.ok(!trip.vehicleId, "no vehicle");
    assert.equal(trip.status, "Draft");
    assert.equal(trip.startStepSubmitted, false, "not finished yet");
    assert.equal(trip.deliveries.length, 3);
    assert.ok(
      trip.deliveries.every((d) => String(d.remarks).startsWith("[ORDER]")),
      "every plan row carries the [ORDER] marker"
    );
    containerId = trip.id;
  });

  it("never mints a real TR- trip for id 0", async () => {
    assert.equal(await countTrips("TR-%"), 0);
    assert.equal(await countTrips("ORD-%"), 1);
  });

  it("re-saving (addressed by the real id) upserts the SAME container — no duplicate", async () => {
    const trip = await tripsService.submitStep(containerId, "deliveries", {
      mode: "save",
      deliveries: [planRow(shops[0], 5, 1), planRow(shops[3], 1, 2)],
    } as Record<string, unknown>);

    assert.equal(trip.id, containerId, "same container row");
    assert.equal(trip.tripNo, ORD_NO);
    assert.equal(trip.deliveries.length, 2, "full snapshot replace");
    assert.equal(await countTrips("ORD-%"), 1, "still exactly one container");
    assert.equal(await countTrips("TR-%"), 0);
  });

  it("re-sending id 0 with the same ORD number is idempotent (no second container)", async () => {
    const trip = await tripsService.submitStep(0, "deliveries", {
      mode: "save",
      tripNo: ORD_NO,
      deliveries: [planRow(shops[0], 2, 1)],
    } as Record<string, unknown>);
    assert.equal(trip.id, containerId);
    assert.equal(await countTrips("ORD-%"), 1);
  });

  it("Finish Collection latches startStepSubmitted without any pickup gate", async () => {
    const trip = await tripsService.submitStep(containerId, "deliveries", {
      mode: "save",
      startStepSubmitted: true,
      deliveries: [planRow(shops[0], 2, 1), planRow(shops[1], 3, 2)],
    } as Record<string, unknown>);
    assert.equal(trip.id, containerId);
    assert.equal(trip.startStepSubmitted, true);
    assert.equal(trip.pickupStepSubmitted, false, "no pickup on a container");
  });

  it("GET /trips?full=true surfaces the container with its rows for the Orders page", async () => {
    const full = (await tripsService.list({ full: true })) as Array<{
      id: number;
      tripNo: string;
      deliveries: unknown[];
    }>;
    const found = full.find((t) => t.id === containerId);
    assert.ok(found, "container present in the full list");
    assert.equal(found!.tripNo, ORD_NO);
    assert.ok(found!.deliveries.length >= 1, "rows hydrated (summary payload omits them)");
  });

  it("id 0 with a NON-ORD tripNo still behaves like the missing Trip 0 (404)", async () => {
    await assert.rejects(
      () =>
        tripsService.submitStep(0, "deliveries", {
          mode: "save",
          tripNo: "TR-not-an-order",
          deliveries: [],
        } as Record<string, unknown>),
      /Trip 0 not found/
    );
  });
});
