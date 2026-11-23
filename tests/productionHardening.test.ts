/**
 * Production hardening regression tests:
 * - route-specific JSON limits and safe parser failures
 * - a valid large bulk import that exceeds the default cap
 * - verified proxy identity for staff/export rate limiting
 * - direct proxy-proof rejection
 *
 * Runs only against isolated PGlite; never the operational database.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const proxySecret = "task7a-proxy-secret-0123456789abcdef";
process.env.TRUSTED_PROXY_SECRET = proxySecret;

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
let createRateLimiter: typeof import("../src/middleware/staffRateLimit.js").createRateLimiter;
let exportOnly: typeof import("../src/middleware/staffRateLimit.js").exportOnly;
let requireProxyProof: typeof import("../src/middleware/clientAddress.js").requireProxyProof;

before(async () => {
  ({ createRateLimiter, exportOnly } = await import("../src/middleware/staffRateLimit.js"));
  ({ requireProxyProof } = await import("../src/middleware/clientAddress.js"));
});

after(async () => {
  await app.close();
  await testDb.close();
  const { pool } = await import("../src/config/db.js");
  await pool.end();
});

function request(headers: Record<string, string>, ip = "127.0.0.1", query: Record<string, unknown> = {}) {
  return {
    ip,
    socket: { remoteAddress: ip },
    query,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as never;
}

function response() {
  let statusCode = 200;
  return {
    get statusCode() {
      return statusCode;
    },
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as any;
}

describe("JSON parser production limits", () => {
  it("maps malformed JSON to a safe 400", async () => {
    const res = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{username:attacker-controlled}",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "VALIDATION_ERROR");
  });

  it("rejects a body above the default 1 MB cap with 413", async () => {
    const res = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "x", password: "p".repeat(1_100_000) }),
    });
    assert.equal(res.status, 413);
    assert.equal(((await res.json()) as { code?: string }).code, "PAYLOAD_TOO_LARGE");
  });

  it("rejects compressed request bodies with 415", async () => {
    const res = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      body: JSON.stringify({ username: "x", password: "y" }),
    });
    assert.equal(res.status, 415);
  });

  it("accepts a valid large bulk import above 1 MB through the 12 MB route cap", async () => {
    const rows = Array.from({ length: 700 }, (_, index) => ({
      shopName: `Hardening Shop ${String(index + 1).padStart(4, "0")}`,
      ownerName: "Hardening Owner",
      phoneNumber: "9876543210",
      city: "Hyderabad",
      address: "A".repeat(1_800),
      paperRate: 10,
      associationType: "Vencob Vij",
      openingBalance: 0,
      status: "Active",
    }));
    const payload = JSON.stringify(rows);
    assert.ok(payload.length > 1_048_576, `payload too small: ${payload.length}`);
    assert.ok(payload.length < 12 * 1024 * 1024, `payload too large: ${payload.length}`);
    const res = await fetch(`${app.baseUrl}/api/masters/shops/bulk`, {
      method: "POST",
      headers: { ...app.authHeaders, "content-type": "application/json" },
      body: payload,
    });
    assert.equal(res.status, 201, await res.text());
  });

  it("rejects a body above the 12 MB bulk cap with 413", async () => {
    const res = await fetch(`${app.baseUrl}/api/masters/shops/bulk`, {
      method: "POST",
      headers: { ...app.authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rows: [], padding: "x".repeat(13 * 1024 * 1024) }),
    });
    assert.equal(res.status, 413);
  });
});

describe("verified client identity for rate limiting", () => {
  it("uses the proved CF-Connecting-IP, not a browser X-Forwarded-For", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const first = request({ "x-dmr-proxy-secret": proxySecret, "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.99" });
    const second = request({ "x-dmr-proxy-secret": proxySecret, "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.99" });
    let firstPassed = false;
    limiter(first, response(), () => { firstPassed = true; });
    assert.equal(firstPassed, true);
    let secondStatus = 0;
    const secondRes = response();
    limiter(second, secondRes, () => { throw new Error("second request must be limited"); });
    assert.equal(secondRes.statusCode, 429);
  });

  it("does not trust a forged forwarding chain without proof", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const first = request({ "cf-connecting-ip": "203.0.113.20", "x-forwarded-for": "198.51.100.20" });
    const second = request({ "cf-connecting-ip": "203.0.113.21", "x-forwarded-for": "198.51.100.21" });
    let passed = false;
    limiter(first, response(), () => { passed = true; });
    assert.equal(passed, true);
    const secondRes = response();
    limiter(second, secondRes, () => { throw new Error("forged identity must share the socket bucket"); });
    assert.equal(secondRes.statusCode, 429);
  });

  it("rejects a direct request with the wrong proxy proof", async () => {
    const req = request({ "x-dmr-proxy-secret": "wrong", "cf-connecting-ip": "203.0.113.30" });
    let caught: unknown;
    requireProxyProof(req, response(), (err?: unknown) => { caught = err; });
    assert.ok(caught && typeof caught === "object" && "status" in caught);
    assert.equal((caught as { status: number }).status, 403);
  });

  it("limits export requests at the shared export cap", async () => {
    let lastStatus = 200;
    for (let i = 0; i < 31; i += 1) {
      const res = response();
      exportOnly(
        request({ "x-dmr-proxy-secret": proxySecret, "cf-connecting-ip": "203.0.113.40" }, "127.0.0.1", { export: "true" }),
        res,
        () => { lastStatus = 200; }
      );
      lastStatus = res.statusCode;
    }
    assert.equal(lastStatus, 429);
  });
});