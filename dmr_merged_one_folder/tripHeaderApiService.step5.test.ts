import assert from "node:assert/strict";
import test from "node:test";
import { formatStartTimeForDisplay, mapApiTripToTrip, toStep5Payload } from "./tripHeaderApiService";

test("toStep5Payload sends expenses only — no vehicle, advance, diesel, or timestamps", () => {
  const payload = toStep5Payload({
    vehicleNo: "AP16",
    advanceAmount: 2000,
    dieselLtr1: 10,
    submittedAtTimestamp: "browser",
    endTime: "browser",
    meals: 500,
    loading: 0,
    othersRC: 0,
    endMeter: 50400,
    destinationTolls: 0,
    remarks: "ok",
  } as any);
  assert.equal("vehicleNo" in payload, false);
  assert.equal("advanceAmount" in payload, false);
  assert.equal("dieselLtr1" in payload, false);
  assert.equal("submittedAtTimestamp" in payload, false);
  assert.equal("endTime" in payload, false);
  assert.equal(payload.meals, 500);
  assert.equal("loading" in payload, false);
  assert.equal("othersRC" in payload, false);
  assert.equal(payload.endMeter, 50400);
  assert.equal(payload.destinationTolls, 0);
});

test("View maps Step 5 submitted timestamps with the same formatter as Step 1–3", () => {
  const iso = "2026-12-08T17:31:08.000Z";
  const mapped = mapApiTripToTrip({
    id: 1,
    startTime: iso,
    endTime: iso,
    expensesStepSubmittedAt: iso,
    submittedAtTimestamp: iso,
    dieselEntries: [{ rowIndex: 1, submittedAt: iso }],
    dieselSubmittedAt1: iso,
  });
  const formatted = formatStartTimeForDisplay(iso);
  assert.equal(mapped.startTime, formatted);
  assert.equal(mapped.endTime, formatted);
  assert.equal(mapped.expensesStepSubmittedAt, formatted);
  assert.equal(mapped.submittedAtTimestamp, formatted);
  assert.equal(mapped.dieselEntries?.[0]?.submittedAt, formatted);
  assert.equal((mapped as any).dieselSubmittedAt1, formatted);
  assert.equal(String(mapped.expensesStepSubmittedAt).includes("T"), false);
});
