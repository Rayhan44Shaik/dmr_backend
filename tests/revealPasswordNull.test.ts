import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const { pool } = await import("../src/config/db.js");
const owner = app.authHeaders.cookie;

async function call(path: string, init: { method: string; body?: unknown }) {
  const headers: Record<string, string> = { cookie: owner };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`${app.baseUrl}${path}`, { method: init.method, headers, body });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed };
}

before(async () => {
  await pool.query(
    `INSERT INTO employees (employee_no, employee_name, department, status, phone_number) VALUES (9101, 'Reveal Null Check', 'Operations', 'Active', '9101000001')`
  );
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("reveal_password is never persisted", () => {
  it("grant and reset return a one-time password but store NULL", async () => {
    const emp = await pool.query(`SELECT id FROM employees WHERE employee_no=9101`);
    const grant = await call("/api/access-management/grant", {
      method: "POST",
      body: { employeeId: emp.rows[0].id, role: "COLLECTION" },
    });
    assert.equal(grant.status, 201);
    assert.ok(typeof grant.body.temporaryPassword === "string" && grant.body.temporaryPassword.length > 0);
    const afterGrant = await pool.query(`SELECT reveal_password FROM application_users WHERE id=$1`, [grant.body.user.id]);
    assert.equal(afterGrant.rows[0].reveal_password, null);

    const reset = await call(`/api/access-management/${grant.body.user.id}/reset-password`, { method: "POST" });
    assert.equal(reset.status, 200);
    assert.ok(typeof reset.body.temporaryPassword === "string" && reset.body.temporaryPassword.length > 0);
    const afterReset = await pool.query(`SELECT reveal_password FROM application_users WHERE id=$1`, [grant.body.user.id]);
    assert.equal(afterReset.rows[0].reveal_password, null);
  });
});
