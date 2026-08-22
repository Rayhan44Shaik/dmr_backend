import assert from "node:assert/strict";
import test from "node:test";
import { mapApiTripToTrip, toStep1Payload } from "./tripHeaderApiService";
import { createEmptyTrip } from "../../../../shared/trip";

test("toStep1Payload keeps explicit 0 and sends empty as null, without startTime or tripNo", () => {
  const payload = toStep1Payload({
    tripDate: "2026-08-17",
    vehicleId: 1,
    vehicleNo: "V1",
    driverId: 2,
    driverName: "D",
    supervisorId: 3,
    supervisorName: "S",
    helpers: ["H"],
    loaders: ["L"],
    openingMeter: 0,
    advanceAmount: 0,
    tripNo: "TR-FAKE",
    startTime: "1999-01-01T00:00:00.000Z",
    startStepSubmitted: true,
  });
  assert.equal(payload.openingMeter, 0);
  assert.equal(payload.advanceAmount, 0);
  assert.equal("startTime" in payload, false);
  assert.equal("tripNo" in payload, false);

  const empty = toStep1Payload({
    ...createEmptyTrip({ tripDate: "2026-08-17" }),
    openingMeter: null,
    advanceAmount: null,
  });
  assert.equal(empty.openingMeter, null);
  assert.equal(empty.advanceAmount, null);
});

test("mapApiTripToTrip preserves null KM/Advance instead of coercing to 0", () => {
  const mapped = mapApiTripToTrip({
    id: 9,
    tripNo: "TR-20260817-001",
    tripDate: "2026-08-17",
    openingMeter: null,
    advanceAmount: null,
    startStepSubmitted: true,
    startTime: "2026-08-17T10:00:00.000Z",
  });
  assert.equal(mapped.openingMeter, null);
  assert.equal(mapped.advanceAmount, null);
  assert.equal(mapped.startStepSubmitted, true);
});
