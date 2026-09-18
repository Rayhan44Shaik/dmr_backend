import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const { pool } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

let employeeId = 0;
let otherEmployeeId = 0;
let supervisorCookie = "";

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${app.baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: supervisorCookie, ...(init.headers ?? {}) },
  });
}

before(async () => {
  const employees = await pool.query(
    `INSERT INTO employees (employee_no,employee_name,department,role,status)
     VALUES (99101,'Staff Auth Supervisor','Operations','Supervisor','Active'),
            (99102,'Staff Auth Other','Operations','Worker','Active') RETURNING id`,
  );
  employeeId = Number(employees.rows[0].id);
  otherEmployeeId = Number(employees.rows[1].id);
  await pool.query(
    `INSERT INTO application_users(username,display_name,password_hash,role,employee_id)
     VALUES ('staff-auth-supervisor','Staff Auth Supervisor',$1,'SUPERVISOR',$2)`,
    [await hashPassword("Staff-auth-test-123!"), employeeId],
  );
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "staff-auth-supervisor", password: "Staff-auth-test-123!" }),
  });
  supervisorCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.equal(login.status, 200);
  assert.ok(supervisorCookie);
  await pool.query(
    `INSERT INTO leave_requests(employee_id,employee_name,leave_type,from_date,to_date,days,status,reason)
     VALUES ($1,'Staff Auth Supervisor','Casual','2026-10-01','2026-10-01',1,'Pending','Own'),
            ($2,'Staff Auth Other','Casual','2026-10-02','2026-10-02',1,'Pending','Other')`,
    [employeeId, otherEmployeeId],
  );
});

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

describe("Staff authorization boundary", () => {
  it("blocks non-owner payroll and performance reads", async () => {
    assert.equal((await request("/api/staff/salaries?month=2026-10")).status, 403);
    assert.equal((await request("/api/staff/performance/drivers?fromDate=2026-10-01&toDate=2026-10-31")).status, 403);
  });

  it("forces leave reads to the signed-in employee, preventing IDOR", async () => {
    const response = await request(`/api/staff/leaves?employeeId=${otherEmployeeId}`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { items: Array<{ employeeId: number }> };
    assert.ok(payload.items.length > 0);
    assert.ok(payload.items.every((row) => row.employeeId === employeeId));
  });

  it("allows only self-service leave creation and denies approval", async () => {
    const other = await request("/api/staff/leaves", {
      method: "POST",
      body: JSON.stringify({ employeeId: otherEmployeeId, type: "Casual", fromDate: "2026-11-01", toDate: "2026-11-01", reason: "Other" }),
    });
    assert.equal(other.status, 403);
    const own = await request("/api/staff/leaves", {
      method: "POST",
      body: JSON.stringify({ employeeId, type: "Casual", fromDate: "2026-11-01", toDate: "2026-11-01", reason: "Own" }),
    });
    assert.equal(own.status, 201);
    const created = await own.json() as { id: string };
    assert.equal((await request(`/api/staff/leaves/${created.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "Approved" }) })).status, 403);
  });
});
