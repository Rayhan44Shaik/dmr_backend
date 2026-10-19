/**
 * Batch C3 — duplicate pickup-file race on a real, disposable PostgreSQL
 * cluster (not PGlite). Set C3_REAL_PG_URL to a migrated, throwaway database;
 * the test is skipped otherwise so the default suite never needs a server.
 *
 * Proves: simultaneous submissions of the identical file hash commit exactly
 * one import and return 409 for every loser, with no duplicate boxes or
 * fingerprints.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const url = process.env.C3_REAL_PG_URL;
if (!url) {
  describe("C3 real-PostgreSQL duplicate import race", () => {
    it.skip("C3_REAL_PG_URL not set", () => undefined);
  });
} else {
  process.env.DATABASE_URL = url;
  const { pool } = await import("../src/config/db.js");
  const { mastersService } = await import("../src/services/mastersService.js");
  const { tripsService } = await import("../src/services/tripsService.js");

  after(async () => {
    await pool.end();
  });

  describe("C3 real-PostgreSQL duplicate import race", () => {
    it("commits exactly one of eight simultaneous identical uploads", async () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const vehicle = await mastersService.upsertVehicle({
        vehicleNumber: `RACE-V-${suffix}`,
        vehicleType: "Lorry",
        noOfBoxes: 40,
        birdCapacity: 2000,
        capacityKg: 3000,
        engineNumber: `RACE-E-${suffix}`,
        chassisNumber: `RACE-C-${suffix}`,
        status: "Active",
      });
      const driver = await mastersService.upsertEmployee({
        employeeName: `Race Driver ${suffix}`,
        department: "Driver",
        role: "Driver",
        phoneNumber: "9799990001",
        licenseNumber: `RACE-DL-${suffix}`,
        salary: 18000,
        status: "Active",
      });
      const supervisor = await mastersService.upsertEmployee({
        employeeName: `Race Sup ${suffix}`,
        department: "Supervisor",
        role: "Supervisor",
        phoneNumber: "9799990002",
        salary: 22000,
        status: "Active",
      });
      const farm = await mastersService.upsertFarm({
        farmName: `Race Farm ${suffix}`,
        ownerName: "Owner",
        supervisorName: "FarmSup",
        phoneNumber: "9799990003",
        village: "Village",
        address: "Address",
        capacity: 10000,
        status: "Active",
      });
      const birdType = await mastersService.upsertBirdType({
        birdType: `Race Bird ${suffix}`,
        averageWeight: 2,
        description: "",
        status: "Active",
      });
      const trip = await tripsService.save(null, {
        tripDate: "2026-10-18",
        status: "Draft",
        vehicleId: vehicle.id,
        vehicleNo: vehicle.vehicleNumber,
        driverId: driver.id,
        driverName: driver.employeeName,
        supervisorId: supervisor.id,
        supervisorName: supervisor.employeeName,
        sourceFarmId: farm.id,
        sourceFarm: farm.farmName,
        farmBirdTypeId: birdType.id,
        farmBirdType: birdType.birdType,
        openingMeter: 91000,
        destMeter: 91200,
        startStepSubmitted: true,
        farmStepSubmitted: true,
        pickupStepSubmitted: true,
      } as Record<string, unknown>);

      const hash = "9".repeat(64);
      const payload = {
        boxDetails: [
          { boxNo: 1, birds: 20, weight: 40 },
          { boxNo: 2, birds: 20, weight: 40 },
        ],
        importFingerprint: {
          algorithm: "SHA-256",
          version: 1,
          contentHash: hash,
          originalFilename: "race.xlsx",
          byteLength: 512,
        },
      } as Record<string, unknown>;

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => tripsService.save(trip.id, { ...payload })),
      );
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.equal(fulfilled.length, 1, "exactly one commit");
      assert.equal(rejected.length, 7, "every loser rejects");
      for (const failure of rejected) {
        assert.equal((failure.reason as { status?: number }).status, 409, String(failure.reason));
      }

      const fingerprints = await pool.query(
        `SELECT COUNT(*)::int AS count FROM trip_pickup_import_fingerprints WHERE trip_id = $1`,
        [trip.id],
      );
      assert.equal(Number(fingerprints.rows[0].count), 1);
      const boxes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM trip_boxes WHERE trip_id = $1`,
        [trip.id],
      );
      assert.equal(Number(boxes.rows[0].count), 2, "one box set, not eight");
    });
  });
}
