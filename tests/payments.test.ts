/**
 * Accounts → Payment Register service tests (real PostgreSQL via PGlite).
 *
 * Covers the production certification contract for /api/accounts/payments:
 *   • create issues permanent PAY-YYYYMMDD-NNN numbers (distinct, never reused)
 *   • update keeps the payment number stable and ignores number tampering
 *   • approval is a status update the server confirms
 *   • 10-day rule: records older than 10 days reject update AND delete with
 *     403 even when the caller bypasses the UI (the UI rule in
 *     frontend dateUtils.canEditItem/canDeleteItem is client-side only)
 *   • soft delete hides the row from normal reads; repeat delete is 404
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { paymentsService } = await import("../src/services/paymentsService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");

after(async () => {
  await testDb.close();
  await pool.end();
});

let seq = 0;
async function makePayment(paidTo: string) {
  seq += 1;
  return paymentsService.create({
    paymentDate: "2026-09-23",
    paymentType: "Office Expense",
    paidTo: `${paidTo} ${seq}`,
    amount: 100 + seq,
    paymentMode: "Cash",
    remarks: "cert-test",
    createdBy: "cert-test",
  });
}

async function backdateDays(id: number, days: number): Promise<void> {
  await pool.query(`UPDATE payments SET created_at = NOW() - ($1 || ' days')::interval WHERE id = $2`, [
    String(days),
    id,
  ]);
}

function statusOf(promise: Promise<unknown>): Promise<number | "ok"> {
  return promise.then(
    () => "ok" as const,
    (err: unknown) => (err instanceof AppError ? err.status : -1)
  );
}

describe("paymentsService — Payment Register production contract", () => {
  it("create issues distinct permanent numbers; update keeps the number", async () => {
    const a = await makePayment("Num A");
    const b = await makePayment("Num B");
    assert.match(a.paymentNo, /^PAY-20260923-\d{3}$/);
    assert.match(b.paymentNo, /^PAY-20260923-\d{3}$/);
    assert.notEqual(a.paymentNo, b.paymentNo);

    const updated = await paymentsService.update(a.id, { amount: 999 });
    assert.equal(updated.amount, 999);
    assert.equal(updated.paymentNo, a.paymentNo, "number never changes on update");

    const tampered = await paymentsService.update(a.id, {
      amount: 1000,
      paymentNo: "PAY-FAKE-001",
    } as unknown as Record<string, unknown>);
    assert.equal(tampered.paymentNo, a.paymentNo, "client-supplied number is ignored");
  });

  it("approval is a confirmed status update", async () => {
    const p = await makePayment("Approve Me");
    assert.equal(p.status, "Draft");
    const approved = await paymentsService.update(p.id, { status: "Approved" });
    assert.equal(approved.status, "Approved");
    assert.equal(approved.id, p.id);
  });

  it("10-day rule: old records reject update and delete with 403", async () => {
    const p = await makePayment("Old Timer");
    await backdateDays(p.id, 20);

    assert.equal(await statusOf(paymentsService.update(p.id, { amount: 5 })), 403);
    assert.equal(await statusOf(paymentsService.softDelete(p.id)), 403);

    const stillThere = await paymentsService.getById(p.id);
    assert.equal(stillThere.id, p.id, "blocked writes leave the record untouched");
  });

  it("fresh records update/delete; soft delete hides; repeat delete is 404", async () => {
    const p = await makePayment("Fresh Delete");
    const updated = await paymentsService.update(p.id, { remarks: "edited" });
    assert.equal(updated.remarks, "edited");

    const deleted = await paymentsService.softDelete(p.id);
    assert.equal(deleted.deleted, true);

    await assert.rejects(paymentsService.getById(p.id), (err: unknown) => err instanceof AppError);
    assert.equal(await statusOf(paymentsService.softDelete(p.id)), 404);

    const listed = await paymentsService.list({ search: "Fresh Delete" });
    assert.ok(Array.isArray(listed) && listed.length === 0, "soft-deleted hidden from normal list");
    const withDeleted = await paymentsService.list({ search: "Fresh Delete", includeDeleted: true });
    assert.ok(!Array.isArray(withDeleted) || withDeleted.length === 1);
  });
});
