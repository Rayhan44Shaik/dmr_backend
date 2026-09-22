/**
 * Staff P2/P3 HTTP closure: security headers + correlation IDs verified
 * through the production server entry point (helpers/app.ts boots
 * src/index.ts unmodified).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

before(async () => {});
after(async () => {
  await app.close();
  await testDb.close();
  const { pool } = await import("../src/config/db.js");
  await pool.end();
});

describe("Staff HTTP hardening (headers + correlation)", () => {
  it("unauthenticated Staff responses carry security headers and a request id", async () => {
    const res = await fetch(`${app.baseUrl}/api/staff/leaves`);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.ok(
      String(res.headers.get("content-security-policy")).includes(
        "frame-ancestors 'none'"
      )
    );
    const requestId = res.headers.get("x-request-id");
    assert.match(requestId ?? "", /^[0-9a-f-]{36}$/i);
    const body = (await res.json()) as { requestId?: string };
    assert.equal(body.requestId, requestId);
  });

  it("propagates a caller-supplied request id on authenticated Staff reads", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174001";
    const res = await fetch(
      `${app.baseUrl}/api/staff/leaves?limit=1`,
      { headers: { ...app.authHeaders, "x-request-id": id } }
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-request-id"), id);
  });

  it("error responses on Staff routes stay user-safe and correlated", async () => {
    const res = await fetch(`${app.baseUrl}/api/staff/salaries/abc`, {
      headers: app.authHeaders,
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error?: string;
      requestId?: string;
    };
    assert.ok(body.error);
    assert.match(body.requestId ?? "", /^[0-9a-f-]{36}$/i);
  });
});
