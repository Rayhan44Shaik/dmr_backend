import assert from "node:assert/strict";
import test from "node:test";
import { computeDeliveryKpiTotals } from "./deliveryKpis";
import { computeRemainingBoxes, pendingBoxesFromRows } from "./remainingBoxes";
import {
  computeValidationErrors,
  validationIsValid,
  EMPTY_DELIVERY_FORM,
} from "./useShopDeliveryForm";
import type { ShopDelivery, BoxDetail } from "../../types/trip";

function box(boxNo: number, birds: number, weight: number): BoxDetail {
  return { boxNo, birds, weight, avgWeight: birds > 0 ? weight / birds : null } as BoxDetail;
}

function row(overrides: Record<string, unknown> = {}): ShopDelivery {
  return {
    id: Date.now() + Math.random(),
    serialNo: 1,
    shopId: 1,
    shopName: "Shop",
    birdTypeId: 1,
    birdType: "Broiler",
    boxNo: 1,
    birds: 0,
    weight: 0,
    mortality: 0,
    rate: 0,
    amount: 0,
    ...overrides,
  } as ShopDelivery;
}

// ─── Live KPI totals ──────────────────────────────────────────────
test("KPI totals are LIVE from current rows and keep bird/weight units separate", () => {
  const rows = [
    row({ shopId: 1, birds: 54, weight: 950, mortality: 2, mortKg: 2.159, autoCaptureTime: "10:00" }),
    row({ shopId: 2, birds: 2, weight: 48, mortality: 0, mortKg: 0, autoCaptureTime: "11:00" }),
  ];
  const kpi = computeDeliveryKpiTotals(rows);
  assert.equal(kpi.shops, 2);
  assert.equal(kpi.birds, 56);
  assert.equal(kpi.weight, 998);
  // Mortality is a BIRD COUNT (2), never the 2.159 kg weight.
  assert.equal(kpi.mortality, 2);
  assert.equal(kpi.mortKg, 2.159);
  assert.equal(kpi.lastCaptureTime, "11:00");
});

test("KPI totals ignore in-progress rows without shop/birds/weight", () => {
  const rows = [
    row({ shopId: 0, birds: 50, weight: 900, mortality: 0 }),
    row({ shopId: 1, birds: 0, weight: 0, mortality: 0 }),
    row({ shopId: 1, birds: 56, weight: 1000, mortality: 0 }),
  ];
  const kpi = computeDeliveryKpiTotals(rows);
  assert.equal(kpi.shops, 1);
  assert.equal(kpi.birds, 56);
});

// ─── Remaining boxes: multi-box rows must consume the WHOLE box ───
test("remaining boxes: box-mode multi-box row consumes every selected box fully", () => {
  const boxes = [box(1, 30, 500), box(2, 26, 480), box(3, 28, 510)];
  const rows = [row({ birds: 56, weight: 980, selectedBoxIds: [1, 2], perBoxData: [] })];
  const used = computeRemainingBoxes(boxes, rows);
  assert.equal(used.get(1)?.birds, Number.MAX_SAFE_INTEGER);
  assert.equal(used.get(2)?.birds, Number.MAX_SAFE_INTEGER);
  const pending = pendingBoxesFromRows(boxes, rows);
  assert.deepEqual(pending.map((b) => b.boxNo), [3]);
  assert.equal(pending[0].birds, 28);
  assert.equal(pending[0].weight, 510);
});

test("remaining boxes: box-mode single-box row consumes birds + mortality", () => {
  const boxes = [box(1, 30, 500), box(2, 26, 480)];
  const rows = [row({ birds: 29, weight: 490, mortality: 1, mortKg: 10, selectedBoxIds: [1] })];
  const pending = pendingBoxesFromRows(boxes, rows);
  assert.deepEqual(pending.map((b) => b.boxNo), [2]);
  assert.equal(pending[0].birds, 26);
});

test("remaining boxes: weight-mode per-box data consumes exact split", () => {
  const boxes = [box(1, 30, 500), box(2, 26, 480)];
  const rows = [
    row({
      birds: 27,
      weight: 460,
      selectedBoxIds: [1, 2],
      perBoxData: [
        { boxNo: 1, birds: 12, weight: 200 },
        { boxNo: 2, birds: 15, weight: 260 },
      ],
    }),
  ];
  const pending = pendingBoxesFromRows(boxes, rows);
  assert.deepEqual(pending.map((b) => b.boxNo), [1, 2]);
  assert.equal(pending[0].birds, 18);
  assert.equal(pending[1].birds, 11);
});

