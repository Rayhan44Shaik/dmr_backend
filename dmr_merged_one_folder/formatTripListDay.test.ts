import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTripListDay, formatTripRecentDateWithDay } from "./formatTripListDay";

describe("formatTripListDay", () => {
  it("maps each weekday from the stored trip date", () => {
    assert.equal(formatTripListDay("2026-08-17"), "Mon");
    assert.equal(formatTripListDay("2026-08-18"), "Tue");
    assert.equal(formatTripListDay("2026-08-19"), "Wed");
    assert.equal(formatTripListDay("2026-08-20"), "Thu");
    assert.equal(formatTripListDay("2026-08-21"), "Fri");
    assert.equal(formatTripListDay("2026-08-22"), "Sat");
    assert.equal(formatTripListDay("2026-08-23"), "Sun");
  });

  it("does not crash on invalid or missing dates", () => {
    assert.equal(formatTripListDay(undefined), "—");
    assert.equal(formatTripListDay(null), "—");
    assert.equal(formatTripListDay(""), "—");
    assert.equal(formatTripListDay("   "), "—");
    assert.equal(formatTripListDay("not-a-date"), "—");
    assert.equal(formatTripListDay("2026-13-40"), "—");
  });

  it("formats Recent Trips as weekday only", () => {
    assert.equal(formatTripRecentDateWithDay("2026-08-19"), "Wednesday");
    assert.equal(formatTripRecentDateWithDay("2026-08-20"), "Thursday");
    assert.equal(formatTripRecentDateWithDay("2026-08-21"), "Friday");
  });
});
