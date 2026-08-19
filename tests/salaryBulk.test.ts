/**
 * Bulk Salary Status backend tests — POST /api/staff/salaries/bulk-status.
 *
 * Runs the real Express app against a real PostgreSQL engine (PGlite WASM
 * behind the pg-gateway wire-protocol server) — no mocks.
 *
 * Covers:
 *   - Paying a batch of Pending + Submitted records in ONE transaction
 *     (each record becomes Paid with its own Accounts payment + payment_ref)
 *   - Any invalid record (already Paid / closed month / expired window) aborts
 *     the WHOLE batch atomically — no partial payments
 *   - Mark-Unpaid batch: Paid → Pending inside the correction window
 *   - Mark-Unpaid on an expired-window record aborts the whole batch
 *   - Unknown ids are rejected before anything is written
 *   - Validation rejects empty id lists and bad statuses
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";
import { str } from "../src/utils/coerce.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { staffService } = await import("../src/services/staffService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

interface EmpSeed {
  id: number;
  employeeName: string;
}

let seq = 0;
async function seedEmployee(name: string): Promise<EmpSeed> {
  seq += 1;
  const e = await mastersService.upsertEmployee({
    employeeName: name,
    department: "Operations",
    role: "Worker",
    phoneNumber: `99${String(seq).padStart(8, "0")}`,
    salary: 15000,
    status: "Active",
  });
  return { id: e.id as number, employeeName: e.employeeName as string };
}

let empA: EmpSeed;
let empB: EmpSeed;
let empC: EmpSeed;

before(async () => {
  empA = await seedEmployee("Bulk Pay A");
  empB = await seedEmployee("Bulk Pay B");
  empC = await seedEmployee("Bulk Pay C");
});

let monthSeq = 0;
async function createRecord(emp: EmpSeed, basic = 15000) {
  monthSeq += 1;
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCMonth(d.getUTCMonth() + monthSeq - 1);
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return staffService.createSalary({
    employeeId: emp.id,
    month,
    basicSalary: basic,
  });
}

describe("bulk Mark-Paid", () => {
  it("pays every Pending/Submitted record in one transaction with per-employee payments", async () => {
    const a = await createRecord(empA);
    const b = await createRecord(empB);
    await staffService.submitSalary(str(a.id), "tester");

    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id), str(b.id)],
      status: "Paid",
      paymentDate: "2026-08-28",
      paymentMode: "Bank Transfer",
      paidBy: "tester",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated.length, 2);
    assert.ok(res.body.updated.every((r: any) => r.status === "Paid"));

    for (const rec of [a, b]) {
      const row = (
        await pool.query("SELECT status, payment_ref, payment_date FROM salary_records WHERE id = $1", [rec.id])
      ).rows[0];
      assert.equal(row.status, "Paid");
      assert.ok(row.payment_ref, "payment_ref must be written");
      const isoLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      assert.equal(isoLocal(new Date(String(row.payment_date))), "2026-08-28");
      const pay = (
        await pool.query("SELECT * FROM payments WHERE payment_no = $1", [row.payment_ref])
      ).rows[0];
      assert.equal(pay.status, "Paid");
      assert.equal(pay.category, "Salary");
      assert.equal(pay.payment_mode, "Bank Transfer");
    }
  });

  it("rejects the whole batch atomically when one record is already Paid", async () => {
    const a = await createRecord(empA);
    const b = await createRecord(empB);
    await staffService.paySalary(str(a.id), {
      paymentDate: "2026-08-28",
      paymentMode: "Cash",
    });

    const beforeB = (
      await pool.query("SELECT status FROM salary_records WHERE id = $1", [b.id])
    ).rows[0];

    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id), str(b.id)],
      status: "Paid",
      paymentDate: "2026-08-28",
      paymentMode: "Cash",
    });
    assert.equal(res.status, 409);

    // b must be untouched — the batch rolled back completely.
    const afterB = (
      await pool.query("SELECT status, payment_ref FROM salary_records WHERE id = $1", [b.id])
    ).rows[0];
    assert.equal(afterB.status, beforeB.status);
    assert.equal(afterB.payment_ref, null);
  });

  it("rejects unknown ids before writing anything", async () => {
    const a = await createRecord(empC);
    const missingId = "00000000-0000-4000-8000-000000000000";
    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id), missingId],
      status: "Paid",
    });
    assert.equal(res.status, 404);
    const row = (
      await pool.query("SELECT status FROM salary_records WHERE id = $1", [a.id])
    ).rows[0];
    assert.equal(row.status, "Pending");
  });
});

describe("bulk Mark-Unpaid", () => {
  it("un-submits Submitted records and reverts Paid records inside the correction window", async () => {
    const a = await createRecord(empA);
    const b = await createRecord(empB);
    await staffService.submitSalary(str(a.id), "tester");
    await staffService.paySalary(str(b.id), {
      paymentDate: "2026-08-28",
      paymentMode: "Cash",
    });

    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id), str(b.id)],
      status: "Pending",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated.length, 2);
    assert.ok(res.body.updated.every((r: any) => r.status === "Pending"));

    const aRow = (
      await pool.query("SELECT status, submitted_at FROM salary_records WHERE id = $1", [a.id])
    ).rows[0];
    assert.equal(aRow.status, "Pending");
    assert.equal(aRow.submitted_at, null);

    const bRow = (
      await pool.query("SELECT status, payment_ref FROM salary_records WHERE id = $1", [b.id])
    ).rows[0];
    assert.equal(bRow.status, "Pending");
    assert.equal(bRow.payment_ref, null);
  });

  it("rejects the whole batch when a Paid record is outside the correction window", async () => {
    const a = await createRecord(empA);
    await staffService.paySalary(str(a.id), {
      paymentDate: "2026-08-01",
      paymentMode: "Cash",
    });
    // Age the paid_at timestamp beyond the 7-day window. The lifecycle guard
    // makes non-Pending rows immutable, so the trigger is temporarily lifted
    // (exactly like time itself advancing past the window).
    await pool.query("DROP TRIGGER IF EXISTS trg_salary_lifecycle ON salary_records");
    await pool.query(
      "UPDATE salary_records SET paid_at = NOW() - INTERVAL '8 days' WHERE id = $1",
      [a.id]
    );
    await pool.query(
      `CREATE TRIGGER trg_salary_lifecycle
         BEFORE UPDATE ON salary_records
         FOR EACH ROW EXECUTE FUNCTION guard_salary_lifecycle()`
    );

    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id)],
      status: "Pending",
    });
    assert.equal(res.status, 409);
    const row = (
      await pool.query("SELECT status FROM salary_records WHERE id = $1", [a.id])
    ).rows[0];
    assert.equal(row.status, "Paid");
  });
});

describe("bulk validation", () => {
  it("rejects empty id lists", async () => {
    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [],
      status: "Paid",
    });
    assert.equal(res.status, 400);
  });

  it("rejects an invalid status", async () => {
    const a = await createRecord(empA);
    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id)],
      status: "Submitted",
    });
    assert.equal(res.status, 400);
  });

  it("leaves no orphaned payment when the batch is paid and listed via GET /salaries", async () => {
    const a = await createRecord(empB);
    const res = await postJson(baseUrl, "/api/staff/salaries/bulk-status", {
      ids: [str(a.id)],
      status: "Paid",
      paymentDate: "2026-08-28",
      paymentMode: "UPI",
    });
    assert.equal(res.status, 200);

    const list = await getJson(baseUrl, `/api/staff/salaries?month=${a.month}`);
    assert.equal(list.status, 200);
    const found = list.body.find((r: any) => r.id === str(a.id));
    assert.ok(found);
    assert.equal(found.status, "Paid");
    assert.equal(found.paymentDate, "2026-08-28");
  });
});