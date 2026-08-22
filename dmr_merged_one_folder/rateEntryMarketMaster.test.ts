import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDays,
  expectedMarketWindowDates,
  formatBusinessDate,
  formatMasterValue,
  sizeCategoryHeaders,
  sizeColumnLabel,
  type RateEntryMarketRateMasterDto,
} from "./rateEntryMarketMaster";

describe("Rate Entry market-rate master display", () => {
  it("TEST 1 / 8: trip date 2026-08-14 yields 13/14/15, not today", () => {
    assert.deepEqual(expectedMarketWindowDates("2026-08-14"), [
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    assert.deepEqual(expectedMarketWindowDates("2026-08-11"), [
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
    assert.equal(addCalendarDays("2026-08-14", -1), "2026-08-13");
  });

  it("does not emit ISO timestamps", () => {
    assert.equal(formatBusinessDate("2026-08-13T00:00:00.000Z"), "2026-08-13");
    assert.equal(formatBusinessDate("2026-08-14"), "2026-08-14");
  });

  it("TEST 6 / 7: missing is Not entered; actual 0 stays 0.00", () => {
    assert.equal(formatMasterValue(false, null), "Not entered");
    assert.equal(formatMasterValue(true, null), "Not entered");
    assert.equal(formatMasterValue(true, 0), "0.00");
    assert.equal(formatMasterValue(true, 122), "122.00");
  });

  it("TEST 4 / 5: size headers come from master keys, none dropped", () => {
    const master: RateEntryMarketRateMasterDto = {
      tripDate: "2026-08-14",
      fromDate: "2026-08-13",
      toDate: "2026-08-15",
      additionalMetrics: [],
      companyRates: [],
      sizeCategoryBreakdown: [
        { date: "2026-08-13", entered: true, columns: { c17: 1, c15: 2, c13: 3, c12: 4, c10: 5 } },
      ],
      sizeColumnKeys: ["c17", "c15", "c13", "c12", "c10"],
    };
    assert.deepEqual(sizeCategoryHeaders(master), ["c17", "c15", "c13", "c12", "c10"]);
    assert.equal(sizeColumnLabel("c17"), "17");
    assert.equal(sizeColumnLabel("c10"), "10");
  });
});
