import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
let app: TestApp;
const proxySecret = "test-only-proxy-secret-32-characters";
const proxyHeaders = { "x-dmr-proxy-secret": proxySecret };

before(async () => {
  app = await startApp({
    DATABASE_URL: testDb.url,
    NODE_ENV: "production",
    TRUSTED_PROXY_SECRET: proxySecret,
    MFA_SECRET_KEY: "0123456789abcdef".repeat(4),
  });
});

after(async () => {
  await app.close();
  await testDb.close();
  const { pool } = await import("../src/config/db.js");
  await pool.end();
});

describe("production public endpoints", () => {
  it("sanitizes health and the root response", async () => {
    const health = await fetch(`${app.baseUrl}/api/health`);
    const healthBody = await health.json() as Record<string, unknown>;
    assert.deepEqual(healthBody, { ok: true, service: "dmr-poultries-backend" });
    const root = await fetch(`${app.baseUrl}/`);
    assert.deepEqual(await root.json(), { name: "DMR Poultries API", ok: true });
  });

  it("does not publish Swagger or OpenAPI in production", async () => {
    assert.equal((await fetch(`${app.baseUrl}/api/docs`, { headers: proxyHeaders })).status, 404);
    assert.equal((await fetch(`${app.baseUrl}/api/docs/openapi.json`, { headers: proxyHeaders })).status, 404);
  });

  it("rejects direct API access without the private proxy proof", async () => {
    assert.equal((await fetch(`${app.baseUrl}/api/auth/me`)).status, 403);
    assert.equal(
      (await fetch(`${app.baseUrl}/api/auth/me`, {
        headers: { "x-dmr-proxy-secret": "wrong-secret" },
      })).status,
      403,
    );
    assert.equal(
      (await fetch(`${app.baseUrl}/api/auth/me`, { headers: app.authHeaders })).status,
      200,
    );
  });
});