test("remaining boxes: editing row is excluded from consumption", () => {
  const boxes = [box(1, 30, 500)];
  const rows = [row({ id: 99, birds: 30, weight: 500, selectedBoxIds: [1] })];
  const pendingExcluded = pendingBoxesFromRows(boxes, rows, { excludeRowId: 99 });
  assert.deepEqual(pendingExcluded.map((b) => b.boxNo), [1]);
  const pendingIncluded = pendingBoxesFromRows(boxes, rows);
  assert.deepEqual(pendingIncluded.map((b) => b.boxNo), []);
});

// ─── Derived weight-mode validation (farm weight 29) ─────────────────
// 30 invalid → 28.5 valid → 29.5 invalid → 28 valid, with NO stale state.
function weightModeValidation(farmWeight: number, enteredWeight: number, farmBirds = 29) {
  const formData = {
    ...EMPTY_DELIVERY_FORM,
    selectedBoxIds: [1],
    mortality: 0,
    mortWeight: 0,
    perBoxData: [{ boxNo: 1, birds: farmBirds, weight: enteredWeight }],
  };
  return computeValidationErrors({
    mode: "weight",
    formData,
    farmBirds,
    farmWeight,
    weightModeTotals: { birds: farmBirds, weight: enteredWeight },
    mortKg: 0,
    availableBoxDetails: [{ boxNo: 1, birds: farmBirds, weight: farmWeight }],
  });
}

test("weight mode: over farm weight is invalid; correction becomes valid immediately (no stale state)", () => {
  const over = weightModeValidation(29, 30);
  assert.equal(over.weightExceedFarm, true);
  assert.equal(validationIsValid(over), false);

  const ok285 = weightModeValidation(29, 28.5);
  assert.equal(ok285.weightExceedFarm, false);
  assert.equal(validationIsValid(ok285), true);

  const over295 = weightModeValidation(29, 29.5);
  assert.equal(over295.weightExceedFarm, true);
  assert.equal(validationIsValid(over295), false);

  const ok28 = weightModeValidation(29, 28);
  assert.equal(ok28.weightExceedFarm, false);
  assert.equal(validationIsValid(ok28), true);
});

test("weight mode: per-box weight cannot exceed that box's remaining weight", () => {
  const perBoxOver = computeValidationErrors({
    mode: "weight",
    formData: {
      ...EMPTY_DELIVERY_FORM,
      selectedBoxIds: [1, 2],
      perBoxData: [
        { boxNo: 1, birds: 12, weight: 210 },
        { boxNo: 2, birds: 14, weight: 200 },
      ],
    },
    farmBirds: 26,
    farmWeight: 400,
    weightModeTotals: { birds: 26, weight: 410 },
    mortKg: 0,
    availableBoxDetails: [
      { boxNo: 1, birds: 12, weight: 200 },
      { boxNo: 2, birds: 14, weight: 200 },
    ],
  });
  assert.deepEqual(perBoxOver.perBoxWeightErrors, [true, false]);
  assert.equal(validationIsValid(perBoxOver), false);
});

test("box mode: mortality cannot exceed farm birds of the selected boxes", () => {
  const tooMany = computeValidationErrors({
    mode: "box",
    formData: { ...EMPTY_DELIVERY_FORM, selectedBoxIds: [1], mortality: 31 },
    farmBirds: 30,
    farmWeight: 500,
    weightModeTotals: { birds: 0, weight: 0 },
    mortKg: 0,
    availableBoxDetails: [{ boxNo: 1, birds: 30, weight: 500 }],
  });
  assert.equal(tooMany.birdsExceed, true);
  assert.equal(validationIsValid(tooMany), false);

  const fine = computeValidationErrors({
    mode: "box",
    formData: { ...EMPTY_DELIVERY_FORM, selectedBoxIds: [1], mortality: 1 },
    farmBirds: 30,
    farmWeight: 500,
    weightModeTotals: { birds: 0, weight: 0 },
    mortKg: 0,
    availableBoxDetails: [{ boxNo: 1, birds: 30, weight: 500 }],
  });
  assert.equal(fine.birdsExceed, false);
  assert.equal(validationIsValid(fine), true);
});

test("weight mode: delivered + mortality birds must match farm birds exactly", () => {
  const mismatch = computeValidationErrors({
    mode: "weight",
    formData: {
      ...EMPTY_DELIVERY_FORM,
      selectedBoxIds: [1],
      mortality: 0,
      perBoxData: [{ boxNo: 1, birds: 28, weight: 500 }],
    },
    farmBirds: 29,
    farmWeight: 500,
    weightModeTotals: { birds: 28, weight: 500 },
    mortKg: 0,
    availableBoxDetails: [{ boxNo: 1, birds: 29, weight: 500 }],
  });
  assert.equal(mismatch.birdsMismatch, true);
  assert.equal(validationIsValid(mismatch), false);
});