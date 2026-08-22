import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapApiSaleToShopSale, type ApiShopSale } from "./shopSaleMapping";

function row(overrides: Partial<ApiShopSale> = {}): ApiShopSale {
  return {
    id: 42,
    saleNo: "TR-20260820-001-S002",
    saleDate: "2026-08-20",
    shopId: 7,
    shopName: "Maahirah",
    birdTypeId: 3,
    birdType: "Broiler",
    tripId: 9,
    tripNo: "TR-20260820-001",
    shopNo: "S02",
    vehicleNo: "KA-01-1234",
    farmName: "Farm A",
    birds: 58,
    weight: 58.0,
    rate: 100,
    amount: 5800,
    mortality: 0,
    remarks: "Urgent delivery",
    status: "Approved",
    deleted: false,
    deletedReason: null,
    tripDeleted: false,
    editable: true,
    lockReason: null,
    windowExpiresAt: "2026-08-30",
    approvedBy: null,
    approvedAt: null,
    createdAt: null,
    updatedAt: null,
    rateCompleted: true,
    rateLockedAt: "2026-08-20T10:00:00.000Z",
    rateLockedBy: "user-1",
    correctionWindowExpired: false,
    correctionWindowClosesAt: "2026-08-30",
    ...overrides,
  };
}

describe("mapApiSaleToShopSale", () => {
  it("maps the backend Shop Sales number verbatim", () => {
    const mapped = mapApiSaleToShopSale(row());
    assert.equal(mapped.saleNo, "TR-20260820-001-S002");
  });

  it("keeps backend date, weight, rate and amount untouched", () => {
    const mapped = mapApiSaleToShopSale(row());
    assert.equal(mapped.tripDate, "2026-08-20");
    assert.equal(mapped.totalWeight, 58.0);
    assert.equal(mapped.rate, 100);
    assert.equal(mapped.amount, 5800);
    assert.equal(mapped.totalBirds, 58);
    assert.equal(mapped.remark, "Urgent delivery");
  });

  it("carries the numeric ids additively", () => {
    const mapped = mapApiSaleToShopSale(row());
    assert.equal(mapped.numericId, 42);
    assert.equal(mapped.numericTripId, 9);
    assert.equal(mapped.numericShopId, 7);
  });

  it("maps editable + tripDeleted + lockReason", () => {
    const editable = mapApiSaleToShopSale(row());
    assert.equal(editable.editable, true);
    assert.equal(editable.tripDeleted, false);
    assert.equal(editable.lockReason, null);

    const locked = mapApiSaleToShopSale(
      row({ editable: false, tripDeleted: true, lockReason: "Original trip no longer exists." })
    );
    assert.equal(locked.editable, false);
    assert.equal(locked.tripDeleted, true);
    assert.equal(locked.lockReason, "Original trip no longer exists.");
  });

  it("maps expired correction window state", () => {
    const mapped = mapApiSaleToShopSale(row({ correctionWindowExpired: true }));
    assert.equal(mapped.correctionWindowExpired, true);
  });

  it("tolerates missing saleNo instead of crashing", () => {
    const mapped = mapApiSaleToShopSale(row({ saleNo: "" }));
    assert.equal(mapped.saleNo, "");
  });
});