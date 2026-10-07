import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";
import { startApp, type TestApp } from "./helpers/app.js";
const testDb: TestDb = await startTestDb(); process.env.DATABASE_URL = testDb.url; await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const { pool } = await import("../src/config/db.js"); const { hashPassword } = await import("../src/utils/passwordHash.js");
let supervisorCookie = "", otherEmployee = 0, ownEmployee = 0, dutyId = "", leaveId = "", leaveDate = "";
async function login(username: string, password: string) { const response = await fetch(`${app.baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }); return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" }; }
const today = new Date().toISOString().slice(0, 10);
const weekStart = new Date(new Date().setDate(new Date().getDate() - ((new Date().getDay() + 6) % 7))).toISOString().slice(0, 10);
const weekEnd = new Date(new Date().setDate(new Date().getDate() + (7 - ((new Date().getDay() + 6) % 7)))).toISOString().slice(0, 10);
const month = new Date().toISOString().slice(0, 7);
const sup = (body?: unknown, method = "GET") => fetch(`${app.baseUrl}/api/staff/leaves`, { method, headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
before(async () => {
  const employees = await pool.query(`INSERT INTO employees (employee_no,employee_name,department,role,status) VALUES (91001,'Staff Sup A','Operations','Supervisor','Active'),(91002,'Staff Other','Operations','Driver','Active') RETURNING id`);
  ownEmployee = Number(employees.rows[0].id); otherEmployee = Number(employees.rows[1].id);
  const password = "Staff-test-123!";
  await pool.query(`INSERT INTO application_users (username,display_name,password_hash,role,employee_id) VALUES ('staff-sup-a','Staff Sup A',$1,'SUPERVISOR',$2)`, [await hashPassword(password), ownEmployee]);
  supervisorCookie = (await login("staff-sup-a", password)).cookie;
  const dutyDate = new Date().toISOString().slice(0, 10); // future-safe date
  const created = await fetch(`${app.baseUrl}/api/staff/duty-planner/assign`, { method: "POST", headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: JSON.stringify({ employeeId: ownEmployee, dutyType: "Office", date: dutyDate }) });
  assert.equal(created.status, 201);
  const week = (await created.json()) as { assignments: Array<{ id: string; employeeId: number }> };
  dutyId = week.assignments.find((a) => a.employeeId === ownEmployee)!.id;
  leaveDate = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  const leave = await sup({ employeeId: ownEmployee, type: "Casual", fromDate: leaveDate, toDate: leaveDate, reason: "matrix" }, "POST");
  assert.equal(leave.status, 201);
  leaveId = ((await leave.json()) as { id: string }).id;
});
after(async () => { await app.close(); await testDb.close(); await pool.end(); });
describe("Staff role-authorization matrix", () => {
  it("rejects anonymous Staff reads", async () => {
    for (const path of [`/api/staff/leaves`, `/api/staff/salaries?month=${month}`, `/api/staff/duty-planner?weekStart=${weekStart}`, `/api/staff/performance/drivers?fromDate=${today}&toDate=${weekEnd}`, `/api/staff/performance/supervisors?fromDate=${today}&toDate=${weekEnd}`, `/api/staff/attendance/summary?month=${month}`]) {
      assert.equal((await fetch(`${app.baseUrl}${path}`)).status, 401, `GET ${path} must require authentication`);
    }
  });
  it("lets Supervisors create only their own leave and scopes their reads", async () => {
    assert.equal((await sup({ employeeId: otherEmployee, type: "Casual", fromDate: leaveDate, toDate: leaveDate }, "POST")).status, 403);
    const list = await sup();
    assert.equal(list.status, 200);
    const body = (await list.json()) as { items: Array<{ employeeId: number }> };
    assert.ok(body.items.length > 0 && body.items.every((item) => item.employeeId === ownEmployee));
  });
  it("lets Supervisors write manual duties but not delete, auto-assign or submit", async () => {
    assert.equal((await fetch(`${app.baseUrl}/api/staff/duty-planner/${dutyId}`, { method: "DELETE", headers: { cookie: supervisorCookie } })).status, 403);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/duty-planner/auto-assign/apply`, { method: "POST", headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: JSON.stringify({ weekStart }) })).status, 403);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/duty-planner/submit`, { method: "POST", headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: JSON.stringify({ weekStart }) })).status, 403);
  });
  it("forbids Supervisors from approving leave, touching payroll or viewing performance", async () => {
    assert.equal((await fetch(`${app.baseUrl}/api/staff/leaves/${leaveId}/status`, { method: "PATCH", headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: JSON.stringify({ status: "Approved", approvedBy: "hacker" }) })).status, 403);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/salaries/generate`, { method: "POST", headers: { cookie: supervisorCookie, "content-type": "application/json" }, body: JSON.stringify({ month }) })).status, 403);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/salaries?month=${month}`, { headers: { cookie: supervisorCookie } })).status, 403);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/performance/drivers?fromDate=${today}&toDate=${weekEnd}`, { headers: { cookie: supervisorCookie } })).status, 403);
  });
  it("allows Owners the full mutation path with server-owned actors", async () => {
    assert.equal((await fetch(`${app.baseUrl}/api/staff/duty-planner?weekStart=${weekStart}`, { headers: app.authHeaders })).status, 200);
    assert.equal((await fetch(`${app.baseUrl}/api/staff/performance/drivers?fromDate=${today}&toDate=${weekEnd}`, { headers: app.authHeaders })).status, 200);
    const approve = await fetch(`${app.baseUrl}/api/staff/leaves/${leaveId}/status`, { method: "PATCH", headers: { ...app.authHeaders, "content-type": "application/json" }, body: JSON.stringify({ status: "Approved" }) });
    assert.equal(approve.status, 200);
    assert.equal(((await approve.json()) as { approvedBy: string }).approvedBy, "Test Owner");
  });
});
