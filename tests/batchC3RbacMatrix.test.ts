/**
 * Batch C3 — SEC-02 executable role matrix (real HTTP, real schema).
 *
 * Every cell has ONE exact expected outcome:
 *   allow -> any non-401/403 business response (recorded verbatim)
 *   deny  -> exactly 403
 * Denied writes are followed by a database count to prove no mutation.
 * No cell accepts "200 or 403".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });

const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

type Role = "OWNER" | "FULL_ACCESS" | "AUDIT" | "OFFICE" | "COLLECTION" | "SUPERVISOR";
const ROLES: Role[] = ["OWNER", "FULL_ACCESS", "AUDIT", "OFFICE", "COLLECTION", "SUPERVISOR"];
const PASSWORD = "Rbac-matrix-test-123!";
const cookies = new Map<Role, string>();
const results: Array<Record<string, unknown>> = [];

async function api(method: string, route: string, role: Role, body?: unknown) {
  const headers: Record<string, string> = { cookie: cookies.get(role) ?? "" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${app.baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function login(username: string) {
  const response = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  assert.equal(response.status, 200, `login ${username}: ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, `cookie for ${username}`);
  return cookie;
}

before(async () => {
  const employee = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES ('88001','Matrix Supervisor','Operations','Supervisor','Active') RETURNING id`,
  );
  const hash = await hashPassword(PASSWORD);
  for (const role of ROLES) {
    const username = `matrix-${role.toLowerCase()}`;
    await pool.query(
      `INSERT INTO application_users (username,display_name,password_hash,role,employee_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [username, `Matrix ${role}`, hash, role, role === "SUPERVISOR" ? employee.rows[0].id : null],
    );
    cookies.set(role, await login(username));
  }
});

after(async () => {
  const outDir = process.env.C3_EVIDENCE_DIR;
  if (outDir) {
    const file = path.join(outDir, "sec02", "rbac-matrix.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  }
  await app.close();
  await testDb.close();
  await pool.end();
});

type Expectation = Record<Role, "allow" | "deny">;

function matrixCell(
  module: string,
  action: string,
  method: string,
  route: string,
  expected: Expectation,
  body?: () => unknown,
) {
  it(`${module} / ${action} (${method} ${route})`, async () => {
    for (const role of ROLES) {
      const response = await api(method, route, role, body?.());
      const verdict = expected[role];
      results.push({
        module,
        action,
        method,
        route,
        role,
        expected: verdict,
        status: response.status,
        body: response.json,
      });
      if (verdict === "deny") {
        assert.equal(response.status, 403, `${module}/${action} ${role} must be denied: ${response.status} ${response.text}`);
      } else {
        assert.ok(
          ![401, 403].includes(response.status),
          `${module}/${action} ${role} must be allowed: ${response.status} ${response.text}`,
        );
      }
    }
  });
}

const all = { OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "allow", OFFICE: "allow", COLLECTION: "allow", SUPERVISOR: "allow" } as Expectation;
const ownerFull = { OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "deny", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny" } as Expectation;
const ownerOnly = { OWNER: "allow", FULL_ACCESS: "deny", AUDIT: "deny", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny" } as Expectation;

let createdShopId = 0;

describe("SEC-02 six-role server-side matrix", () => {
  matrixCell("Masters", "list/read", "GET", "/api/masters/shops", all);

  matrixCell("Masters", "create", "POST", "/api/masters/shops", ownerFull, () => ({
    shopName: `Matrix Shop ${Date.now()}${Math.floor(Math.random() * 1000)}`,
    ownerName: "Matrix Owner",
    phoneNumber: "9899990001",
    city: "Hyderabad",
    paperRate: 5,
    associationType: "Vencob Vij",
    openingBalance: 0,
    status: "Active",
  }));

  matrixCell("Masters", "detail/read", "GET", "/api/masters/shops/1", all);

  matrixCell("Trips", "list/read", "GET", "/api/trips", all);

  matrixCell("Trips", "create", "POST", "/api/trips", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "deny", OFFICE: "allow", COLLECTION: "deny", SUPERVISOR: "allow",
  }, () => ({}));

  matrixCell("Operations", "dashboard read", "GET", "/api/operations/dashboard", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "allow", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "allow",
  });

  matrixCell("Accounts", "payments read", "GET", "/api/accounts/payments", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "allow", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  });

  matrixCell("Accounts", "payments create", "POST", "/api/accounts/payments", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "deny", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  }, () => ({}));

  matrixCell("Fleet", "maintenance approve", "POST", "/api/fleet/maintenance/999999/approve", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "deny", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  }, () => ({}));

  matrixCell("Staff", "salary summary read", "GET", "/api/staff/salaries/month-summary", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "allow", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  });

  // Approved exception: FULL_ACCESS may read and manage access, but may not
  // assign or manage OWNER/FULL_ACCESS accounts (router-level manager checks).
  // Observed policy: AUDIT is read-only across modules, including the access
  // directory (recorded as an exception pending owner sign-off).
  matrixCell("Access management", "list", "GET", "/api/access-management/employees", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "allow", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  });

  matrixCell("Access management", "grant", "POST", "/api/access-management/grant", {
    OWNER: "allow", FULL_ACCESS: "allow", AUDIT: "deny", OFFICE: "deny", COLLECTION: "deny", SUPERVISOR: "deny",
  }, () => ({}));

  matrixCell("Settings", "self preferences read", "GET", "/api/settings/preferences", all);

  it("denied masters writes cause no database mutation", async () => {
    const before = await pool.query(`SELECT COUNT(*)::int AS count FROM shops`);
    for (const role of ["AUDIT", "OFFICE", "COLLECTION", "SUPERVISOR"] as Role[]) {
      const response = await api("POST", "/api/masters/shops", role, {
        shopName: `Forbidden Shop ${role} ${Date.now()}`,
        ownerName: "Matrix Owner",
        phoneNumber: "9899990002",
        city: "Hyderabad",
        paperRate: 5,
        associationType: "Vencob Vij",
        openingBalance: 0,
        status: "Active",
      });
      assert.equal(response.status, 403, role);
    }
    const after = await pool.query(`SELECT COUNT(*)::int AS count FROM shops`);
    assert.equal(Number(after.rows[0].count), Number(before.rows[0].count));
    results.push({
      module: "Masters", action: "denied write no-mutation", method: "POST", route: "/api/masters/shops",
      role: "AUDIT,OFFICE,COLLECTION,SUPERVISOR", expected: "deny", status: 403,
      body: { before: Number(before.rows[0].count), after: Number(after.rows[0].count) },
    });
  });

  it("OWNER-created shop is visible to every role through the read policy", async () => {
    const created = await api("POST", "/api/masters/shops", "OWNER", {
      shopName: `Matrix Visible ${Date.now()}`,
      ownerName: "Matrix Owner",
      phoneNumber: "9899990003",
      city: "Hyderabad",
      paperRate: 5,
      associationType: "Vencob Vij",
      openingBalance: 0,
      status: "Active",
    });
    assert.ok([200, 201].includes(created.status), created.text);
    createdShopId = Number((created.json as { id?: number })?.id ?? 0);
    assert.ok(createdShopId > 0);
    for (const role of ROLES) {
      const list = await api("GET", "/api/masters/shops", role);
      assert.equal(list.status, 200, role);
      const text = JSON.stringify(list.json);
      assert.ok(text.includes("Matrix Visible"), `${role} can read the created shop`);
    }
  });
});
