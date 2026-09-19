/**
 * Trip Entry Step 4 (Deliveries) â€” per-shop persistence, idempotency and
 * backend-authoritative validation.
 *
 * Covers:
 *  - per-shop save preserves previously saved shops (no wipe)
 *  - idempotent upsert by client_key (retry / double-click / network timeout
 *    never creates a duplicate), and by server id for legacy rows
 *  - Step 3 pickup capacity (birds + mortality, weight + mortality weight)
 *  - shop-level box availability (a box is exclusive to one shop)
 *  - selected box available weight vs delivery weight (box may hold MORE,
 *    never less)
 *  - active-shop rule for new selections (inactive rejected, historical kept)
 *  - Save Progress never captures the official Step 4 timestamp; final submit
 *    captures it once; edits never change it
 *
 * Runs the real Express app against real PGlite-Postgres â€” no mocks.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
import type { ShopDelivery } from "../src/types/models.js";

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let vehicleSeq = 0;
async function seedMasters() {
  vehicleSeq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `S4V${String(vehicleSeq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    engineNumber: `S4ENG${vehicleSeq}`,
    chassisNumber: `S4CHS${vehicleSeq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `S4 Driver ${vehicleSeq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `93120000${String(vehicleSeq).padStart(2, "0")}`,
    licenseNumber: `S4DL${vehicleSeq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `S4 Supervisor ${vehicleSeq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `94120000${String(vehicleSeq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `S4 Farm ${vehicleSeq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `96620000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `S4 Bird ${vehicleSeq}`,
    averageWeight: 2.5,
    description: "Step 4 integration test bird type",
    status: "Active",
  });
  const shopA = await mastersService.upsertShop({
    shopName: `Shop Alpha ${vehicleSeq}`,
    ownerName: "Owner A",
    phoneNumber: `90000000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
  });
  const shopB = await mastersService.upsertShop({
    shopName: `Shop Beta ${vehicleSeq}`,
    ownerName: "Owner B",
    phoneNumber: `91000000${String(vehicleSeq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
  });
  return { vehicle, driver, supervisor, farm, birdType, shopA, shopB };
}

/** Creates a trip with Steps 1-3 complete and pickup boxes persisted. */
async function makePickupTrip(
  m: Awaited<ReturnType<typeof seedMasters>>,
  opts: { tripDate: string; boxes: { boxNo: number; birds: number; weight: number }[] }
) {
  return tripsService.save(null, {
    tripNo: "IGNORED",
    tripDate: opts.tripDate,
    status: "Draft",
    vehicleId: m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    boxDetails: opts.boxes,
  } as Record<string, unknown>);
}

function delivery(overrides: Partial<ShopDelivery> = {}): ShopDelivery {
  return {
    id: 0,
    clientKey: undefined,
    shopId: null,
    shopName: "",
    birdTypeId: null,
    birdType: "",
    birds: 0,
    weight: 0,
    mortality: 0,
    mortKg: 0,
    rate: null,
    amount: 0,
    remarks: "",
    deliveryMode: "box",
    selectedBoxIds: [],
    farmBirds: 0,
    farmWeight: 0,
    perBoxData: [],
    ...overrides,
  };
}

async function rowsFor(tripId: number) {
  const res = await pool.query(
    `SELECT id, client_key, shop_name, birds, weight, mortality, mort_kg, delivery_mode
       FROM trip_deliveries WHERE trip_id = $1 ORDER BY id`,
    [tripId]
  );
  return res.rows;
}

