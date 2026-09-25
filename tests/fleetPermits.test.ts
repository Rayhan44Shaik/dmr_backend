/**
 * Fleet → Permits — production coverage against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP → vehiclePermitService → PostgreSQL → HTTP.
 *
 * Covers the existing /api/fleet/permits contract:
 *   • upsert renewal per (vehicle, doc_type) with DB-level uniqueness
 *   • doc-type and date-range validation (400)
 *   • list, summary buckets, missing-scan 404
 *   • hard-delete and repeat-delete 404
 *   • authorization (401 without a session)
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, putJson, startApp, type TestApp } from "./helpers/app.js";
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
const FUTURE = (() => { const d = new Date(); d.setDate(d.getDate() + 180); return d.toISOString().slice(0, 10); })();

async function deleteJson(apiPath: string) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "DELETE",
    headers: { ...app.authHeaders },
  });
  return { status: res.status, body: await res.json() };
}

describe("Fleet permits", () => {
  it("1. renewal upserts one row per (vehicle, doc_type)", async () => {
    seq += 1;
    const vehicle = await mastersService.upsertVehicle({
      vehicleNumber: `FPV${String(seq).padStart(4, "0")}`,
      vehicleType: "Truck",
      noOfBoxes: 10,
      birdCapacity: 100,
      capacityKg: 500,
      engineNumber: `FPENG${seq}`,
      chassisNumber: `FPCHS${seq}`,
      status: "Active",
    });
    const first = await putJson(baseUrl, `/api/fleet/permits/${vehicle.id}/insurance`, {
      expiryDate: FUTURE, validFrom: TODAY, documentNumber: "T-INS-1",
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.expiryDate, FUTURE);
    assert.equal(first.body.vehicleId, vehicle.id);
    assert.equal(first.body.docType, "insurance");

    const second = await putJson(baseUrl, `/api/fleet/permits/${vehicle.id}/insurance`, {
      expiryDate: FUTURE, documentNumber: "T-INS-2",
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id, "same (vehicle, docType) updates the same row");
    assert.equal(second.body.documentNumber, "T-INS-2");

    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM vehicle_permit_documents WHERE vehicle_id = $1 AND doc_type = 'insurance'`,
      [vehicle.id]
    );
    assert.equal(count.rows[0].c, 1);

    const fitness = await putJson(baseUrl, `/api/fleet/permits/${vehicle.id}/fitness`, {
      expiryDate: FUTURE, documentNumber: "T-FIT-1",
    });
    assert.equal(fitness.status, 200);
    assert.notEqual(fitness.body.id, first.body.id, "a different doc type is a different row");
  });

  it("2. rejects unknown doc types and inverted date ranges", async () => {
    const badType = await putJson(baseUrl, "/api/fleet/permits/1/visa", { expiryDate: FUTURE });
    assert.equal(badType.status, 400);
    const badRange = await putJson(baseUrl, "/api/fleet/permits/1/insurance", { validFrom: FUTURE, expiryDate: TODAY });
    assert.equal(badRange.status, 400);
  });

  it("3. list, summary, missing scan and delete lifecycle", async () => {
    const listed = await getJson(baseUrl, "/api/fleet/permits");
    assert.equal(listed.status, 200);
    assert.ok(Array.isArray(listed.body) && listed.body.length >= 2);
    const insurance = listed.body.find((r: { docType: string }) => r.docType === "insurance");
    assert.ok(insurance, "renewed row visible in the list");

    const summary = await getJson(baseUrl, "/api/fleet/permits/summary");
    assert.equal(summary.status, 200);
    assert.equal(typeof summary.body.total, "number");
    assert.ok(summary.body.byType?.insurance, "summary buckets by doc type");

    const noScan = await fetch(
      `${baseUrl}/api/fleet/permits/${insurance.vehicleId}/insurance/document`,
      { headers: app.authHeaders }
    );
    assert.equal(noScan.status, 404);

    assert.equal((await deleteJson(`/api/fleet/permits/${insurance.vehicleId}/insurance`)).status, 200);
    assert.equal((await deleteJson(`/api/fleet/permits/${insurance.vehicleId}/insurance`)).status, 404);
  });

  it("4. permits require authorization", async () => {
    const anon = await fetch(`${baseUrl}/api/fleet/permits`);
    assert.equal(anon.status, 401);
  });
});
