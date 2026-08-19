import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

describe("Supervisor Mobile auth", () => {
  it("rejects unknown credentials", async () => {
    const res = await postJson(baseUrl, "/api/mobile/auth/login", {
      username: "nobody",
      password: "wrong",
    });
    assert.equal(res.status, 401);
  });

  it("issues a session for the local supervisor account", async () => {
    const res = await postJson(baseUrl, "/api/mobile/auth/login", {
      username: "RuhullaShaik",
      password: "Supervisor@123",
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, "string");
    assert.equal(res.body.supervisor.username, "RuhullaShaik");
    assert.ok(res.body.supervisor.employeeId);

    const me = await fetch(`${baseUrl}/api/mobile/auth/me`, {
      headers: { Authorization: `Bearer ${res.body.token}` },
    });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.supervisor.username, "RuhullaShaik");

    const health = await fetch(`${baseUrl}/api/mobile/sync/health`, {
      headers: { Authorization: `Bearer ${res.body.token}` },
    });
    assert.equal(health.status, 200);

    const bootstrap = await fetch(`${baseUrl}/api/mobile/bootstrap`, {
      headers: { Authorization: `Bearer ${res.body.token}` },
    });
    assert.equal(bootstrap.status, 200);
  });
});
