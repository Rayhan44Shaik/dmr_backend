import assert from "node:assert/strict";
import test from "node:test";
import {
  DELIVERY_WEIGHT_TOLERANCE_KG,
  getDeliveriesBalanceError,
  validateDeliveriesStep,
} from "./validation";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
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
    remarks: "",
    ...overrides,
  };
}

function trip(overrides: Record<string, unknown> = {}) {
  return { dcWeight: 1000, totalBirds: 56, ...overrides };
}

// ─── Bird equality (56 = 54 + 2) ──────────────────────────────────
test("Step 4 bird validation: exact equality required (56 = 54 + 2)", () => {
  assert.equal(validateDeliveriesStep(trip(), [row({ birds: 54, mortality: 2 })]).valid, true);
});

test("Step 4 bird validation: missing birds fails (56 vs 27 + 0)", () => {
  const result = validateDeliveriesStep(trip(), [row({ birds: 27, mortality: 0 })]);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Bird count mismatch: Pickup \(56\) must equal Delivered \(27\) \+ Mortality \(0\) = 27/);
});

test("Step 4 bird validation: 56 = 55 + 1 passes", () => {
  assert.equal(validateDeliveriesStep(trip(), [row({ birds: 55, mortality: 1 })]).valid, true);
});

test("Step 4 bird validation: mortality missing fails (56 vs 55 + 0)", () => {
  assert.equal(validateDeliveriesStep(trip(), [row({ birds: 55, mortality: 0 })]).valid, false);
});

test("Step 4 bird validation: 56 = 56 + 0 passes", () => {
  assert.equal(validateDeliveriesStep(trip(), [row({ birds: 56, mortality: 0 })]).valid, true);
});

test("Step 4 bird validation: mortality KG never enters the bird equation (2.159 is weight)", () => {
  // The reported production bug: Trip Birds 56 vs Delivered 54 + Mortality
  // 2.159. Mortality of 2 BIRDS (2.159 KG) must balance exactly.
  const result = validateDeliveriesStep(
    trip({ dcWeight: 1085.44 }),
    [row({ birds: 54, weight: 1000, mortality: 2, mortKg: 2.159 })]
  );
  assert.equal(result.valid, true);
  const balance = getDeliveriesBalanceError(trip({ dcWeight: 1085.44 }), [
    row({ birds: 54, weight: 1000, mortality: 2, mortKg: 2.159 }),
  ]);
  assert.equal(balance, null);
});

// ─── Weight reconciliation (farm = delivered + mortality + loss) ──
test("Step 4 weight: 1000 = 950 + 45 + 5 passes", () => {
  assert.equal(
    validateDeliveriesStep(trip({ totalBirds: 56 }), [
      row({ birds: 56, weight: 950, mortality: 0, mortKg: 45 }),
    ]).valid,
    true
  );
});

test("Step 4 weight: farm 1000 vs delivered 950 + mortality 45 + loss 5 = 1000 passes", () => {
  assert.equal(
    validateDeliveriesStep(trip({ totalBirds: 56 }), [
      row({ birds: 56, weight: 950, mortality: 0, mortKg: 45 }),
    ]).valid,
    true
  );
});

test("Step 4 weight: mismatch fails and reports expected total", () => {
  const result = validateDeliveriesStep(trip({ totalBirds: 56 }), [
    row({ birds: 56, weight: 970, mortality: 0, mortKg: 45 }),
  ]);
  assert.equal(result.valid, false);
  const balance = getDeliveriesBalanceError(trip({ totalBirds: 56 }), [
    row({ birds: 56, weight: 970, mortality: 0, mortKg: 45 }),
  ]);
  assert.ok(balance?.weight);
  assert.equal(balance!.weight!.farm, 1000);
  assert.equal(balance!.weight!.delivered, 970);
  assert.equal(balance!.weight!.mortalityWeight, 45);
  assert.equal(balance!.weight!.expected, 1015);
});

test("Step 4 weight: tolerance of 0.05 kg absorbs rounding", () => {
  const withinTolerance = validateDeliveriesStep(
    trip({ totalBirds: 56 }),
    [row({ birds: 56, weight: 950, mortality: 0, mortKg: 45.03 })]
  );
  assert.equal(withinTolerance.valid, true);
  assert.equal(DELIVERY_WEIGHT_TOLERANCE_KG, 0.05);
});

test("Step 4 balance error: birds and weight are reported independently", () => {
  const balance = getDeliveriesBalanceError(trip(), [
    row({ birds: 27, weight: 970, mortality: 0, mortKg: 45 }),
  ]);
  assert.ok(balance?.birds);
  assert.ok(balance?.weight);
  assert.deepEqual(balance!.birds, { pickup: 56, delivered: 27, mortality: 0 });
});

test("Step 4 balance error: empty rows are an add-shops error, not a mismatch", () => {
  const result = validateDeliveriesStep(trip(), []);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /add at least one shop delivery/);
});

test("Step 4 balance error: full balance is null", () => {
  const balance = getDeliveriesBalanceError(trip({ totalBirds: 56 }), [
    row({ birds: 54, weight: 950, mortality: 2, mortKg: 45 }),
  ]);
  assert.equal(balance, null);
});