/**
 * Same Draft trip — multi Step 2/3/4 via trip_legs.
 * Exercises tripsService directly against PGlite (same pattern as farmPayments).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

let seq = 0;

async function seed() {
  seq += 1;
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `MLV${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 20,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `MLENG${seq}`,
    chassisNumber: `MLCHS${seq}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `ML Driver ${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `98110000${String(seq).padStart(2, "0")}`,
    licenseNumber: `MLDL${seq}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `ML Supervisor ${seq}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `98220000${String(seq).padStart(2, "0")}`,
    salary: 24000,
    status: "Active",
  });
  const helper = await mastersService.upsertEmployee({
    employeeName: `ML Helper ${seq}`,
    department: "Helper",
    role: "Helper",
    phoneNumber: `98330000${String(seq).padStart(2, "0")}`,
    salary: 10000,
    status: "Active",
  });
  const loader = await mastersService.upsertEmployee({
    employeeName: `ML Loader ${seq}`,
    department: "Loader",
    role: "Loader",
    phoneNumber: `98440000${String(seq).padStart(2, "0")}`,
    salary: 10000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: `ML Farm ${seq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `98550000${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const farm2 = await mastersService.upsertFarm({
    farmName: `ML Farm B ${seq}`,
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: `98660000${String(seq).padStart(2, "0")}`,
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: `ML Bird ${seq}`,
    averageWeight: 2.5,
    description: "multi-load test",
    status: "Active",
  });
  const shop = await mastersService.upsertShop({
    shopName: `ML Shop ${seq}`,
    ownerName: "Owner",
    phoneNumber: `98770000${String(seq).padStart(2, "0")}`,
    village: "Village",
    status: "Active",
  });
  return { vehicle, driver, supervisor, helper, loader, farm, farm2, birdType, shop };
}

async function startTrip(openingMeter: number) {
  const m = await seed();
  const trip = await tripsService.save(null, {
    tripDate: "2026-09-20",
    vehicleId: m.vehicle.id,
    driverId: m.driver.id,
    supervisorId: m.supervisor.id,
    helpers: [m.helper.employeeName],
    loaders: [m.loader.employeeName],
    openingMeter,
    advanceAmount: 100,
    startStepSubmitted: true,
    status: "Draft",
  });
  return { trip, m };
}

async function runLoad(
  tripId: number,
  legIndex: number,
  opts: {
    destMeter: number;
    farmId: number;
    farmName: string;
    birdTypeId: number;
    birdType: string;
    shopId: number;
    shopName: string;
  }
) {
  await tripsService.submitStep(tripId, "farm", {
    legIndex,
    sourceFarmId: opts.farmId,
    sourceFarm: opts.farmName,
    destMeter: opts.destMeter,
    pickupTolls: 0,
    avgBirdWeight: 2.5,
    farmBirdTypeId: opts.birdTypeId,
    farmBirdType: opts.birdType,
    farmAddress: "Address",
    farmGpsLat: 12.97,
    farmGpsLon: 77.59,
    farmGpsAccuracy: 10,
    farmGpsTime: new Date().toISOString(),
  });
  await tripsService.submitStep(tripId, "pickup", {
    legIndex,
    boxDetails: [{ boxNo: 1, birds: 40, weight: 80 }],
    dcPhotoKey: `dc-${legIndex}`,
    dcPhotoMime: "image/jpeg",
    dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
  });
  await tripsService.submitStep(tripId, "deliveries", {
    legIndex,
    deliveries: [
      {
        id: 0,
        clientKey: `ml-${tripId}-${legIndex}`,
        shopId: opts.shopId,
        shopName: opts.shopName,
        birdTypeId: opts.birdTypeId,
        birdType: opts.birdType,
        birds: 40,
        weight: 80,
        mortality: 0,
        mortKg: 0,
        rate: 100,
        amount: 8000,
        remarks: "",
        deliveryMode: "box",
        selectedBoxIds: [1],
        boxNo: 1,
      },
    ],
  });
}

describe("trip multi-load (same Draft trip)", () => {
  it("single-load trip still completes through expenses", async () => {
    const { trip, m } = await startTrip(1000);
    assert.equal(trip.legCount ?? 1, 1);
    await runLoad(trip.id, 1, {
      destMeter: 1100,
      farmId: m.farm.id,
      farmName: m.farm.farmName,
      birdTypeId: m.birdType.id,
      birdType: m.birdType.birdType,
      shopId: m.shop.id,
      shopName: m.shop.shopName,
    });
    const done = await tripsService.submitStep(trip.id, "expenses", {
      closingMeter: 1200,
      deliveryTolls: 1,
      meals: 50,
    });
    assert.equal(done.status, "Pending");
  });

  it("rejects load-2 farm meter ≤ diesel meter; accepts higher; expenses need all loads", async () => {
    const { trip, m } = await startTrip(2000);
    await runLoad(trip.id, 1, {
      destMeter: 2050,
      farmId: m.farm.id,
      farmName: m.farm.farmName,
      birdTypeId: m.birdType.id,
      birdType: m.birdType.birdType,
      shopId: m.shop.id,
      shopName: m.shop.shopName,
    });

    await tripsService.upsertDieselEntry(trip.id, {
      litres: 15,
      rate: 95,
      meter: 2080,
      bunkName: "Bunk",
      gpsLat: 12.98,
      gpsLon: 77.6,
      gpsAccuracy: 5,
      imageData: `data:image/jpeg;base64,${"B".repeat(80)}`,
      imageName: "bill.jpg",
      clientKey: `diesel-${trip.id}`,
      rowIndex: 1,
    });

    const added = await tripsService.addLeg(trip.id);
    assert.equal(added.legCount, 2);

    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "farm", {
          legIndex: 2,
          sourceFarmId: m.farm2.id,
          sourceFarm: m.farm2.farmName,
          destMeter: 2080,
          pickupTolls: 0,
          avgBirdWeight: 2.5,
          farmBirdTypeId: m.birdType.id,
          farmBirdType: m.birdType.birdType,
          farmAddress: "Address",
          farmGpsLat: 12.97,
          farmGpsLon: 77.59,
          farmGpsAccuracy: 10,
          farmGpsTime: new Date().toISOString(),
        }),
      (err: unknown) => err instanceof AppError && err.status === 422
    );

    await runLoad(trip.id, 2, {
      destMeter: 2095,
      farmId: m.farm2.id,
      farmName: m.farm2.farmName,
      birdTypeId: m.birdType.id,
      birdType: m.birdType.birdType,
      shopId: m.shop.id,
      shopName: m.shop.shopName,
    });

    const done = await tripsService.submitStep(trip.id, "expenses", {
      closingMeter: 2150,
      deliveryTolls: 2,
      // Closing must chronologically follow mid-trip diesel synced to fuel_expenses.
      endTime: new Date(Date.now() + 120_000).toISOString(),
    });
    assert.equal(done.status, "Pending");
  });

  it("cannot add a 4th load", async () => {
    const { trip, m } = await startTrip(3000);
    for (let leg = 1; leg <= 3; leg++) {
      if (leg > 1) await tripsService.addLeg(trip.id);
      await runLoad(trip.id, leg, {
        destMeter: 3000 + leg * 40,
        farmId: m.farm.id,
        farmName: m.farm.farmName,
        birdTypeId: m.birdType.id,
        birdType: m.birdType.birdType,
        shopId: m.shop.id,
        shopName: m.shop.shopName,
      });
    }
    await assert.rejects(
      () => tripsService.addLeg(trip.id),
      (err: unknown) => err instanceof AppError && err.status === 422
    );
  });

  it("blocks expenses while a load is incomplete", async () => {
    const { trip, m } = await startTrip(4000);
    await runLoad(trip.id, 1, {
      destMeter: 4050,
      farmId: m.farm.id,
      farmName: m.farm.farmName,
      birdTypeId: m.birdType.id,
      birdType: m.birdType.birdType,
      shopId: m.shop.id,
      shopName: m.shop.shopName,
    });
    await tripsService.addLeg(trip.id);
    await assert.rejects(
      () =>
        tripsService.submitStep(trip.id, "expenses", {
          closingMeter: 4200,
          deliveryTolls: 0,
        }),
      (err: unknown) => err instanceof AppError && err.status === 422
    );
  });
});
