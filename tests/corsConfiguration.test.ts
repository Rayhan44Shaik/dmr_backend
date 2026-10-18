import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCorsOrigins } from "../src/config/env.js";

describe("CORS configuration", () => {
  it("normalizes one or multiple explicit origins", () => {
    assert.deepEqual(parseCorsOrigins(" https://one.example "), ["https://one.example"]);
    assert.deepEqual(parseCorsOrigins("https://one.example, http://localhost:5173"), [
      "https://one.example", "http://localhost:5173",
    ]);
  });

  it("rejects wildcard, empty, and invalid credentialed origins at startup", () => {
    assert.throws(() => parseCorsOrigins("*"), /wildcard origin is not allowed/i);
    assert.throws(() => parseCorsOrigins("https://one.example, "), /must not be empty/i);
    assert.throws(() => parseCorsOrigins("one.example"), /absolute HTTP\(S\) origin/i);
  });

  it("uses the explicit localhost development default", () => {
    assert.deepEqual(parseCorsOrigins(undefined), ["http://localhost:5173"]);
  });
});
