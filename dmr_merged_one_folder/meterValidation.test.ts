import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMeterInvalid, meterMustBeGreaterThan } from "./meterValidation";

describe("meterValidation", () => {
  it("flags values not strictly greater than previous meter", () => {
    assert.equal(isMeterInvalid(99, 100), true);
    assert.equal(isMeterInvalid(100, 100), true);
    assert.equal(isMeterInvalid(101, 100), false);
    assert.equal(meterMustBeGreaterThan(100), "Meter reading must be greater than 100.");
  });
});
