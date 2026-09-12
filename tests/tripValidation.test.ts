import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateStepSubmit } from "../src/validation/trips.js";

const validStart = {
  tripDate: "2026-09-10",
  vehicleId: 1,
  driverId: 2,
  supervisorId: 3,
  helpers: ["Helper One"],
  loaders: ["Loader One"],
};

describe("Trip step boundary validation", () => {
  it("rejects invalid dates, non-positive IDs, missing crew and duplicate crew", () => {
    assert.throws(() => validateStepSubmit("start", { ...validStart, tripDate: "10/09/2026" }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, vehicleId: 0 }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, helpers: [] }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, loaders: ["A", "a"] }));
  });

  it("accepts a complete Step 1 payload", () => {
    assert.doesNotThrow(() => validateStepSubmit("start", validStart));
  });

  it("requires Step 2 address, bird type and a valid non-zero GPS location", () => {
    const validFarm = {
      sourceFarmId: 1,
      farmBirdTypeId: 2,
      farmAddress: "Farm Road",
      destMeter: 101,
      avgBirdWeight: 2.1,
      farmGpsLat: 17.385,
      farmGpsLon: 78.4867,
    };
    assert.doesNotThrow(() => validateStepSubmit("farm", validFarm));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmAddress: "  " }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmBirdTypeId: 0 }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmGpsLat: null }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmGpsLat: 0, farmGpsLon: 0 }));
  });

  it("requires positive shop and bird-type IDs on final Step 4 submission", () => {
    const delivery = {
      shopId: 1,
      birdTypeId: 2,
      birds: 10,
      weight: 20,
      mortality: 0,
      amount: 999999,
    };
    assert.doesNotThrow(() => validateStepSubmit("deliveries", { deliveries: [delivery] }));
    assert.throws(() => validateStepSubmit("deliveries", { deliveries: [{ ...delivery, shopId: 0 }] }));
    assert.throws(() => validateStepSubmit("deliveries", { deliveries: [{ ...delivery, birdTypeId: null }] }));
  });
});
