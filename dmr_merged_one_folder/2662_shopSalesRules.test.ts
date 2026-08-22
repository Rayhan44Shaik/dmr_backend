import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { redistributeShopAllocations } from "../shopSalesRules.js";

describe("Shop Sales deterministic redistribution", () => {
  test("increase takes birds from the last eligible shop by delivery id", () => {
    const rows = [
      { id: 1, shopId: 10, birds: 60, weight: 120, mortality: 0, mortKg: 0 },
      { id: 2, shopId: 11, birds: 38, weight: 76, mortality: 0, mortKg: 0 },
      { id: 3, shopId: null, birds: 0, weight: 0, mortality: 2, mortKg: 4 },
    ];
    const next = redistributeShopAllocations(rows, 1, 62, 124);
    assert.equal(next.find((r) => r.id === 1)?.birds, 62);
    assert.equal(next.find((r) => r.id === 2)?.birds, 36);
    assert.equal(next.find((r) => r.id === 3)?.mortality, 2);
    assert.equal(next.reduce((s, r) => s + r.birds + r.mortality, 0), 100);
  });

  test("decrease gives released birds to the last eligible shop", () => {
    const rows = [
      { id: 1, shopId: 10, birds: 60, weight: 120, mortality: 0, mortKg: 0 },
      { id: 2, shopId: 11, birds: 38, weight: 76, mortality: 0, mortKg: 0 },
    ];
    const next = redistributeShopAllocations(rows, 1, 50, 100);
    assert.equal(next.find((r) => r.id === 1)?.birds, 50);
    assert.equal(next.find((r) => r.id === 2)?.birds, 48);
  });
});
