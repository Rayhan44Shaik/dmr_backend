/**
 * Salary generation/submission authorization matrix.
 *
 * Business rule: OWNER and FULL_ACCESS may generate salary and submit salary.
 * Every other role must be denied at the HTTP boundary, independent of any
 * frontend visibility. Bulk Paid/Pending permissions are intentionally not
 * changed here; the final test locks their existing elevated-only behavior.
 *
 * Runs the production app against PGlite so each role is exercised through the
 * real middleware stack rather than by calling service methods directly.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { staffService } = await import("../src/services/staffService.js");
const { hashPassword } = await import("../src/utils/passwordHash.js");

type Role = "OWNER" | "FULL_ACCESS" | "OFFICE" | "COLLECTION" | "SUPERVISOR" | "AUDIT";
const deniedRoles: Role[] = ["OFFICE", "COLLECTION", "SUPERVISOR", "AUDIT"];
const cookies = new Map<Role, string>();
const password = "Salary-auth-password-123!";

const generatePath = "/api/staff/salaries/generate";
const submitMonthPath = "/api/staff/salaries/submit-month";
const bulkStatusPath = "/api/staff/salaries/bulk-status";

let employeeAId: number;

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

before(async () => {
  const employeeA = await mastersService.upsertEmployee({
    employeeName: "Salary Authorization A",
    department: "Operations",
    role: "Worker",
    phoneNumber: "9811100001",
    salary: 15000,
    status: "Active",
  });
  await mastersService.upsertEmployee({
    employeeName: "Salary Authorization B",
    department: "Operations",
    role: "Worker",
    phoneNumber: "9811100002",
    salary: 16000,
    status: "Active",
  });
  employeeAId = employeeA.id as number;

  cookies.set("OWNER", app.authHeaders.cookie as string);
  for (const role of deniedRoles) {
    const username = `salary-auth-${role.toLowerCase()}`;
    await pool.query(
      `INSERT INTO application_users (username, display_name, password_hash, role, employee_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, `Salary Auth ${role}`, await hashPassword(password), role, role === "SUPERVISOR" ? employeeAId : null]
    );
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(login.status, 200, `${role} login: ${await login.clone().text()}`);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, `${role} login did not return a cookie`);
    cookies.set(role, cookie);
  }

  const fullAccessUsername = "salary-auth-full-access";
  await pool.query(
    `INSERT INTO application_users (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'FULL_ACCESS')`,
    [fullAccessUsername, "Salary Auth Full Access", await hashPassword(password)]
  );
  const fullAccessLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: fullAccessUsername, password }),
  });
  assert.equal(fullAccessLogin.status, 200, `FULL_ACCESS login: ${await fullAccessLogin.clone().text()}`);
  const fullAccessCookie = fullAccessLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(fullAccessCookie, "FULL_ACCESS login did not return a cookie");
  cookies.set("FULL_ACCESS", fullAccessCookie);
});

async function postAs(role: Role | null, path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) {
    const cookie = cookies.get(role);
    assert.ok(cookie, `missing ${role} cookie`);
    headers.cookie = cookie;
  }
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function firstSalaryId(month: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM salary_records WHERE month = $1 ORDER BY id LIMIT 1",
    [month]
  );
  assert.equal(result.rowCount, 1, `expected a generated salary record for ${month}`);
  return result.rows[0].id;
}

describe("Salary authorization — generation", () => {
  it("allows OWNER and FULL_ACCESS to generate salary", async () => {
    for (const [role, month] of [["OWNER", "2027-01"], ["FULL_ACCESS", "2027-02"]] as const) {
      const res = await postAs(role, generatePath, { month });
      assert.equal(res.status, 200, `${role} generate: ${await res.clone().text()}`);
      const body = (await res.json()) as { month: string; generated: number };
      assert.equal(body.month, month);
      assert.ok(body.generated >= 1, `${role} should generate at least one record`);
    }
  });

  it("denies generation for every other role and anonymous callers", async () => {
    for (const role of deniedRoles) {
      const res = await postAs(role, generatePath, { month: "2027-03" });
      assert.equal(res.status, 403, `${role} must not generate salary: ${await res.clone().text()}`);
    }
    const anonymous = await postAs(null, generatePath, { month: "2027-03" });
    assert.equal(anonymous.status, 401, "anonymous generation must be unauthorized");
  });
});

describe("Salary authorization — month submission", () => {
  it("allows OWNER and FULL_ACCESS to submit a salary month", async () => {
    for (const [role, month] of [["OWNER", "2027-04"], ["FULL_ACCESS", "2027-05"]] as const) {
      const generated = await postAs(role, generatePath, { month });
      assert.equal(generated.status, 200, `${role} setup generate: ${await generated.clone().text()}`);

      const res = await postAs(role, submitMonthPath, { month });
      assert.equal(res.status, 200, `${role} submit month: ${await res.clone().text()}`);
      const body = (await res.json()) as { month: string; submittedCount: number };
      assert.equal(body.month, month);
      assert.ok(body.submittedCount >= 1, `${role} should submit at least one record`);
    }
  });

  it("denies month submission for every other role and anonymous callers", async () => {
    for (const role of deniedRoles) {
      const res = await postAs(role, submitMonthPath, { month: "2027-06" });
      assert.equal(res.status, 403, `${role} must not submit salary: ${await res.clone().text()}`);
    }
    const anonymous = await postAs(null, submitMonthPath, { month: "2027-06" });
    assert.equal(anonymous.status, 401, "anonymous month submission must be unauthorized");
  });
});

describe("Salary authorization — individual submission", () => {
  it("allows OWNER and FULL_ACCESS to submit an individual salary record", async () => {
    for (const [role, month] of [["OWNER", "2027-07"], ["FULL_ACCESS", "2027-08"]] as const) {
      const generated = await postAs(role, generatePath, { month });
      assert.equal(generated.status, 200, `${role} setup generate: ${await generated.clone().text()}`);
      const id = await firstSalaryId(month);

      const res = await postAs(role, `/api/staff/salaries/${id}/submit`, {});
      assert.equal(res.status, 200, `${role} individual submit: ${await res.clone().text()}`);
      const body = (await res.json()) as { status: string };
      assert.equal(body.status, "Submitted");
    }
  });

  it("denies individual submission for every other role and anonymous callers", async () => {
    const draft = await staffService.createSalary({
      employeeId: employeeAId,
      month: "2027-11",
      basicSalary: 15000,
    });
    const id = draft.id;
    for (const role of deniedRoles) {
      const res = await postAs(role, `/api/staff/salaries/${id}/submit`, {});
      assert.equal(res.status, 403, `${role} must not submit an individual salary: ${await res.clone().text()}`);
    }
    const anonymous = await postAs(null, `/api/staff/salaries/${id}/submit`, {});
    assert.equal(anonymous.status, 401, "anonymous individual submission must be unauthorized");
  });
});

describe("Salary authorization — bulk Paid/Pending remains unchanged", () => {
  it("keeps bulk status elevated-only for FULL_ACCESS while denying other roles", async () => {
    const generated = await postAs("FULL_ACCESS", generatePath, { month: "2027-09" });
    assert.equal(generated.status, 200, `bulk setup generate: ${await generated.clone().text()}`);
    const rows = await pool.query<{ id: string }>(
      "SELECT id FROM salary_records WHERE month = '2027-09' ORDER BY id"
    );
    const ids = rows.rows.map((row) => row.id);
    assert.ok(ids.length >= 1, "expected generated salary rows");

    const pending = await postAs("FULL_ACCESS", bulkStatusPath, { ids, status: "Pending" });
    assert.equal(pending.status, 200, `FULL_ACCESS bulk Pending: ${await pending.clone().text()}`);

    const paid = await postAs("FULL_ACCESS", bulkStatusPath, {
      ids,
      status: "Paid",
      paymentDate: "2027-09-30",
      paymentMode: "Cash",
    });
    assert.equal(paid.status, 200, `FULL_ACCESS bulk Paid: ${await paid.clone().text()}`);

    for (const role of deniedRoles) {
      const res = await postAs(role, bulkStatusPath, { ids, status: "Pending" });
      assert.equal(res.status, 403, `${role} must not bulk-change salary status: ${await res.clone().text()}`);
    }
  });
});
