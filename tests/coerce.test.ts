import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoOrNull } from "../src/utils/coerce.js";

describe("isoOrNull", () => {
  it("keeps Date milliseconds and never emits a locale timezone string", () => {
    const d = new Date("2026-11-01T11:32:19.239Z");
    assert.equal(isoOrNull(d), "2026-11-01T11:32:19.239Z");
    assert.equal(isoOrNull(d)?.includes("GMT"), false);
  });

  it("accepts a Windows locale Date.toString() form that PostgreSQL rejects", () => {
    const locale = "Sun Nov 01 2026 17:02:19 GMT+0530 (India Standard Time)";
    const iso = isoOrNull(locale);
    assert.ok(iso);
    assert.match(iso!, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(iso!.includes("GMT"), false);
  });

  it("returns null for empty and invalid values instead of throwing", () => {
    assert.equal(isoOrNull(null), null);
    assert.equal(isoOrNull(""), null);
    assert.equal(isoOrNull("not a date"), null);
    assert.equal(isoOrNull(new Date("Invalid Date")), null);
  });
});
