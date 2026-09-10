import assert from "node:assert/strict";
import test from "node:test";
import { isValidDateOnly } from "../dist/utils/dateValidation.js";
import { emiCreateSchema, emiPaySchema } from "../dist/validation/emi.js";
import { fleetMaintenanceBodySchema } from "../dist/validation/fleet.js";
import { permitBodySchema } from "../dist/validation/permits.js";

const impossibleDates = ["2026-09-31", "2025-02-29", "2026-04-31", "2026-13-01"];

test("date-only validator accepts real month ends and leap day", () => {
  for (const value of ["2026-01-31", "2024-02-29", "2026-04-30", "2026-12-31"]) {
    assert.equal(isValidDateOnly(value), true, value);
  }
});

test("vehicle operations schemas reject impossible calendar dates", () => {
  for (const date of impossibleDates) {
    assert.equal(isValidDateOnly(date), false, date);
    assert.equal(emiCreateSchema.safeParse({ vehicleId: 1, financeCompany: "Bank", loanAmount: 100, totalEMIs: 2, startDate: date }).success, false);
    assert.equal(fleetMaintenanceBodySchema.safeParse({ date, vehicleId: 1, currentKM: 1, maintenanceType: "Service", serviceType: "Routine" }).success, false);
    assert.equal(permitBodySchema.safeParse({ expiryDate: date }).success, false);
  }
});

test("EMI payment requires a UUID idempotency key", () => {
  assert.equal(emiPaySchema.safeParse({}).success, false);
  assert.equal(emiPaySchema.safeParse({ idempotencyKey: "not-a-uuid" }).success, false);
  assert.equal(emiPaySchema.safeParse({ idempotencyKey: "3d813cbb-47fb-4d2f-8f3f-50f48346b529" }).success, true);
});
