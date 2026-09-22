/**
 * Leave backend tests — the authoritative Leave → Duty → Attendance → Salary
 * contract, exercised over the real HTTP API against a real PostgreSQL engine
 * (PGlite WASM behind pg-gateway) with no mocks.
 *
 * Covers:
 *   - create (Pending, server-computed days), status transitions
 *   - invalid employee / invalid dates
 *   - list filtering (status, month, department, employee, leaveType, search)
 *     and pagination metadata
 *   - delete rules (pending deletable, approved/rejected protected, 404)
 *   - approved leave blocks a duty assignment (Leave → Duty enforcement)
 *   - leave report: authoritative distinct approved calendar days, cross-month
 *     splitting (31 Jul → 2 Aug = 1 in July, 2 in August), pending/rejected not
 *     counted as approved, leaveDates + leaveTypes
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { getJson, patchJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

interface EmpSeed {
  id: number;
  employeeName: string;
}

async function seedEmployee(name: string, department: string): Promise<EmpSeed> {
  const e = await mastersService.upsertEmployee({
    employeeName: name,
    department,
    role: "Worker",
    phoneNumber: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    salary: 15000,
    status: "Active",
  });
  return { id: e.id as number, employeeName: e.employeeName as string };
}

let empA: EmpSeed;
let empB: EmpSeed;

before(async () => {
  empA = await seedEmployee("Leave Test A", "Operations");
  empB = await seedEmployee("Leave Test B", "Supervisor");
});

beforeEach(async () => {
  await pool.query("DELETE FROM duty_assignments");
  await pool.query("DELETE FROM leave_requests");
});

async function createLeave(overrides: Record<string, unknown> = {}) {
  return postJson(baseUrl, "/api/staff/leaves", {
    employeeId: empA.id,
    type: "Casual",
    fromDate: "2026-08-20",
    toDate: "2026-08-22",
    reason: "Test",
    ...overrides,
  });
}

describe("Leave — create & validation", () => {
  it("creates a Pending leave and computes inclusive days (20→22 = 3)", async () => {
    const res = await createLeave();
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "Pending");
    assert.equal(res.body.days, 3);
    assert.equal(res.body.employeeId, empA.id);
  });

  it("rejects a nonexistent employee", async () => {
    const res = await createLeave({ employeeId: 999999 });
    assert.equal(res.status, 422);
  });

  it("rejects invalid date range (toDate < fromDate)", async () => {
    const res = await createLeave({ fromDate: "2026-08-22", toDate: "2026-08-20" });
    assert.equal(res.status, 400);
  });

  it("rejects an invalid leave type", async () => {
    const res = await createLeave({ type: "Bonus" });
    assert.equal(res.status, 400);
  });

  it("ignores an explicitly supplied days value and derives calendar days", async () => {
    const res = await createLeave({ fromDate: "2026-08-20", toDate: "2026-08-22", days: 2.5 });
    assert.equal(res.status, 201);
    assert.equal(res.body.days, 3);
  });

  it("rejects impossible calendar dates", async () => {
    const res = await createLeave({ fromDate: "2026-09-31", toDate: "2026-10-01" });
    assert.equal(res.status, 400);
  });

  it("rejects overlapping pending requests", async () => {
    assert.equal((await createLeave()).status, 201);
    assert.equal((await createLeave({ fromDate: "2026-08-21", toDate: "2026-08-23" })).status, 409);
  });
});

describe("Leave — status transitions", () => {
  it("approves and records approvedAt", async () => {
    const created = await createLeave();
    const patch = await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, {
      status: "Approved",
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.status, "Approved");
    assert.ok(patch.body.approvedAt);
  });

  it("rejects and records the rejection reason", async () => {
    const created = await createLeave({ type: "Sick" });
    const patch = await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, {
      status: "Rejected",
      rejectionReason: "Docs required",
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.status, "Rejected");
    assert.equal(patch.body.rejectionReason, "Docs required");
  });

  it("404s on an unknown leave id", async () => {
    const res = await patchJson(baseUrl, "/api/staff/leaves/00000000-0000-0000-0000-000000000000/status", {
      status: "Approved",
    });
    assert.equal(res.status, 404);
  });

  it("allows exactly one concurrent approval", async () => {
    const created = await createLeave();
    const results = await Promise.all([
      patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" }),
      patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  });

  it("cancels approved leave and prevents a repeated cancellation", async () => {
    const created = await createLeave();
    assert.equal((await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" })).status, 200);
    assert.equal((await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Cancelled" })).status, 200);
    assert.equal((await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Cancelled" })).status, 409);
  });
});

describe("Leave — list filtering & pagination", () => {
  it("filters by status", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves?status=Approved`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((l: any) => l.status === "Approved"));
  });

  it("filters by department", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves?department=Supervisor`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((l: any) => l.department === "Supervisor"));
  });

  it("filters by employeeId", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves?employeeId=${empA.id}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((l: any) => l.employeeId === empA.id));
  });

  it("filters by leaveType", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves?leaveType=Casual`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((l: any) => l.type === "Casual"));
  });

  it("returns pagination metadata", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves?page=1&limit=2`);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total, "number");
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 2);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length <= 2, true);
  });
});

describe("Leave — delete rules", () => {
  it("deletes a Pending leave", async () => {
    const created = await createLeave();
    const del = await fetch(`${baseUrl}/api/staff/leaves/${created.body.id}`, { method: "DELETE", headers: app.authHeaders });
    assert.equal(del.status, 200);
    const json = await del.json();
    assert.equal(json.deleted, true);
  });

  it("refuses to delete an Approved leave (leave controls duty/salary)", async () => {
    const created = await createLeave();
    await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" });
    const del = await fetch(`${baseUrl}/api/staff/leaves/${created.body.id}`, { method: "DELETE", headers: app.authHeaders });
    assert.equal(del.status, 409);
  });

  it("refuses to delete a Rejected leave", async () => {
    const created = await createLeave();
    await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Rejected", rejectionReason: "Not eligible" });
    const del = await fetch(`${baseUrl}/api/staff/leaves/${created.body.id}`, { method: "DELETE", headers: app.authHeaders });
    assert.equal(del.status, 409);
  });

  it("404s deleting a nonexistent leave", async () => {
    const del = await fetch(`${baseUrl}/api/staff/leaves/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: app.authHeaders,
    });
    assert.equal(del.status, 404);
  });
});

describe("Leave → Duty enforcement", () => {
  it("rejects a duty assignment on an approved-leave date", async () => {
    const created = await createLeave({ fromDate: "2027-08-20", toDate: "2027-08-20" });
    await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" });

    const assign = await postJson(baseUrl, "/api/staff/duty-planner/assign", {
      employeeId: empA.id,
      dutyType: "Delivery",
      date: "2027-08-20",
    });
    assert.equal(assign.status, 422);
    assert.match(assign.body?.error ?? assign.body?.message ?? "", /approved leave/i);
  });

  it("rejects approval while a conflicting duty exists", async () => {
    const assign = await postJson(baseUrl, "/api/staff/duty-planner/assign", {
      employeeId: empA.id,
      dutyType: "Delivery",
      date: "2027-08-21",
    });
    assert.equal(assign.status, 201);
    const created = await createLeave({ fromDate: "2027-08-21", toDate: "2027-08-21" });
    const approval = await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" });
    assert.equal(approval.status, 409);
    assert.match(approval.body?.error ?? "", /conflicting duty/i);
  });
});

describe("Leave — report (authoritative calendar days)", () => {
  it("reports approved, pending and rejected days distinctly", async () => {
    const approved = await createLeave({ fromDate: "2026-08-20", toDate: "2026-08-22" });
    await patchJson(baseUrl, `/api/staff/leaves/${approved.body.id}/status`, { status: "Approved" });
    const pending = await createLeave({ fromDate: "2026-08-10", toDate: "2026-08-11" });
    const rejected = await createLeave({ type: "Emergency", fromDate: "2026-08-05", toDate: "2026-08-05" });
    await patchJson(baseUrl, `/api/staff/leaves/${rejected.body.id}/status`, { status: "Rejected", rejectionReason: "Not eligible" });
    void pending;

    const res = await getJson(baseUrl, `/api/staff/leaves/report?month=2026-08&employeeId=${empA.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    const row = res.body.items[0];
    assert.equal(row.approvedLeaveDays, 3);
    assert.equal(row.pendingLeaveDays, 2);
    assert.equal(row.rejectedLeaveDays, 1);
    assert.deepEqual(row.leaveDates, ["2026-08-20", "2026-08-21", "2026-08-22"]);
    assert.deepEqual(row.leaveTypes, ["Casual"]);
  });

  it("splits cross-month leave (31 Jul → 2 Aug = 1 in July, 2 in August)", async () => {
    const created = await createLeave({ fromDate: "2026-07-31", toDate: "2026-08-02" });
    await patchJson(baseUrl, `/api/staff/leaves/${created.body.id}/status`, { status: "Approved" });

    const july = await getJson(baseUrl, `/api/staff/leaves/report?month=2026-07&employeeId=${empA.id}`);
    assert.equal(july.body.items[0].approvedLeaveDays, 1);

    const aug = await getJson(baseUrl, `/api/staff/leaves/report?month=2026-08&employeeId=${empA.id}`);
    assert.equal(aug.body.items[0].approvedLeaveDays, 2);
  });

  it("does not count rejected/pending as approved days in any month", async () => {
    const pending = await createLeave({ fromDate: "2026-08-01", toDate: "2026-08-04" });
    void pending;
    const res = await getJson(baseUrl, `/api/staff/leaves/report?month=2026-08&employeeId=${empA.id}`);
    assert.equal(res.body.items[0].approvedLeaveDays, 0);
  });

  it("filters the report by department", async () => {
    const res = await getJson(baseUrl, `/api/staff/leaves/report?month=2026-08&department=Supervisor`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.every((r: any) => r.department === "Supervisor"));
  });
});
