import assert from "node:assert/strict";
import test from "node:test";
import { mapApiTripToTrip, toStep2Payload } from "./tripHeaderApiService";
import { createEmptyTrip } from "../../../../shared/trip";

test("toStep2Payload sends only Step 2 fields, normalizes negative tolls, omits GPS until captured", () => {
  const payload = toStep2Payload({
    sourceFarmId: 4,
    sourceFarm: "Lakshmi",
    farmAddress: "Guntur Rural",
    destMeter: 50001,
    pickupTolls: -3,
    avgBirdWeight: 2.2,
    remarks: "note",
    farmStepSubmitted: false,
    reachedTime: "1999-01-01T00:00:00.000Z",
    farmCompletedTrips: 12,
    farmRate: 99,
    vehicleId: 1,
  } as any);
  assert.equal(payload.sourceFarmId, 4);
  assert.equal(payload.pickupTolls, 0);
  assert.equal(payload.destMeter, 50001);
  assert.equal("reachedTime" in payload, false);
  assert.equal("farmCompletedTrips" in payload, false);
  assert.equal("farmRate" in payload, false);
  assert.equal("vehicleId" in payload, false);
  assert.equal("farmGpsLat" in payload, false);
});

test("toStep2Payload includes GPS only after Get GPS values exist", () => {
  const payload = toStep2Payload({
    sourceFarmId: 1,
    destMeter: 10,
    pickupTolls: 0,
    farmGpsLat: 16.3,
    farmGpsLon: 80.4,
    farmGpsAccuracy: 8,
    farmGpsTime: "2026-08-17T10:00:00.000Z",
  });
  assert.equal(payload.farmGpsLat, 16.3);
  assert.equal(payload.farmGpsLon, 80.4);
  assert.equal(payload.farmGpsAccuracy, 8);
});

test("mapApiTripToTrip hydrates Step 2 GPS and does not invent 0/0 coordinates", () => {
  const mapped = mapApiTripToTrip({
    id: 2,
    tripNo: "TR-20260817-001",
    farmAddress: "From master",
    destMeter: 50001,
    pickupTolls: 0,
    farmGpsLat: null,
    farmGpsLon: null,
    farmStepSubmitted: true,
    reachedTime: "2026-08-17T12:00:00.000Z",
  });
  assert.equal(mapped.farmAddress, "From master");
  assert.equal(mapped.farmGpsLat, null);
  assert.equal(mapped.farmGpsLon, null);
  assert.equal(mapped.pickupTolls, 0);
  assert.equal(mapped.farmStepSubmitted, true);
});

test("toStep2Payload omits 0/0 GPS", () => {
  const payload = toStep2Payload({
    sourceFarmId: 1,
    destMeter: 10,
    pickupTolls: 0,
    farmGpsLat: 0,
    farmGpsLon: 0,
  });
  assert.equal("farmGpsLat" in payload, false);
  assert.equal("farmGpsLon" in payload, false);
});

test("empty destMeter and avgBirdWeight map to null in the Step 2 payload", () => {
  const payload = toStep2Payload(createEmptyTrip({ sourceFarmId: 1, destMeter: 0, avgBirdWeight: 0 }));
  assert.equal(payload.destMeter, null);
  assert.equal(payload.avgBirdWeight, null);
  assert.equal(payload.pickupTolls, 0);
});
