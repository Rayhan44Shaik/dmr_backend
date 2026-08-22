import assert from "node:assert/strict";
import test from "node:test";
import { mapApiTripToTrip, toStep3Payload } from "./tripHeaderApiService";

test("toStep3Payload omits client totals, pickup time, and submit flags", () => {
  const payload = toStep3Payload({
    boxDetails: [{ boxNo: 1, birds: 10, weight: 21, avgWeight: 2.1 }],
    totalBirds: 99,
    dcWeight: 99,
    pickupLoadTime: "1999-01-01T00:00:00.000Z",
    pickupStepSubmitted: true,
    dcPhotoKey: "p1",
    dcPhotoData: "data:image/png;base64,aaa",
    syncPickupPhotos: true,
  } as any);
  assert.deepEqual(payload.boxDetails, [{ boxNo: 1, birds: 10, weight: 21 }]);
  assert.equal("pickupLoadTime" in payload, false);
  assert.equal("pickupStepSubmitted" in payload, false);
  assert.equal("totalBirds" in payload, false);
  assert.equal(payload.syncPickupPhotos, true);
  assert.equal(payload.dcPhotoKey, "p1");
});

test("toStep3Payload omits empty boxes so a partial save cannot wipe rows", () => {
  const payload = toStep3Payload({ boxDetails: [] });
  assert.equal("boxDetails" in payload, false);
});

test("mapApiTripToTrip hydrates Step 3 boxes, photos, KPI, and capacity", () => {
  const mapped = mapApiTripToTrip({
    id: 9,
    tripNo: "TR-20260817-001",
    boxDetails: [{ boxNo: 1, birds: 10, weight: 21, avgWeight: 2.1 }],
    totalBirds: 10,
    dcWeight: 21,
    avgWeight: 2.1,
    boxes: 1,
    pickupLoadTime: "2026-08-17T12:00:00.000Z",
    pickupStepSubmitted: true,
    dcPhotoData: "data:image/png;base64,xx",
    dcPhotoData2: null,
    vehicleBoxCapacity: 4,
  });
  assert.equal(mapped.boxDetails[0].avgWeight, 2.1);
  assert.equal(mapped.vehicleBoxCapacity, 4);
  assert.equal(mapped.pickupStepSubmitted, true);
  assert.ok(mapped.pickupLoadTime);
  assert.equal(mapped.dcPhotoData, "data:image/png;base64,xx");
});