describe("Step 4 per-shop persistence (saveDeliveries)", () => {
  it("saving one shop preserves shops already saved (no wipe)", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-01",
      boxes: [
        { boxNo: 1, birds: 100, weight: 200 },
        { boxNo: 2, birds: 50, weight: 100 },
      ],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-shop-a",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birdTypeId: m.birdType.id,
          birdType: m.birdType.birdType,
          birds: 90,
          weight: 180,
          mortality: 10,
          mortKg: 20,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-shop-b",
          shopId: m.shopB.id,
          shopName: m.shopB.shopName,
          birds: 50,
          weight: 100,
          mortality: 0,
          mortKg: 0,
          selectedBoxIds: [2],
          farmBirds: 50,
          farmWeight: 100,
        }),
      ],
    });

    const rows = await rowsFor(trip.id);
    assert.equal(rows.length, 2, "both shops must persist");
    const names = rows.map((r) => r.shop_name).sort();
    assert.deepEqual(names, [m.shopA.shopName, m.shopB.shopName].sort());
    assert.equal(rows[0].client_key, "ck-shop-a");
    assert.equal(rows[1].client_key, "ck-shop-b");
  });

  it("retrying the same client_key updates instead of duplicating", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-02",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    const save = (birds: number, weight: number) =>
      tripsService.saveDeliveries(trip.id, {
        deliveries: [
          delivery({
            clientKey: "ck-retry",
            shopId: m.shopA.id,
            shopName: m.shopA.shopName,
            birds,
            weight,
            mortality: 0,
            mortKg: 0,
            selectedBoxIds: [1],
            farmBirds: 100,
            farmWeight: 200,
          }),
        ],
      });

    await save(60, 120);
    await save(60, 120); // network retry with identical payload
    let rows = await rowsFor(trip.id);
    assert.equal(rows.length, 1, "retry must not create a duplicate");
    assert.equal(Number(rows[0].birds), 60);

    await save(70, 140); // edit after a successful save
    rows = await rowsFor(trip.id);
    assert.equal(rows.length, 1, "edit must keep the same single row");
    assert.equal(Number(rows[0].birds), 70);
    assert.equal(Number(rows[0].weight), 140);
  });

  it("updates a legacy row by server id when no client_key is present", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-03",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-legacy",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birdTypeId: m.birdType.id,
          birdType: m.birdType.birdType,
          birds: 50,
          weight: 100,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    // Simulate a legacy client (or cleared clientKey) matching by server id.
    const [{ id }] = await rowsFor(trip.id);
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({ id, shopId: m.shopA.id, shopName: m.shopA.shopName, birds: 80, weight: 160, selectedBoxIds: [1] }),
      ],
    });

    const rows = await rowsFor(trip.id);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].birds), 80);
    assert.equal(Number(rows[0].weight), 160);
  });

  it("rejects a new delivery to an Inactive shop but allows keeping an existing one", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-04",
      boxes: [
        { boxNo: 1, birds: 100, weight: 200 },
        { boxNo: 2, birds: 50, weight: 100 },
      ],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-historical",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 50,
          weight: 100,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    await mastersService.updateShopStatus(m.shopA.id, "Inactive");

    // New selection of an inactive shop must be rejected.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-inactive-new",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birdTypeId: m.birdType.id,
              birdType: m.birdType.birdType,
              birds: 40,
              weight: 80,
              selectedBoxIds: [2],
              farmBirds: 50,
              farmWeight: 100,
            }),
          ],
        }),
      /no longer available/i
    );

    // Editing the existing (historical) row for that same shop stays allowed.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-historical",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 60,
          weight: 120,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });
    const rows = await rowsFor(trip.id);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].birds), 60);
  });

  it("enforces Step 3 pickup capacity (birds + mortality)", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-05",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    // 90 + 10 = 100 -> exactly at capacity, accepted.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-capacity-birds",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 90,
          weight: 180,
          mortality: 10,
          mortKg: 20,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    // 91 + 10 = 101 -> over capacity, rejected, DB unchanged.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-capacity-birds",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 91,
              weight: 180,
              mortality: 10,
              mortKg: 20,
              selectedBoxIds: [1],
              farmBirds: 100,
              farmWeight: 200,
            }),
          ],
        }),
      /exceed/i
    );
    const rows = await rowsFor(trip.id);
    assert.equal(Number(rows[0].birds), 90, "rejected save must not mutate the DB");
  });

  it("enforces Step 3 pickup capacity (weight + mortality weight)", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-06",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-capacity-weight",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 100,
          weight: 180,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-capacity-weight",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 100,
              weight: 201,
              selectedBoxIds: [1],
              farmBirds: 100,
              farmWeight: 200,
            }),
          ],
        }),
      /exceed/i
    );
  });

  it("a box may hold MORE weight than the delivery; delivery may not exceed it", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-07",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    // Delivery 150 kg < box 200 kg -> accepted (partial box consumption).
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-box-partial",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 100,
          weight: 150,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });
    let rows = await rowsFor(trip.id);
    assert.equal(Number(rows[0].weight), 150);

    // Delivery 210 kg > box 200 kg -> rejected.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-box-partial",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 100,
              weight: 210,
              selectedBoxIds: [1],
              farmBirds: 100,
              farmWeight: 200,
            }),
          ],
        }),
      /available weight/i
    );
    rows = await rowsFor(trip.id);
    assert.equal(Number(rows[0].weight), 150, "rejected save must not mutate the DB");
  });

  it("rejects using a box already assigned to another shop delivery", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-08",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-box-used-a",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birds: 60,
          weight: 120,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-box-used-b",
              shopId: m.shopB.id,
              shopName: m.shopB.shopName,
              birds: 40,
              weight: 80,
              selectedBoxIds: [1],
              farmBirds: 100,
              farmWeight: 200,
            }),
          ],
        }),
      /already used/i
    );
  });

  it("weight-mode per-box breakdown cannot exceed each box capacity", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-09",
      boxes: [
        { boxNo: 1, birds: 100, weight: 200 },
        { boxNo: 2, birds: 50, weight: 100 },
      ],
    });

    // Per-box breakdown within capacity -> accepted.
    await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-weight-mode",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          deliveryMode: "weight",
          birds: 90,
          weight: 190,
          mortality: 10,
          mortKg: 10,
          selectedBoxIds: [1, 2],
          perBoxData: [
            { boxNo: 1, birds: 60, weight: 130 },
            { boxNo: 2, birds: 30, weight: 60 },
          ],
        }),
      ],
    });
    let rows = await rowsFor(trip.id);
    assert.equal(Number(rows[0].birds), 90);

    // Box 2 delivered weight 120 > available 100 -> rejected.
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-weight-mode",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              deliveryMode: "weight",
              birds: 90,
              weight: 250,
              mortality: 10,
              mortKg: 10,
              selectedBoxIds: [1, 2],
              perBoxData: [
                { boxNo: 1, birds: 60, weight: 130 },
                { boxNo: 2, birds: 30, weight: 120 },
              ],
            }),
          ],
        }),
      /available weight/i
    );
    rows = await rowsFor(trip.id);
    assert.equal(Number(rows[0].weight), 190, "rejected save must not mutate the DB");
  });

  it("rejects impossible negative values", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-10",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-negative",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: -5,
              weight: 100,
              selectedBoxIds: [1],
            }),
          ],
        }),
      /negative/i
    );
    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-negative-2",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 100,
              weight: 100,
              mortality: -1,
              selectedBoxIds: [1],
            }),
          ],
        }),
      /negative/i
    );
  });

  it("rejects saving deliveries before Step 3 (Pickup) provides capacity", async () => {
    const m = await seedMasters();
    // Steps 1-2 submitted, but NO pickup boxes / capacity yet.
    const trip = await tripsService.save(null, {
      tripNo: "IGNORED",
      tripDate: "2026-07-14",
      status: "Draft",
      vehicleId: m.vehicle.id,
      vehicleNo: m.vehicle.vehicleNumber,
      driverId: m.driver.id,
      driverName: m.driver.employeeName,
      supervisorId: m.supervisor.id,
      supervisorName: m.supervisor.employeeName,
      sourceFarmId: m.farm.id,
      sourceFarm: m.farm.farmName,
      openingMeter: 1000,
      startStepSubmitted: true,
      farmStepSubmitted: true,
    } as Record<string, unknown>);

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-no-pickup",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 50,
              weight: 100,
            }),
          ],
        }),
      /Step 3 \(Pickup\)/i
    );
  });

  it("rejects saving deliveries on a soft-deleted trip", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-15",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });
    await tripsService.softDelete(trip.id, "test cleanup");

    await assert.rejects(
      () =>
        tripsService.saveDeliveries(trip.id, {
          deliveries: [
            delivery({
              clientKey: "ck-deleted-trip",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birds: 50,
              weight: 100,
              selectedBoxIds: [1],
            }),
          ],
        }),
      /deleted/i
    );
  });
});

