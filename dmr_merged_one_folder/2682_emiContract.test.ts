/**
 * Fleet EMI HTTP contract — matches the frontend-rewired /api/fleet/emis surface.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, postJson, putJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, shutdownTestEnv, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");

after(async () => {
  await shutdownTestEnv({ app, testDb, pool });
});

describe("Fleet EMI HTTP contract", () => {
  it("uses /emis (not /emi) and round-trips create/list/update/schedule/pay", async () => {
    const missing = await getJson(baseUrl, "/api/fleet/emi");
    assert.equal(missing.status, 404);

    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "EMI-HTTP-1",
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "EMIENG1",
      chassisNumber: "EMICHAS1",
      status: "Active",
    });

    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id,
      financeCompany: "HDFC Bank",
      loanAmount: 120000,
      totalEMIs: 12,
      startDate: "2026-08-01",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.vehicleId, vehicle.id);
    assert.equal(created.body.loanAmount, 120000);
    assert.equal(created.body.totalEMIs, 12);
    assert.equal(created.body.paidEMIs, 0);
    assert.equal(created.body.pendingEMIs, 12);
    assert.ok(created.body.nextEMIDate);
    assert.equal(created.body.emiAmount, 10000);
    const emiId = created.body.id;

    const listed = await getJson(baseUrl, "/api/fleet/emis");
    assert.equal(listed.status, 200);
    assert.ok(Array.isArray(listed.body));
    assert.ok(listed.body.some((row: { id: number }) => row.id === emiId));

    const updated = await putJson(baseUrl, `/api/fleet/emis/${emiId}`, {
      financeCompany: "ICICI Bank",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.financeCompany, "ICICI Bank");
    assert.equal(updated.body.paidEMIs, 0);

    const schedule = await getJson(baseUrl, `/api/fleet/emis/${emiId}/schedule`);
    assert.equal(schedule.status, 200);
    assert.equal(schedule.body.length, 12);
    assert.equal(schedule.body[0].installmentNo, 1);
    assert.equal(schedule.body[0].status, "pending");
    assert.equal(schedule.body[0].paidAt, null);

    const paid = await postJson(baseUrl, `/api/fleet/emis/${emiId}/pay`, {
      idempotencyKey: "emi-pay-http-1",
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.paidEMIs, 1);
    assert.equal(paid.body.pendingEMIs, 11);

    const afterPay = await getJson(baseUrl, `/api/fleet/emis/${emiId}/schedule`);
    assert.equal(afterPay.body[0].status, "paid");
    assert.ok(afterPay.body[0].paidAt);

    const wrongPay = await postJson(baseUrl, `/api/fleet/emi/${emiId}/payments`, {
      amount: 10000,
    });
    assert.equal(wrongPay.status, 404);

    const analytics = await getJson(
      baseUrl,
      "/api/fleet/analytics?fromDate=2026-08-01&toDate=2026-08-31"
    );
    assert.equal(analytics.status, 200);
    assert.ok(analytics.body.kpis);
    assert.ok(Array.isArray(analytics.body.weekly));
    assert.ok(Array.isArray(analytics.body.costCenters));
  });

  it("reuses an idempotency key instead of paying a second installment", async () => {
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: "EMI-IDEM-1",
      vehicleType: "Lorry",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "EMIENGIDEM1",
      chassisNumber: "EMICHASIDEM1",
      status: "Active",
    });
    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: vehicle.id,
      financeCompany: "Axis Bank",
      loanAmount: 24000,
      totalEMIs: 12,
      startDate: "2026-08-01",
    });
    assert.equal(created.status, 201);
    const emiId = created.body.id;
    const key = "retry-same-logical-payment";

    const first = await postJson(baseUrl, `/api/fleet/emis/${emiId}/pay`, {
      idempotencyKey: key,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.paidEMIs, 1);

    const retry = await postJson(baseUrl, `/api/fleet/emis/${emiId}/pay`, {
      idempotencyKey: key,
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.paidEMIs, 1);
    assert.equal(retry.body.pendingEMIs, 11);

    const concurrent = await Promise.all([
      postJson(baseUrl, `/api/fleet/emis/${emiId}/pay`, { idempotencyKey: "concurrent-a" }),
      postJson(baseUrl, `/api/fleet/emis/${emiId}/pay`, { idempotencyKey: "concurrent-a" }),
    ]);
    assert.equal(concurrent.every((response) => response.status === 200), true);
    assert.equal(concurrent.every((response) => response.body.paidEMIs === 2), true);

    const schedule = await getJson(baseUrl, `/api/fleet/emis/${emiId}/schedule`);
    const paidRows = schedule.body.filter((row: { status: string }) => row.status === "paid");
    assert.equal(paidRows.length, 2);
  });
});
