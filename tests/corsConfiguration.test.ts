import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { isStrongTrustedProxySecret, loadEnvironment, parseCorsOrigins } from "../src/config/env.js";

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

  it("fails closed when production database, CORS or proxy proof settings are absent", () => {
    assert.throws(() => loadEnvironment({ NODE_ENV: "production" }), /DATABASE_URL is required/);
    assert.throws(
      () => loadEnvironment({ NODE_ENV: "production", DATABASE_URL: "postgresql://configured" }),
      /CORS_ORIGIN is required/,
    );
    const productionBase = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://configured",
      CORS_ORIGIN: "https://erp.example",
      MFA_SECRET_KEY: "0123456789abcdef".repeat(4),
    };
    assert.throws(() => loadEnvironment(productionBase), /TRUSTED_PROXY_SECRET/);
    assert.throws(
      () => loadEnvironment({ ...productionBase, TRUSTED_PROXY_SECRET: "too-short" }),
      /TRUSTED_PROXY_SECRET/,
    );
    assert.throws(
      () => loadEnvironment({ ...productionBase, TRUSTED_PROXY_SECRET: "A".repeat(40) }),
      /TRUSTED_PROXY_SECRET/,
    );
    const lowDiversitySecret = "Abcdef123".repeat(5);
    assert.equal(lowDiversitySecret.length >= 32, true);
    assert.throws(
      () => loadEnvironment({ ...productionBase, TRUSTED_PROXY_SECRET: lowDiversitySecret }),
      /TRUSTED_PROXY_SECRET/,
    );
    const generatedProxySecret = randomBytes(32).toString("base64url");
    assert.equal(/^[A-Za-z0-9_-]{43}$/.test(generatedProxySecret), true);
    assert.equal(isStrongTrustedProxySecret(generatedProxySecret), true);
    assert.doesNotThrow(() =>
      loadEnvironment({ ...productionBase, TRUSTED_PROXY_SECRET: generatedProxySecret }),
    );
  });

  it("requires a valid MFA_SECRET_KEY in production without exposing its value", () => {
    const productionBase = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://configured",
      CORS_ORIGIN: "https://erp.example",
      TRUSTED_PROXY_SECRET: randomBytes(32).toString("base64url"),
    };
    let missingError: unknown;
    try {
      loadEnvironment(productionBase);
    } catch (error) {
      missingError = error;
    }
    assert.ok(missingError instanceof Error);
    assert.match(missingError.message, /MFA_SECRET_KEY/);

    const malformedValues = [
      "0123456789abcdef".repeat(3), // incorrect length (48 characters)
      `${"0123456789abcdef".repeat(4).slice(0, 63)}g`, // exactly 64 chars, one non-hex
    ];
    for (const value of malformedValues) {
      assert.throws(
        () => loadEnvironment({ ...productionBase, MFA_SECRET_KEY: value }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /MFA_SECRET_KEY/);
          assert.equal(error.message.includes(value), false, "validation error must not echo the key");
          return true;
        },
      );
    }

    assert.doesNotThrow(() =>
      loadEnvironment({ ...productionBase, MFA_SECRET_KEY: "0123456789abcdef".repeat(4) }),
    );
  });
});
