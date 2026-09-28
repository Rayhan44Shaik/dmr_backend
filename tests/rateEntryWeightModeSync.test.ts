/**
 * Trip List ↔ Rate Entry weight-mode sync (real PostgreSQL engine, no mocks).
 *
 * A 1-load trip with one box shop and TWO weight-mode shops (the
 * TR-20260805-002 shape) must read the same on both pages:
 *   • Trip List (`tripsService.listCompleted`) counts total shops = 3.
 *   • Rate Entry (`rateEntryService.getById`) lists all 3 deliveries with
 *     their modes and totalShops = 3 — weight rows are rateable, not dropped.
 *   • Saving rates for all three and locking succeeds end to end, so the
 *     weight shops can never be left rate-less.
 *   • A soft-deleted delivery row disappears from BOTH pages and can never
 *     block the rate lock — Trip List already ignores deleted rows, and Rate
 *     Entry must do the same.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { rateEntryService } = await import("../src/services/rateEntryService.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

describe("weight-mode shops sync between Trip List and Rate Entry", () => {
  it("counts total shops on both pages and locks with all rates", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "WMV0001", vehicleType: "Lorry", noOfBoxes: 20,
      birdCapacity: 2000, capacityKg: 3000, engineNumber: "WMENG1",
      chassisNumber: "WMCHS1", status: "Active",
    });
    const driver = await mastersService.upsertEmployee({
      employeeName: "WM Driver", department: "Driver", role: "Driver",
      phoneNumber: "9833010001", licenseNumber: "WMDL1", salary: 18000, status: "Active",
    });
    const supervisor = await mastersService.upsertEmployee({
      employeeName: "WM Sup", department: "Supervisor", role: "Supervisor",
      phoneNumber: "9833020001", salary: 24000, status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: "WM Farm", ownerName: "Owner", supervisorName: "Sup",
      phoneNumber: "9833030001", village: "V", address: "A", capacity: 30000, status: "Active",
    });
    const birdType = await mastersService.upsertBirdType({
      birdType: "WM Bird", averageWeight: 2.5, description: "weight sync", status: "Active",
    });
    const boxShop = await mastersService.upsertShop({
      shopName: "WM Box Shop", ownerName: "Owner", phoneNumber: "9833040001",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });
    const weightShopA = await mastersService.upsertShop({
      shopName: "WM Weight Shop A", ownerName: "Owner", phoneNumber: "9833040002",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });
    const weightShopB = await mastersService.upsertShop({
      shopName: "WM Weight Shop B", ownerName: "Owner", phoneNumber: "9833040003",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });

    const trip = await tripsService.save(null, {
      tripDate: "2026-09-22", vehicleId: vehicle.id, driverId: driver.id,
      supervisorId: supervisor.id, openingMeter: 9000, advanceAmount: 100,
      startStepSubmitted: true, status: "Draft",
    });
    await tripsService.submitStep(trip.id, "farm", {
      legIndex: 1, sourceFarmId: farm.id, sourceFarm: farm.farmName, destMeter: 9050,
      pickupTolls: 0, avgBirdWeight: 2.5, farmBirdTypeId: birdType.id,
      farmBirdType: birdType.birdType, farmGpsLat: 12.97, farmGpsLon: 77.59,
      farmGpsAccuracy: 10, farmGpsTime: new Date().toISOString(),
    });
    await tripsService.submitStep(trip.id, "pickup", {
      legIndex: 1,
      boxDetails: [{ boxNo: 1, birds: 62, weight: 190 }],
      dcPhotoKey: `wm-${trip.id}`,
      dcPhotoMime: "image/jpeg",
      dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
    });
    await tripsService.submitStep(trip.id, "deliveries", {
      legIndex: 1,
      deliveries: [
        {
          id: 0, clientKey: `wm-${trip.id}-box`, shopId: boxShop.id, shopName: boxShop.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 40, weight: 80,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "box", selectedBoxIds: [1], boxNo: 1,
        },
        {
          id: 0, clientKey: `wm-${trip.id}-wa`, shopId: weightShopA.id, shopName: weightShopA.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 10, weight: 50,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "weight", selectedBoxIds: [], boxNo: null,
        },
        {
          id: 0, clientKey: `wm-${trip.id}-wb`, shopId: weightShopB.id, shopName: weightShopB.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 12, weight: 60,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "weight", selectedBoxIds: [], boxNo: null,
        },
      ],
    });
    await tripsService.submitStep(trip.id, "expenses", { closingMeter: 9200, meals: 50 });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });

    // Trip List side: total shops across modes.
    const listed = await tripsService.listCompleted({});
    assert.ok(Array.isArray(listed), "default list stays a bare array");
    const summary = listed.find((t) => t.id === trip.id);
    assert.ok(summary, "completed trip present on Trip List");
    assert.equal(summary.totalShops, 3, "Trip List counts total shops (box + weight)");

    // Rate Entry side: the same three shops, modes intact.
    const detail = await rateEntryService.getById(trip.id);
    assert.equal(detail.deliveries.length, 3, "Rate Entry lists every shop");
    assert.deepEqual(
      detail.deliveries.map((d) => d.deliveryMode).sort(),
      ["box", "weight", "weight"]
    );
    assert.equal(detail.totalShops, 3, "Rate Entry total matches Trip List");
    assert.equal(detail.deliveriesCount, 3);

    // End to end: rate all three (weight amounts derive from weight × rate)
    // and lock — the weight shops must be lockable, never stranded.
    const byName = new Map(detail.deliveries.map((d) => [d.shopName, d.id]));
    const saved = await rateEntryService.save(trip.id, {
      rates: [
        { deliveryId: byName.get("WM Box Shop")!, rate: 100 },
        { deliveryId: byName.get("WM Weight Shop A")!, rate: 110 },
        { deliveryId: byName.get("WM Weight Shop B")!, rate: 120 },
      ],
    });
    assert.equal(saved.ratesEntered, 3);
    const locked = await rateEntryService.lock(trip.id, { lockedBy: "test" });
    assert.equal(locked.rateLocked, true);
    assert.equal(locked.totalAmount, 80 * 100 + 50 * 110 + 60 * 120);
  });

  it("a soft-deleted delivery leaves both pages and never blocks the lock", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "WMV0002", vehicleType: "Lorry", noOfBoxes: 20,
      birdCapacity: 2000, capacityKg: 3000, engineNumber: "WMENG2",
      chassisNumber: "WMCHS2", status: "Active",
    });
    const driver = await mastersService.upsertEmployee({
      employeeName: "WM Driver 2", department: "Driver", role: "Driver",
      phoneNumber: "9833110001", licenseNumber: "WMDL2", salary: 18000, status: "Active",
    });
    const supervisor = await mastersService.upsertEmployee({
      employeeName: "WM Sup 2", department: "Supervisor", role: "Supervisor",
      phoneNumber: "9833120001", salary: 24000, status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: "WM Farm 2", ownerName: "Owner", supervisorName: "Sup",
      phoneNumber: "9833130001", village: "V", address: "A", capacity: 30000, status: "Active",
    });
    const birdType = await mastersService.upsertBirdType({
      birdType: "WM Bird 2", averageWeight: 2.5, description: "weight sync", status: "Active",
    });
    const boxShop = await mastersService.upsertShop({
      shopName: "WM2 Box Shop", ownerName: "Owner", phoneNumber: "9833140001",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });
    const weightShop = await mastersService.upsertShop({
      shopName: "WM2 Weight Shop", ownerName: "Owner", phoneNumber: "9833140002",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });

    const trip = await tripsService.save(null, {
      tripDate: "2026-09-22", vehicleId: vehicle.id, driverId: driver.id,
      supervisorId: supervisor.id, openingMeter: 9300, advanceAmount: 100,
      startStepSubmitted: true, status: "Draft",
    });
    await tripsService.submitStep(trip.id, "farm", {
      legIndex: 1, sourceFarmId: farm.id, sourceFarm: farm.farmName, destMeter: 9350,
      pickupTolls: 0, avgBirdWeight: 2.5, farmBirdTypeId: birdType.id,
      farmBirdType: birdType.birdType, farmGpsLat: 12.97, farmGpsLon: 77.59,
      farmGpsAccuracy: 10, farmGpsTime: new Date().toISOString(),
    });
    await tripsService.submitStep(trip.id, "pickup", {
      legIndex: 1,
      boxDetails: [{ boxNo: 1, birds: 40, weight: 100 }],
      dcPhotoKey: `wm2-${trip.id}`,
      dcPhotoMime: "image/jpeg",
      dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
    });
    await tripsService.submitStep(trip.id, "deliveries", {
      legIndex: 1,
      deliveries: [
        {
          id: 0, clientKey: `wm2-${trip.id}-box`, shopId: boxShop.id, shopName: boxShop.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 30, weight: 60,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "box", selectedBoxIds: [1], boxNo: 1,
        },
        {
          id: 0, clientKey: `wm2-${trip.id}-w`, shopId: weightShop.id, shopName: weightShop.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 8, weight: 40,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "weight", selectedBoxIds: [], boxNo: null,
        },
      ],
    });
    await tripsService.submitStep(trip.id, "expenses", { closingMeter: 9400, meals: 50 });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });

    // Retire the weight delivery the way an edit does (soft delete).
    await pool.query(
      `UPDATE trip_deliveries SET deleted = TRUE WHERE trip_id = $1 AND shop_id = $2`,
      [trip.id, weightShop.id]
    );

    const listed = await tripsService.listCompleted({});
    assert.ok(Array.isArray(listed));
    const summary = listed.find((t) => t.id === trip.id);
    assert.ok(summary);
    assert.equal(summary.totalShops, 1, "Trip List drops the deleted shop");

    const detail = await rateEntryService.getById(trip.id);
    assert.equal(detail.deliveries.length, 1, "Rate Entry drops the deleted shop too");
    assert.equal(detail.deliveries[0].shopName, "WM2 Box Shop");
    assert.equal(detail.totalShops, 1);

    // The deleted row is rate-less but must not block the lock.
    await rateEntryService.save(trip.id, {
      rates: [{ deliveryId: detail.deliveries[0].id, rate: 100 }],
    });
    const locked = await rateEntryService.lock(trip.id, { lockedBy: "test" });
    assert.equal(locked.rateLocked, true);
  });

  it("a zero-box collection-shaped weight row persists as weight everywhere", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "WMV0003", vehicleType: "Lorry", noOfBoxes: 20,
      birdCapacity: 2000, capacityKg: 3000, engineNumber: "WMENG3",
      chassisNumber: "WMCHS3", status: "Active",
    });
    const driver = await mastersService.upsertEmployee({
      employeeName: "WM Driver 3", department: "Driver", role: "Driver",
      phoneNumber: "9833210001", licenseNumber: "WMDL3", salary: 18000, status: "Active",
    });
    const supervisor = await mastersService.upsertEmployee({
      employeeName: "WM Sup 3", department: "Supervisor", role: "Supervisor",
      phoneNumber: "9833220001", salary: 24000, status: "Active",
    });
    const farm = await mastersService.upsertFarm({
      farmName: "WM Farm 3", ownerName: "Owner", supervisorName: "Sup",
      phoneNumber: "9833230001", village: "V", address: "A", capacity: 30000, status: "Active",
    });
    const birdType = await mastersService.upsertBirdType({
      birdType: "WM Bird 3", averageWeight: 2.5, description: "weight sync", status: "Active",
    });
    const weightShop = await mastersService.upsertShop({
      shopName: "WM3 Weight Shop", ownerName: "Owner", phoneNumber: "9833240001",
      village: "V", address: "A", status: "Active", openingBalance: 0,
    });

    const trip = await tripsService.save(null, {
      tripDate: "2026-09-22", vehicleId: vehicle.id, driverId: driver.id,
      supervisorId: supervisor.id, openingMeter: 9500, advanceAmount: 100,
      startStepSubmitted: true, status: "Draft",
    });
    await tripsService.submitStep(trip.id, "farm", {
      legIndex: 1, sourceFarmId: farm.id, sourceFarm: farm.farmName, destMeter: 9550,
      pickupTolls: 0, avgBirdWeight: 2.5, farmBirdTypeId: birdType.id,
      farmBirdType: birdType.birdType, farmGpsLat: 12.97, farmGpsLon: 77.59,
      farmGpsAccuracy: 10, farmGpsTime: new Date().toISOString(),
    });
    await tripsService.submitStep(trip.id, "pickup", {
      legIndex: 1,
      boxDetails: [{ boxNo: 1, birds: 15, weight: 45 }],
      dcPhotoKey: `wm3-${trip.id}`,
      dcPhotoMime: "image/jpeg",
      dcPhotoData: `data:image/jpeg;base64,${"A".repeat(80)}`,
    });
    // Collection-sheet shape: no boxes captured (boxNo 0), billed by weight.
    await tripsService.submitStep(trip.id, "deliveries", {
      legIndex: 1,
      deliveries: [
        {
          id: 0, clientKey: `wm3-${trip.id}-w`, shopId: weightShop.id, shopName: weightShop.shopName,
          birdTypeId: birdType.id, birdType: birdType.birdType, birds: 15, weight: 45,
          mortality: 0, mortKg: 0, rate: null, amount: 0, remarks: "",
          deliveryMode: "weight", selectedBoxIds: [], boxNo: 0,
        },
      ],
    });
    await tripsService.submitStep(trip.id, "expenses", { closingMeter: 9600, meals: 50 });
    await tripsService.updateStatus(trip.id, { status: "Completed", approvedBy: "test" });

    const detail = await rateEntryService.getById(trip.id);
    assert.equal(detail.deliveries.length, 1);
    assert.equal(detail.deliveries[0].deliveryMode, "weight", "zero-box row stays weight mode");
    assert.equal(detail.totalShops, 1);

    const listed = await tripsService.listCompleted({});
    assert.ok(Array.isArray(listed));
    const summary = listed.find((t) => t.id === trip.id);
    assert.ok(summary);
    assert.equal(summary.totalShops, 1, "Trip List counts the weight shop");

    await rateEntryService.save(trip.id, {
      rates: [{ deliveryId: detail.deliveries[0].id, rate: 100 }],
    });
    const locked = await rateEntryService.lock(trip.id, { lockedBy: "test" });
    assert.equal(locked.rateLocked, true);
    assert.equal(locked.totalAmount, 45 * 100);
  });
});
