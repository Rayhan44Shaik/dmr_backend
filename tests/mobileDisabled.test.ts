import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

let app: TestApp;

before(async () => {
  app = await startApp({ DATABASE_URL: testDb.url });
});

after(async () => {
  await app.close();
  await testDb.close();
  const { pool } = await import("../src/config/db.js");
  await pool.end();
});

describe("supervisor mobile is disabled", () => {
  it("desktop login returns a cookie but no bearer token", async () => {
    const port = new URL(app.baseUrl).port;
    const response = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: `test-owner-${port}`,
        password: "Test-only-password-123!",
      }),
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("set-cookie")?.includes("dmr_session="));
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal("token" in body, false);
    assert.equal("accessToken" in body, false);
    assert.equal("refreshToken" in body, false);
  });

  it("does not expose a mobile auth or business router", async () => {
    for (const path of ["/api/mobile/auth/login", "/api/mobile/trips"]) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        method: "POST",
        headers: { ...app.authHeaders, "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 404, `${path} must not be mounted`);
    }
  });
});
