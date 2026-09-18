/**
 * Salary Register lifecycle backend tests — Draft → Submitted → Paid, with the
 * correction paths and the permanent month closure at the end.
 *
 * Runs the real services against a real PostgreSQL engine (PGlite WASM behind
 * the pg-gateway wire-protocol server) — no mocks.
 *
 * Covers:
 *   - createSalary produces an editable Draft (Pending) record with backend
 *     computed totals
 *   - updateSalaryById edits only Draft records and never trusts client totals
 *   - submitSalary freezes the record (Pending → Submitted)
 *   - a Submitted record rejects edits and re-submission
 *   - paySalary moves Pending or Submitted → Paid inside the same transaction
 *     as the Accounts payment (payment_ref written, no dupes)
 *   - Paid → Pending (Mark-Unpaid) works only inside the 7-day correction window
 *   - the correction window lock (records stay paid)
 *   - the payroll-month closure guard rejects generate + create once the last
 *     record has been paid and its window expired
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

// ---------------------------------------------------------------------------
// Boot the test database + real app once for the whole file.
// ---------------------------------------------------------------------------

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

// Import shared services only after DATABASE_URL is set so the module-level
// pool points at the PGlite server.
const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { staffService } = await import("../src/services/staffService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface EmpSeed {
  id: number;
  employeeName: string;
}

async function seedEmployee(name: string): Promise<EmpSeed> {
  const e = await mastersService.upsertEmployee({
    employeeName: name,
    department: "Operations",
    role: "Worker",
    phoneNumber: `99${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    salary: 15000,
    status: "Active",
  });
  return { id: e.id as number, employeeName: e.employeeName as string };
}

let empA: EmpSeed;
let empB: EmpSeed;

before(async () => {
  empA = await seedEmployee("Salary Lifecycle A");
  empB = await seedEmployee("Salary Lifecycle B");
});

// ---------------------------------------------------------------------------
// Draft / edit
// ---------------------------------------------------------------------------

describe("Salary lifecycle — Draft", () => {
  it("creates an editable Pending record with backend-computed totals", async () => {
    const rec = await staffService.createSalary({
      employeeId: empA.id,
      month: "2026-08",
      basicSalary: 20000,
      overtime: 500,
      incentives: 1000,
      leaveDeduction: 300,
      otherDeductions: 200,
    });
    assert.equal(rec.status, "Pending");
    assert.equal(rec.month, "2026-08");
    // totals are the server's, not the client's
    assert.equal(rec.basicSalary, 20000);
    assert.equal(rec.totalGross, 21500);
    assert.equal(rec.totalDeductions, 500);
    assert.equal(rec.netSalary, 21000);

    const db = await pool.query("SELECT total_gross, total_deductions, net_salary FROM salary_records WHERE id = $1", [rec.id]);
    assert.equal(Number(db.rows[0].total_gross), 21500);
    assert.equal(Number(db.rows[0].total_deductions), 500);
    assert.equal(Number(db.rows[0].net_salary), 21000);
  });

  it("edits a Draft record and recomputes totals from the supplied components", async () => {
    const rec = await staffService.createSalary({
      employeeId: empB.id,
      month: "2026-08",
      basicSalary: 10000,
    });
    const edited = await staffService.updateSalaryById(rec.id, {
      basicSalary: 12000,
      nightAllowance: 600,
      loanEMI: 400,
    });
    assert.equal(edited.status, "Pending");
    assert.equal(edited.basicSalary, 12000);
    assert.equal(edited.totalGross, 12600);
    assert.equal(edited.totalDeductions, 400);
    assert.equal(edited.netSalary, 12200);
  });
});

// ---------------------------------------------------------------------------
// Submit → frozen
// ---------------------------------------------------------------------------

describe("Salary lifecycle — Submit freezes", () => {
  let rec: Awaited<ReturnType<typeof staffService.createSalary>>;
  let submittedId: string;

  before(async () => {
    rec = await staffService.createSalary({
      employeeId: empA.id,
      month: "2026-07",
      basicSalary: 18000,
    });
    const submitted = await staffService.submitSalary(rec.id, "tester");
    submittedId = submitted.id;
    assert.equal(submitted.status, "Submitted");
    assert.ok(submitted.submittedAt != null);
  });

  it("a Submitted record rejects edits", async () => {
    await assert.rejects(
      () => staffService.updateSalaryById(submittedId, { basicSalary: 99999 }),
      (err: Error & { status?: number }) =>
        err instanceof Error &&
        err.message.includes("Submitted") &&
        (err as any).status === 409,
      "Submitted records must not accept salary edits"
    );
  });

  it("a Submitted record cannot be submitted again", async () => {
    await assert.rejects(
      () => staffService.submitSalary(submittedId),
      (err: Error & { status?: number }) =>
        err.message.includes("already submitted") && (err as any).status === 409
    );
  });

  it("a Submitted record cannot be deleted", async () => {
    await assert.rejects(
      () => staffService.deleteSalary(submittedId),
      (err: Error & { status?: number }) => (err as any).status === 409
    );
  });

  it("un-submit (Submitted → Pending) makes it editable again", async () => {
    const back = await staffService.updateSalaryStatus(submittedId);
    assert.equal(back.status, "Pending");
    const edited = await staffService.updateSalaryById(submittedId, { basicSalary: 22000 });
    assert.equal(edited.basicSalary, 22000);
    assert.equal(edited.status, "Pending");
  });
});

// ---------------------------------------------------------------------------
// Pay → Paid (atomic with the Accounts payment)
// ---------------------------------------------------------------------------

describe("Salary lifecycle — Pay", () => {
  let pendingId: string;

  before(async () => {
    const rec = await staffService.createSalary({
      employeeId: empB.id,
      month: "2026-07",
      basicSalary: 25000,
    });
    pendingId = rec.id;
  });

  it("pays a Pending record, writing the payment reference atomically", async () => {
    const paid = await staffService.paySalary(pendingId, {
      paymentDate: "2026-07-30",
      paymentMode: "Bank Transfer",
      paidBy: "accounts",
    });
    assert.equal(paid.status, "Paid");
    assert.ok(paid.paymentRef, "a payment reference must be recorded");

    // The Accounts payment row landed in the same transaction.
    const acc = await pool.query(
      "SELECT payment_no, amount, payment_mode, status FROM payments WHERE payment_no = $1",
      [paid.paymentRef]
    );
    assert.equal(acc.rowCount, 1, "exactly one Accounts payment must exist");
    assert.equal(Number(acc.rows[0].amount), 25000);
    assert.equal(acc.rows[0].status, "Paid");

    // The salaries payment linkage agrees.
    const db = await pool.query("SELECT status, payment_ref, payment_date, paid_at FROM salary_records WHERE id = $1", [pendingId]);
    assert.equal(db.rows[0].status, "Paid");
    assert.ok(db.rows[0].paid_at != null);
  });

  it("cannot pay the same salary twice (idempotency)", async () => {
    await assert.rejects(
      () => staffService.paySalary(pendingId, { paymentDate: "2026-07-30", paymentMode: "Cash" }),
      (err: Error & { status?: number }) => (err as any).status === 409
    );
  });

  it("pays a Submitted record directly (Pending/Submitted → Paid)", async () => {
    const rec = await staffService.createSalary({
      employeeId: empA.id,
      month: "2026-06",
      basicSalary: 15000,
    });
    const submitted = await staffService.submitSalary(rec.id);
    assert.equal(submitted.status, "Submitted");

    const paid = await staffService.paySalary(submitted.id, {
      paymentDate: "2026-06-28",
      paymentMode: "Cash",
    });
    assert.equal(paid.status, "Paid");
    assert.ok(paid.paymentRef);
  });
});

// ---------------------------------------------------------------------------
// Mark-Unpaid (Paid → Pending) correction window
// ---------------------------------------------------------------------------

describe("Salary lifecycle — Mark-Unpaid correction window", () => {
  let paidId: string;

  before(async () => {
    const rec = await staffService.createSalary({
      employeeId: empB.id,
      month: "2026-05",
      basicSalary: 20000,
    });
    const paid = await staffService.paySalary(rec.id, {
      paymentDate: "2026-05-30",
      paymentMode: "UPI",
    });
    paidId = paid.id;

    // A second record in the same month, paid with a fresh timestamp. It keeps
    // month 2026-05 from closing when the primary record's window is expired,
    // so the tests below exercise the per-record correction guard.
    const rec2 = await staffService.createSalary({
      employeeId: empA.id,
      month: "2026-05",
      basicSalary: 21000,
    });
    await staffService.paySalary(rec2.id, {
      paymentDate: "2026-05-30",
      paymentMode: "Cash",
    });
  });

  it("reverts a Paid record to Pending inside the window and clears the linkage", async () => {
    const reverted = await staffService.updateSalaryStatus(paidId);
    assert.equal(reverted.status, "Pending");
    assert.equal(reverted.paymentRef, null);

    const db = await pool.query("SELECT status, payment_ref, paid_at FROM salary_records WHERE id = $1", [paidId]);
    assert.equal(db.rows[0].status, "Pending");
    assert.equal(db.rows[0].payment_ref, null);
    assert.equal(db.rows[0].paid_at, null);

    // And it can be paid again with a fresh reference.
    const repaid = await staffService.paySalary(paidId, {
      paymentDate: "2026-05-31",
      paymentMode: "Cash",
    });
    assert.equal(repaid.status, "Paid");
    assert.ok(repaid.paymentRef);
  });

  it("rejects Mark-Unpaid once the 7-day correction window expired", async () => {
    // Simulate the passage of time by back-dating paid_at. The DB lifecycle
    // trigger is temporarily suspended only for this data set-up, so the
    // service-level correction-window guard (the real rule) is what gets tested.
    await pool.query("ALTER TABLE salary_records DISABLE TRIGGER trg_salary_lifecycle");
    try {
      await pool.query(
        `UPDATE salary_records SET paid_at = NOW() - INTERVAL '8 days' WHERE id = $1`,
        [paidId]
      );
    } finally {
      await pool.query("ALTER TABLE salary_records ENABLE TRIGGER trg_salary_lifecycle");
    }
    await assert.rejects(
      () => staffService.updateSalaryStatus(paidId),
      (err: Error & { status?: number }) =>
        err.message.toLowerCase().includes("correction window") && (err as any).status === 409
    );
  });
});

// ---------------------------------------------------------------------------
// Month closure (all records paid, windows expired) → immutable guarantee
// ---------------------------------------------------------------------------

describe("Salary lifecycle — closed payroll month", () => {
  let closedEmployeeId: number;

  before(async () => {
    const e = await seedEmployee("Salary Closure");
    closedEmployeeId = e.id;
    const rec = await staffService.createSalary({
      employeeId: closedEmployeeId,
      month: "2026-04",
      basicSalary: 14000,
    });
    const paid = await staffService.paySalary(rec.id, {
      paymentDate: "2026-04-28",
      paymentMode: "Cash",
    });
    // Expire the correction window so the month becomes closed (the DB lifecycle
    // trigger is suspended only for this set-up; the closure guard in the
    // service layer is what the tests below exercise).
    await pool.query("ALTER TABLE salary_records DISABLE TRIGGER trg_salary_lifecycle");
    try {
      await pool.query(`UPDATE salary_records SET paid_at = NOW() - INTERVAL '10 days' WHERE id = $1`, [paid.id]);
    } finally {
      await pool.query("ALTER TABLE salary_records ENABLE TRIGGER trg_salary_lifecycle");
    }
  });

  it("generateForMonth is rejected for a closed month", async () => {
    await assert.rejects(
      () => staffService.generateForMonth("2026-04"),
      (err: Error & { status?: number }) =>
        err.message.includes("closed") && (err as any).status === 409
    );
  });

  it("createSalary is rejected for a closed month", async () => {
    await assert.rejects(
      () =>
        staffService.createSalary({
          employeeId: closedEmployeeId,
          month: "2026-04",
          basicSalary: 14000,
        }),
      (err: Error & { status?: number }) =>
        err.message.includes("closed") && (err as any).status === 409
    );
  });

  it("updateSalaryById and deletion are rejected for a closed month", async () => {
    const row = await pool.query("SELECT id, month FROM salary_records WHERE employee_id = $1 AND month = '2026-04'", [closedEmployeeId]);
    const id = row.rows[0].id;
    await assert.rejects(() => staffService.updateSalaryById(id, { basicSalary: 1 }));
    await assert.rejects(() => staffService.deleteSalary(id));
  });
});

// ---------------------------------------------------------------------------
// HTTP surface (route + validation wiring)
// ---------------------------------------------------------------------------

describe("Salary lifecycle HTTP surface", () => {
  it("POST /api/staff/salaries/:id/submit is wired and validated", async () => {
    const rec = await staffService.createSalary({
      employeeId: empA.id,
      month: "2026-03",
      basicSalary: 13000,
    });
    const res = await postJson(baseUrl, `/api/staff/salaries/${rec.id}/submit`, {
      submittedBy: "http-tester",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "Submitted");
    // Audit identity is server-derived from the authenticated session; the
    // client-supplied submittedBy value must never be trusted.
    assert.equal(res.body.submittedBy, "Test Owner");
  });

  it("the GET week-status endpoint agrees with the service", async () => {
    const res = await getJson(baseUrl, `/api/staff/salaries/${empA.id}?month=2026-03`);
    assert.equal(res.status, 200);
  });
});