describe("Step 4 timestamp semantics", () => {
  it("Save Progress never captures the timestamp; submit captures once; edits keep it", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-11",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    const savedTrip = await tripsService.saveDeliveries(trip.id, {
      deliveries: [
        delivery({
          clientKey: "ck-ts",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birdTypeId: m.birdType.id,
          birdType: m.birdType.birdType,
          birds: 100,
          weight: 200,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
        }),
      ],
    });
    assert.equal(savedTrip.deliveryStepSubmitted, false, "Save Progress must not submit Step 4");
    const before = await pool.query(
      `SELECT deliveries_step_submitted_at FROM trips WHERE id = $1`,
      [trip.id]
    );
    assert.equal(before.rows[0].deliveries_step_submitted_at, null, "Save Progress must not capture the official timestamp");

    const submitted = await tripsService.submitStep(trip.id, "deliveries", {
      deliveries: [
        delivery({
          clientKey: "ck-ts",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birdTypeId: m.birdType.id,
          birdType: m.birdType.birdType,
          birds: 100,
          weight: 200,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
          rate: 10,
          amount: 999999,
        }),
      ],
      deliveryStepSubmitted: true,
    } as Record<string, unknown>);
    assert.equal(submitted.deliveryStepSubmitted, true, "final submit must mark Step 4 submitted");
    const authoritativeAmount = await pool.query(
      `SELECT amount FROM trip_deliveries WHERE trip_id = $1`,
      [trip.id]
    );
    assert.equal(
      Number(authoritativeAmount.rows[0].amount),
      2000,
      "server must derive amount from persisted weight and rate"
    );
    const afterSubmit = await pool.query(
      `SELECT deliveries_step_submitted_at FROM trips WHERE id = $1`,
      [trip.id]
    );
    assert.ok(afterSubmit.rows[0].deliveries_step_submitted_at, "submit must capture the server timestamp");

    // Editing the submitted delivery must NOT change the timestamp.
    const edited = await tripsService.submitStep(trip.id, "deliveries", {
      deliveries: [
        delivery({
          clientKey: "ck-ts",
          shopId: m.shopA.id,
          shopName: m.shopA.shopName,
          birdTypeId: m.birdType.id,
          birdType: m.birdType.birdType,
          birds: 95,
          weight: 190,
          mortality: 5,
          mortKg: 10,
          selectedBoxIds: [1],
          farmBirds: 100,
          farmWeight: 200,
          amount: 0,
        }),
      ],
      deliveryStepSubmitted: true,
    } as Record<string, unknown>);
    assert.equal(edited.deliveryStepSubmitted, true);
    const afterEdit = await pool.query(
      `SELECT deliveries_step_submitted_at FROM trips WHERE id = $1`,
      [trip.id]
    );
    const submitVal = new Date(afterSubmit.rows[0].deliveries_step_submitted_at).toISOString();
    const editVal = new Date(afterEdit.rows[0].deliveries_step_submitted_at).toISOString();
    assert.equal(
      editVal,
      submitVal,
      "editing Step 4 must not generate a new timestamp"
    );
  });

  it("final submit rejects an incomplete shop delivery (zero birds/weight)", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-12",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "deliveries", {
          deliveries: [
            delivery({
              clientKey: "ck-incomplete",
              shopId: m.shopA.id,
              shopName: m.shopA.shopName,
              birdTypeId: m.birdType.id,
              birdType: m.birdType.birdType,
              birds: 0,
              weight: 0,
              selectedBoxIds: [1],
            }),
          ],
          deliveryStepSubmitted: true,
        } as Record<string, unknown>),
      /greater than zero/i
    );
    const flag = await pool.query(
      `SELECT delivery_step_submitted FROM trips WHERE id = $1`,
      [trip.id]
    );
    assert.equal(flag.rows[0].delivery_step_submitted, false, "failed submit must not mark the step");
  });
});

