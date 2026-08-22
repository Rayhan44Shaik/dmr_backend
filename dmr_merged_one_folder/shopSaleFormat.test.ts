import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSaleAmount,
  formatSaleRate,
  formatSaleRemark,
  formatSaleWeight,
  shopSaleLockState,
  weekdayShort,
} from "./shopSaleFormat";

describe("weekdayShort", () => {
  it("returns the correct weekday for date-only strings", () => {
    assert.equal(weekdayShort("2026-08-20"), "Thu"); // a Thursday
    assert.equal(weekdayShort("2026-08-17"), "Mon"); // a Monday
    assert.equal(weekdayShort("2026-08-16"), "Sun"); // a Sunday
  });

  it("does not shift the weekday across UTC boundaries (parse-date-only safety)", () => {
    // "2026-08-20" parsed as UTC midnight must still be Thursday in any
    // timezone — the parser reconstructs with local calendar parts.
    assert.equal(weekdayShort("2026-01-01"), "Thu"); // New Year 2026
    assert.equal(weekdayShort("2026-12-31"), "Thu");
  });

  it("accepts Date objects and tolerates garbage", () => {
    assert.equal(weekdayShort(new Date(2026, 7, 20)), "Thu");
    assert.equal(weekdayShort("not-a-date"), "—");
  });
});

describe("formats", () => {
  it("weight uses two decimals", () => {
    assert.equal(formatSaleWeight(53.3), "53.30");
    assert.equal(formatSaleWeight(53.301), "53.30");
  });

  it("rate is ₹100.00 style", () => {
    assert.equal(formatSaleRate(100), "₹100.00");
    assert.equal(formatSaleRate(105.5), "₹105.50");
    assert.equal(formatSaleRate(null), "₹0.00");
  });

  it("amount uses en-IN grouping", () => {
    assert.equal(formatSaleAmount(5330), "₹5,330");
    assert.equal(formatSaleAmount(5330.5), "₹5,330.5");
    assert.equal(formatSaleAmount(15351), "₹15,351");
  });

  it("remark falls back to a dash", () => {
    assert.equal(formatSaleRemark("Urgent"), "Urgent");
    assert.equal(formatSaleRemark("  "), "-");
    assert.equal(formatSaleRemark(undefined), "-");
    assert.equal(formatSaleRemark(null), "-");
  });
});

describe("shopSaleLockState", () => {
  it("editable when the backend says editable", () => {
    const state = shopSaleLockState({ editable: true, lockReason: null, tripDeleted: false, correctionWindowExpired: false });
    assert.equal(state.editable, true);
    assert.equal(state.label, "Edit");
  });

  it("never authorizes an edit the backend did not allow", () => {
    // Even if nothing else looks wrong, the backend flag is the authority.
    const state = shopSaleLockState({ editable: false, lockReason: null, tripDeleted: false, correctionWindowExpired: false });
    assert.equal(state.editable, false);
    assert.equal(state.label, "Locked");
  });

  it("deleted-trip sales are locked with a historical message", () => {
    const state = shopSaleLockState({ editable: false, lockReason: "Original trip no longer exists.", tripDeleted: true, correctionWindowExpired: false });
    assert.equal(state.editable, false);
    assert.match(state.message, /Trip no longer exists/);
    assert.match(state.message, /read-only/);
  });

  it("expired-window sales are locked with the 10-day message", () => {
    const state = shopSaleLockState({ editable: false, lockReason: "Editing period has expired.", tripDeleted: false, correctionWindowExpired: true });
    assert.equal(state.editable, false);
    assert.match(state.message, /Edit window expired/);
  });

  it("falls back to the backend lock reason when present", () => {
    const state = shopSaleLockState({ editable: false, lockReason: "This Shop Sale has been deleted.", tripDeleted: false, correctionWindowExpired: false });
    assert.match(state.message, /has been deleted/);
  });
});