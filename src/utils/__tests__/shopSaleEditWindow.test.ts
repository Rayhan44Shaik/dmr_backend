import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isShopSaleWindowOpen,
  shopSaleEditExpiresAt,
  SHOP_SALE_EDIT_WINDOW_DAYS,
} from "../shopSaleEditWindow.js";

const DAY = 24 * 60 * 60 * 1000;

describe("shopSaleEditWindow", () => {
  test("window is 14 days from entering Shop Sales", () => {
    assert.equal(SHOP_SALE_EDIT_WINDOW_DAYS, 14);
    const inserted = new Date("2026-10-18T08:00:00.000Z");
    const expires = shopSaleEditExpiresAt(inserted);
    assert.equal(expires?.toISOString(), "2026-11-01T08:00:00.000Z");
  });

  test("13 days after entering Shop Sales is still open", () => {
    const inserted = new Date("2026-10-18T08:00:00.000Z");
    const now = new Date("2026-10-31T08:00:00.000Z");
    assert.equal(isShopSaleWindowOpen(inserted, now), true);
  });

  test("exactly 14 days after entering Shop Sales is closed", () => {
    const inserted = new Date("2026-10-18T08:00:00.000Z");
    const now = new Date("2026-11-01T08:00:00.000Z");
    assert.equal(isShopSaleWindowOpen(inserted, now), false);
  });

  test("does not use a later trip date as the anchor", () => {
    const inserted = new Date(Date.now() - 15 * DAY);
    assert.equal(isShopSaleWindowOpen(inserted), false);
    assert.equal(isShopSaleWindowOpen(new Date()), true);
  });
});
