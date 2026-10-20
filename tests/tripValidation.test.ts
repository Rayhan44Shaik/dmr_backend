import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateStepSubmit } from "../src/validation/trips.js";
import { businessTodayDateOnly, shiftDateOnly } from "../src/utils/tripNumbering.js";
import { scopeTripStepBody } from "../src/services/tripsService.js";

const validStart = {
  tripDate: businessTodayDateOnly(),
  vehicleId: 1,
  driverId: 2,
  supervisorId: 3,
  helpers: ["Helper One"],
  loaders: ["Loader One"],
  openingMeter: 100,
};

describe("Trip step boundary validation", () => {
  it("isolates a Step 1 correction from stale farm and delivery fields", () => {
    const scoped = scopeTripStepBody("start", {
      ...validStart,
      advanceAmount: 5_000,
      mode: "submit",
      sourceFarmId: 999_999,
      farmBirdTypeId: 888_888,
      deliveries: [{ shopId: 77 } as never],
      boxDetails: [{ boxNo: 59 } as never],
    });

    assert.equal(scoped.advanceAmount, 5_000);
    assert.equal(scoped.mode, "submit");
    assert.equal("sourceFarmId" in scoped, false);
    assert.equal("farmBirdTypeId" in scoped, false);
    assert.equal("deliveries" in scoped, false);
    assert.equal("boxDetails" in scoped, false);
    assert.doesNotThrow(() => validateStepSubmit("start", scoped));
  });

  it("isolates a Step 3 pickup correction from existing Step 4 deliveries", () => {
    const scoped = scopeTripStepBody("pickup", {
      mode: "submit",
      legIndex: 1,
      pickupStepSubmitted: true,
      boxDetails: [{ boxNo: 1, birds: 10, weight: 19.8 }],
      dcPhotoKey: "pickup-photo-1",
      pickupPhotos: [{
        key: "pickup-photo-1",
        mime: "image/jpeg",
        data: "data:image/jpeg;base64,AA==",
      }],
      syncPickupPhotos: true,
      // A hydrated/older client may still include all saved deliveries. They
      // must remain untouched and must not be capacity-validated until Step 4.
      deliveries: [{
        id: 99,
        shopId: 7,
        birdTypeId: 3,
        birds: 10,
        weight: 20,
        selectedBoxIds: [1],
      } as never],
      deliveryStepSubmitted: true,
    });

    assert.equal(scoped.mode, "submit");
    assert.equal(scoped.legIndex, 1);
    assert.deepEqual(scoped.boxDetails, [{ boxNo: 1, birds: 10, weight: 19.8 }]);
    assert.equal(scoped.syncPickupPhotos, true);
    assert.deepEqual(scoped.pickupPhotos, [{
      key: "pickup-photo-1",
      mime: "image/jpeg",
      data: "data:image/jpeg;base64,AA==",
    }]);
    assert.equal("deliveries" in scoped, false);
    assert.equal("deliveryStepSubmitted" in scoped, false);
    assert.doesNotThrow(() => validateStepSubmit("pickup", scoped));
  });

  it("rejects invalid dates, non-positive IDs, missing crew and duplicate crew", () => {
    assert.throws(() => validateStepSubmit("start", { ...validStart, tripDate: "10/09/2026" }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, tripDate: "2026-02-30" }));
    assert.throws(() =>
      validateStepSubmit("start", {
        ...validStart,
        tripDate: shiftDateOnly(businessTodayDateOnly(), 30),
      })
    );
    assert.throws(() => validateStepSubmit("start", { ...validStart, vehicleId: 0 }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, helpers: [] }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, loaders: ["A", "a"] }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, openingMeter: undefined }));
    assert.throws(() => validateStepSubmit("start", { ...validStart, openingMeter: 0 }));
  });

  it("accepts a complete Step 1 payload with a selectable business date", () => {
    assert.doesNotThrow(() => validateStepSubmit("start", validStart));
    assert.doesNotThrow(() =>
      validateStepSubmit("start", {
        ...validStart,
        tripDate: shiftDateOnly(businessTodayDateOnly(), -30),
      })
    );
  });

  it("does not require any vehicle meter for a rented-vehicle trip", () => {
    assert.doesNotThrow(() =>
      validateStepSubmit("start", { ...validStart, isRentedVehicle: true, openingMeter: undefined })
    );
    assert.doesNotThrow(() =>
      validateStepSubmit("farm", {
        sourceFarmId: 1,
        farmBirdTypeId: 2,
        avgBirdWeight: 2.1,
        farmGpsLat: 17.385,
        farmGpsLon: 78.4867,
        isRentedVehicle: true,
      })
    );
    assert.doesNotThrow(() =>
      validateStepSubmit("expenses", { destinationTolls: 0, isRentedVehicle: true })
    );
  });

  it("allows an optional Step 2 address and requires bird type and a valid non-zero GPS location", () => {
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
    assert.doesNotThrow(() => validateStepSubmit("farm", { ...validFarm, farmAddress: "  " }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmBirdTypeId: 0 }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmGpsLat: null }));
    assert.throws(() => validateStepSubmit("farm", { ...validFarm, farmGpsLat: 0, farmGpsLon: 0 }));
  });

  it("validates Step 3 from pickup fields without requiring Step 2 fields again", () => {
    assert.doesNotThrow(() =>
      validateStepSubmit("pickup", {
        boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
        dcPhotoKey: "pickup-photo-1",
      })
    );
    assert.throws(() =>
      validateStepSubmit("pickup", {
        boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
        dcPhotoKey: "",
      })
    );
    assert.doesNotThrow(() =>
      validateStepSubmit("pickup", {
        boxDetails: [{ boxNo: 1, birds: 10, weight: 20 }],
        dcPhotoKey: "pickup-photo-readable",
        pickupPhotos: [{
          key: "pickup-photo-readable",
          mime: "image/jpeg",
          data: `data:image/webp;base64,${"A".repeat(68_000)}`,
        }],
      })
    );
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

  it("ignores pending [ORDER] plan stubs when submitting Step 4", () => {
    const captured = {
      shopId: 1,
      birdTypeId: 2,
      birds: 10,
      weight: 20,
      mortality: 0,
      amount: 100,
      autoCaptureTime: "2026-09-18T10:00:00+05:30",
    };
    const planStub = {
      shopId: 9,
      birdTypeId: null,
      birds: 12,
      weight: 200,
      mortality: 0,
      remarks: "[ORDER] O:TR-20260918-002",
    };
    assert.doesNotThrow(() =>
      validateStepSubmit("deliveries", { deliveries: [captured, planStub] })
    );
    assert.throws(() => validateStepSubmit("deliveries", { deliveries: [planStub] }));
  });

  it("allows Step 5 expenses submit without client endTime (server stamps it)", () => {
    assert.doesNotThrow(() =>
      validateStepSubmit("expenses", {
        endMeter: 204817,
        closingMeter: 204817,
        destinationTolls: 1,
        mode: "submit",
      })
    );
    assert.throws(() => validateStepSubmit("expenses", { destinationTolls: 1 }));
  });
});
