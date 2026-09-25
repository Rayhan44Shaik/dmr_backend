/**
 * Fleet → EMI — production contract against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP → vehicleEmiService → PostgreSQL → HTTP.
 *
 * Covers the exact backend DTO the EMI page consumes:
 *   create / update / list (+filters) / schedule / pay / delete,
 *   flat-principal calculations (emiAmount = round(loan/total), schedule
 *   sums to the loan), validation rejections, duplicate prevention (409),
 *   payment idempotency, schedule-preserving updates, and authorization.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { getJson, postJson, putJson, startApp, type TestApp } from "./helpers/app.js";
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

let seq = 0;
const TODAY = new Date().toISOString().slice(0, 10);

async function seedVehicle(tag: string) {
  seq += 1;
  return mastersService.upsertVehicle({
    vehicleNumber: `EMI${tag}${String(seq).padStart(4, "0")}`,
    vehicleType: "Lorry",
    noOfBoxes: 80,
    birdCapacity: 800,
    capacityKg: 2000,
    engineNumber: `EMIENG${tag}${seq}`,
    chassisNumber: `EMICHS${tag}${seq}`,
    status: "Active",
  });
}

async function deleteJson(apiPath: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...app.authHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("EMI lifecycle on real PostgreSQL", () => {
  it("creates a record with derived schedule fields and a persisted schedule", async () => {
    const vehicle = await seedVehicle("C");
    const { status, body } = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id,
      financeCompany: "HDFC Bank",
      loanAmount: 120000,
      totalEMIs: 12,
      startDate: TODAY,
    });
    assert.equal(status, 201);
    assert.equal(body.vehicleId, vehicle.id);
    assert.equal(body.vehicleNo, vehicle.vehicleNumber);
    assert.equal(body.financeCompany, "HDFC Bank");
    assert.equal(Number(body.emiAmount), 10000, "flat-principal: round(120000/12)");
    assert.equal(body.totalEMIs, 12);
    assert.equal(body.paidEMIs, 0);
    assert.equal(body.pendingEMIs, 12);
    assert.equal(body.nextEMIDate, TODAY, "first due date is the start month occurrence");
    assert.equal(body.status, "active");

    const sched = await getJson(baseUrl, `/api/fleet/emis/${body.id}/schedule`);
    assert.equal(sched.status, 200);
    assert.equal(sched.body.length, 12);
    const sum = sched.body.reduce((n: number, r: { amount: number }) => n + Number(r.amount), 0);
    assert.equal(sum, 120000, "schedule amounts sum exactly to the loan");
    assert.ok(sched.body.every((r: { status: string }) => r.status === "pending"));

    const dbRows = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount),0)::float AS s FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`,
      [body.id]
    );
    assert.equal(dbRows.rows[0].c, 12);
    assert.equal(dbRows.rows[0].s, 120000);
  });

  it("rejects a second EMI for the same vehicle and an unknown vehicle", async () => {
    const vehicle = await seedVehicle("D");
    const first = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "Bank", loanAmount: 60000, totalEMIs: 6, startDate: TODAY,
    });
    assert.equal(first.status, 201);
    const dup = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "Other", loanAmount: 10000, totalEMIs: 2, startDate: TODAY,
    });
    assert.equal(dup.status, 409);
    const unknown = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: 99999999, financeCompany: "X", loanAmount: 1000, totalEMIs: 2, startDate: TODAY,
    });
    assert.equal(unknown.status, 422);
  });

  it("validates create bodies and the payment idempotency key", async () => {
    const vehicle = await seedVehicle("V");
    for (const body of [
      {},
      { vehicleId: vehicle.id, loanAmount: 1000, totalEMIs: 2, startDate: TODAY },
      { vehicleId: vehicle.id, financeCompany: "B", loanAmount: 0, totalEMIs: 2, startDate: TODAY },
      { vehicleId: vehicle.id, financeCompany: "B", loanAmount: -5, totalEMIs: 2, startDate: TODAY },
      { vehicleId: vehicle.id, financeCompany: "B", loanAmount: 1000, totalEMIs: 0, startDate: TODAY },
      { vehicleId: vehicle.id, financeCompany: "B", loanAmount: 1000, totalEMIs: 2, startDate: "2026-13-40" },
    ]) {
      const res = await postJson(baseUrl, "/api/fleet/emis", body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "B", loanAmount: 3000, totalEMIs: 3, startDate: TODAY,
    });
    assert.equal(created.status, 201);
    assert.equal((await postJson(baseUrl, `/api/fleet/emis/${created.body.id}/pay`, {})).status, 400);
    assert.equal((await postJson(baseUrl, `/api/fleet/emis/${created.body.id}/pay`, { idempotencyKey: "nope" })).status, 400);
    assert.equal((await postJson(baseUrl, "/api/fleet/emis/99999999/pay", { idempotencyKey: randomUUID() })).status, 404);
  });

  it("lists with vehicle/status/search filters and resolves by vehicle", async () => {
    const past = await seedVehicle("P");
    const current = await seedVehicle("Q");
    const oldLoan = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: past.id, financeCompany: "Old Bank", loanAmount: 24000, totalEMIs: 12, startDate: "2020-01-05",
    });
    assert.equal(oldLoan.status, 201);
    assert.equal(oldLoan.body.status, "overdue", "past-dated start surfaces as overdue");
    const newLoan = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: current.id, financeCompany: "New Bank", loanAmount: 24000, totalEMIs: 12, startDate: TODAY,
    });
    assert.equal(newLoan.status, 201);

    const all = await getJson(baseUrl, "/api/fleet/emis");
    assert.equal(all.status, 200);
    assert.ok(all.body.some((r: { id: number }) => r.id === oldLoan.body.id));
    assert.ok(all.body.some((r: { id: number }) => r.id === newLoan.body.id));

    const byVehicle = await getJson(baseUrl, `/api/fleet/emis?vehicleId=${past.id}`);
    assert.ok(byVehicle.body.length >= 1 && byVehicle.body.every((r: { vehicleId: number }) => r.vehicleId === past.id));

    const byStatus = await getJson(baseUrl, "/api/fleet/emis?status=overdue");
    assert.ok(byStatus.body.some((r: { id: number }) => r.id === oldLoan.body.id));
    assert.ok(!byStatus.body.some((r: { id: number }) => r.id === newLoan.body.id), "no duplicate counting across filters");

    const bySearch = await getJson(baseUrl, `/api/fleet/emis?search=${encodeURIComponent(past.vehicleNumber)}`);
    assert.ok(bySearch.body.some((r: { id: number }) => r.id === oldLoan.body.id));

    const one = await getJson(baseUrl, `/api/fleet/emis/${newLoan.body.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.vehicleNo, current.vehicleNumber);
    const byVeh = await getJson(baseUrl, `/api/fleet/emis/vehicle/${current.id}`);
    assert.equal(byVeh.status, 200);
    assert.equal(byVeh.body.id, newLoan.body.id);
    assert.equal((await getJson(baseUrl, "/api/fleet/emis/99999999")).status, 404);
    assert.equal((await getJson(baseUrl, "/api/fleet/emis/vehicle/99999999")).status, 404);
  });

  it("pays installments idempotently and closes the loan exactly once", async () => {
    const vehicle = await seedVehicle("Y");
    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "Pay Bank", loanAmount: 3000, totalEMIs: 3, startDate: TODAY,
    });
    const id = created.body.id;
    const key = randomUUID();
    const pay1 = await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: key });
    assert.equal(pay1.status, 200);
    assert.equal(pay1.body.paidEMIs, 1);
    assert.equal(pay1.body.pendingEMIs, 2);
    const replay = await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: key });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.paidEMIs, 1, "same key never double-pays");
    assert.equal((await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: randomUUID() })).body.paidEMIs, 2);
    const last = await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: randomUUID() });
    assert.equal(last.body.paidEMIs, 3);
    assert.equal(last.body.pendingEMIs, 0);
    assert.equal(last.body.status, "paid");
    assert.equal(last.body.nextEMIDate, null);
    assert.equal((await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: randomUUID() })).status, 409);

    const dbPaid = await pool.query(
      `SELECT COUNT(*)::int AS c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1 AND status = 'paid'`,
      [id]
    );
    assert.equal(dbPaid.rows[0].c, 3);
  });

  it("updates finance-only fields without touching the schedule, and regenerates it on term changes", async () => {
    const vehicle = await seedVehicle("U");
    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "Old Name", loanAmount: 12000, totalEMIs: 12, startDate: TODAY,
    });
    const id = created.body.id;
    await postJson(baseUrl, `/api/fleet/emis/${id}/pay`, { idempotencyKey: randomUUID() });

    const renamed = await putJson(baseUrl, `/api/fleet/emis/${id}`, { financeCompany: "New Name" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.financeCompany, "New Name");
    assert.equal(renamed.body.paidEMIs, 1, "paid history survives a finance-only update");
    const schedKept = await getJson(baseUrl, `/api/fleet/emis/${id}/schedule`);
    assert.equal(schedKept.body.length, 12);
    assert.equal(schedKept.body.filter((r: { status: string }) => r.status === "paid").length, 1);

    const retermed = await putJson(baseUrl, `/api/fleet/emis/${id}`, { loanAmount: 24000, totalEMIs: 24 });
    assert.equal(retermed.status, 200);
    assert.equal(Number(retermed.body.emiAmount), 1000);
    assert.equal(retermed.body.paidEMIs, 1, "paid count preserved across regeneration");
    const schedNew = await getJson(baseUrl, `/api/fleet/emis/${id}/schedule`);
    assert.equal(schedNew.body.length, 24);
    const sum = schedNew.body.reduce((n: number, r: { amount: number }) => n + Number(r.amount), 0);
    assert.equal(sum, 24000);

    assert.equal((await putJson(baseUrl, "/api/fleet/emis/99999999", { financeCompany: "Nope" })).status, 404);
    assert.equal((await putJson(baseUrl, `/api/fleet/emis/${id}`, { totalEMIs: -3 })).status, 400);
  });

  it("deletes the record with its schedule and requires authorization", async () => {
    const vehicle = await seedVehicle("Z");
    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id, financeCompany: "Del Bank", loanAmount: 6000, totalEMIs: 6, startDate: TODAY,
    });
    const id = created.body.id;
    const removed = await deleteJson(`/api/fleet/emis/${id}`);
    assert.equal(removed.status, 200);
    assert.equal((await getJson(baseUrl, `/api/fleet/emis/${id}`)).status, 404);
    assert.equal((await getJson(baseUrl, `/api/fleet/emis/${id}/schedule`)).status, 404);
    const leftovers = await pool.query(`SELECT COUNT(*)::int AS c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [id]);
    assert.equal(leftovers.rows[0].c, 0, "schedule follows via ON DELETE CASCADE");

    const anon = await fetch(`${baseUrl}/api/fleet/emis`);
    assert.equal(anon.status, 401);
    const anonPost = await fetch(`${baseUrl}/api/fleet/emis`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(anonPost.status, 401);
  });
});