describe("Step 4 API endpoint (PUT /trips/:id/deliveries)", () => {
  it("returns the hydrated trip with the saved delivery and KPIs", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-13",
      boxes: [{ boxNo: 1, birds: 100, weight: 200 }],
    });

    const res = await fetch(`${app.baseUrl}/api/trips/${trip.id}/deliveries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...app.authHeaders },
      body: JSON.stringify({
        deliveries: [
          {
            clientKey: "ck-api",
            shopId: m.shopA.id,
            shopName: m.shopA.shopName,
            birds: 100,
            weight: 200,
            mortality: 0,
            mortKg: 0,
            deliveryMode: "box",
            selectedBoxIds: [1],
            farmBirds: 100,
            farmWeight: 200,
            amount: 0,
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      deliveries: Array<{ clientKey?: string; shopName: string; birds: number }>;
      totalShops: number;
      totalBirdsDelivered: number;
      totalDeliveredWeight: number;
    };
    assert.equal(body.deliveries.length, 1);
    assert.equal(body.deliveries[0].clientKey, "ck-api");
    assert.equal(body.totalShops, 1);
    assert.equal(body.totalBirdsDelivered, 100);
    assert.equal(body.totalDeliveredWeight, 200);
  });
});

describe("Orders partial-delivery integrity", () => {
  it("persists equal partial captures and rejects capture totals above assignment", async () => {
    const m = await seedMasters();
    const trip = await makePickupTrip(m, {
      tripDate: "2026-07-14",
      boxes: [{ boxNo: 1, birds: 300, weight: 600 }],
    });
    const plan = delivery({
      clientKey: "orders-plan",
      serialNo: 1,
      boxNo: 20,
      shopId: m.shopA.id,
      shopName: m.shopA.shopName,
      birds: 200,
      remarks: "[ORDER] O:TR-ORDER-001",
    });
    const capture = (clientKey: string, serialNo: number) =>
      delivery({
        clientKey,
        serialNo,
        boxNo: 10,
        shopId: m.shopA.id,
        shopName: m.shopA.shopName,
        birds: 100,
        remarks: "[ORDER] O:TR-ORDER-001",
        autoCaptureTime: new Date(`2026-07-14T0${serialNo}:00:00.000Z`).toISOString(),
      });

    await tripsService.submitStep(trip.id, "deliveries", {
      deliveries: [plan, capture("orders-part-1", 2), capture("orders-part-2", 3)],
      mode: "save",
    } as Record<string, unknown>);
    const persisted = await pool.query(
      `SELECT client_key, box_no, auto_capture_time
         FROM trip_deliveries WHERE trip_id=$1 ORDER BY serial_no`,
      [trip.id],
    );
    assert.equal(persisted.rowCount, 3);
    assert.equal(
      persisted.rows.filter((row) => row.auto_capture_time != null).reduce((sum, row) => sum + Number(row.box_no), 0),
      20,
    );

    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "deliveries", {
          deliveries: [
            plan,
            capture("orders-part-1", 2),
            capture("orders-part-2", 3),
            capture("orders-part-3", 4),
          ],
          mode: "save",
        } as Record<string, unknown>),
      /exceed the assigned quantity/i,
    );
    const afterReject = await pool.query(
      `SELECT COUNT(*)::int AS count FROM trip_deliveries WHERE trip_id=$1`,
      [trip.id],
    );
    assert.equal(Number(afterReject.rows[0].count), 3, "rejected over-delivery must roll back atomically");
  });
});

