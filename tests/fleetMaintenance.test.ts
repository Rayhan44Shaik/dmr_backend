/**
 * Fleet → Maintenance — production coverage against a real PostgreSQL engine
 * (PGlite behind pg-gateway; same harness as the other backend suites).
 * No mocks: HTTP (multipart + JSON) → fleetMaintenanceService → PostgreSQL.
 *
 * Covers the existing /api/fleet/maintenance contract:
 *   • multipart create with derived totals + server bill numbering
 *   • idempotent replay by idempotencyKey (no duplicate rows)
 *   • validation rejections (400) and id guards
 *   • update + cross-record meter guards (422)
 *   • approve / reject state machine (409 on illegal transitions)
 *   • document metadata, binary serving headers, last-document guard
 *   • pagination / filters / search, soft-delete lifecycle
 *   • authorization (401 without a session)
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
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);

async function seedVehicle(tag: string) {
  seq += 1;
  return mastersService.upsertVehicle({
    vehicleNumber: `FMV${tag}${String(seq).padStart(4, "0")}`,
    vehicleType: "Truck",
    noOfBoxes: 10,
    birdCapacity: 100,
    capacityKg: 500,
    engineNumber: `FMENG${tag}${seq}`,
    chassisNumber: `FMCHS${tag}${seq}`,
    status: "Active",
  });
}

async function seedDriver(tag: string) {
  seq += 1;
  return mastersService.upsertEmployee({
    employeeName: `FM Drv ${tag}${seq}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9191${String(seq).padStart(6, "0")}`,
    licenseNumber: `FMDL${tag}${seq}`,
    salary: 18000,
    status: "Active",
  });
}

function maintForm(fields: Record<string, unknown>, docs = 1): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === "") continue;
    if (k === "maintenanceType" || k === "parts") form.append(k, JSON.stringify(v));
    else form.append(k, String(v));
  }
  for (let i = 0; i < docs; i += 1) {
    form.append("documents", new Blob([PNG], { type: "image/png" }), `bill${i}.png`);
  }
  return form;
}

async function postForm(apiPath: string, form: FormData) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "POST",
    headers: { ...app.authHeaders },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function putForm(apiPath: string, form: FormData) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "PUT",
    headers: { ...app.authHeaders },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function deleteJson(apiPath: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...app.authHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function rowsOf(list: { status: number; body: unknown }): Record<string, unknown>[] {
  const body = list.body as { data?: unknown } | unknown[];
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  return (body as { data: Record<string, unknown>[] }).data;
}

describe("Fleet maintenance", () => {
  it("1. creates with a server bill number and parts-derived total", async () => {
    const vehicle = await seedVehicle("C");
    const driver = await seedDriver("C");
    const key = randomUUID();
    const { status, body } = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 50000,
      maintenanceType: ["Engine"], serviceType: "General", garage: "G1",
      idempotencyKey: key, parts: [{ name: "Oil", quantity: 2, rate: 100 }],
    }));
    assert.equal(status, 201);
    assert.match(body.billNo, /^MNT-/);
    assert.equal(Number(body.totalCost), 200);
    assert.equal(body.vehicleId, vehicle.id);

    const replay = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 50000,
      maintenanceType: ["Engine"], serviceType: "General", garage: "G1",
      idempotencyKey: key, parts: [{ name: "Oil", quantity: 2, rate: 100 }],
    }));
    assert.equal(replay.status, 201);
    assert.equal(replay.body.id, body.id, "same key replays the same row");
    const count = await pool.query(`SELECT COUNT(*)::int AS c FROM fleet_maintenance WHERE request_id = $1::uuid`, [key]);
    assert.equal(count.rows[0].c, 1);
  });

  it("2. rejects invalid bodies and bad ids", async () => {
    assert.equal((await postJson(baseUrl, "/api/fleet/maintenance", {})).status, 400);
    assert.equal((await postJson(baseUrl, "/api/fleet/maintenance",
      { date: "2026-13-99", vehicleId: 1, currentKM: 5, maintenanceType: "x", serviceType: "y" })).status, 400);
    assert.equal((await postJson(baseUrl, "/api/fleet/maintenance",
      { date: TODAY, vehicleId: 1, currentKM: -3, maintenanceType: "x", serviceType: "y" })).status, 400);
    assert.equal((await getJson(baseUrl, "/api/fleet/maintenance/abc")).status, 400);
    assert.equal((await getJson(baseUrl, "/api/fleet/maintenance/999999")).status, 404);
    assert.equal((await postJson(baseUrl, "/api/fleet/maintenance/999999/reject", { reason: "x" })).status, 404);
  });

  it("3. updates persist and neighbor meter readings guard edits", async () => {
    const vehicle = await seedVehicle("U");
    const driver = await seedDriver("U");
    const first = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 60000,
      maintenanceType: ["Engine"], serviceType: "General", idempotencyKey: randomUUID(),
    }));
    const upd = await putJson(baseUrl, `/api/fleet/maintenance/${first.body.id}`, { remarks: "updated", currentKM: 60005 });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.remarks, "updated");

    const second = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 60050,
      maintenanceType: ["Check"], serviceType: "Second", idempotencyKey: randomUUID(),
    }));
    assert.equal((await putJson(baseUrl, `/api/fleet/maintenance/${first.body.id}`, { currentKM: 60100 })).status, 422);
    assert.equal((await putJson(baseUrl, `/api/fleet/maintenance/${second.body.id}`, { currentKM: 60001 })).status, 422);
  });

  it("4. approve/reject state machine rejects illegal transitions", async () => {
    const vehicle = await seedVehicle("A");
    const driver = await seedDriver("A");
    const created = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 70000,
      maintenanceType: ["Engine"], serviceType: "General", idempotencyKey: randomUUID(),
    }));
    const id = created.body.id;
    assert.equal((await postJson(baseUrl, `/api/fleet/maintenance/${id}/reject`, {})).status, 400);
    const approved = await postJson(baseUrl, `/api/fleet/maintenance/${id}/approve`, { approvedBy: "tester" });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "Approved");
    assert.equal((await postJson(baseUrl, `/api/fleet/maintenance/${id}/approve`, {})).status, 409);
    assert.equal((await postJson(baseUrl, `/api/fleet/maintenance/${id}/reject`, { reason: "late" })).status, 409);
  });

  it("5. documents list metadata, serve bytes, and protect the last file", async () => {
    const vehicle = await seedVehicle("D");
    const driver = await seedDriver("D");
    const created = await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 80000,
      maintenanceType: ["Engine"], serviceType: "General", idempotencyKey: randomUUID(),
    }, 1));
    const id = created.body.id;
    const docs = await getJson(baseUrl, `/api/fleet/maintenance/${id}/documents`);
    assert.equal(docs.status, 200);
    assert.equal(docs.body.length, 1);
    const docId = docs.body[0].id;

    const bin = await fetch(`${baseUrl}/api/fleet/maintenance/${id}/documents/${docId}`, { headers: app.authHeaders });
    assert.equal(bin.status, 200);
    assert.ok((bin.headers.get("content-type") ?? "").includes("image/png"));
    assert.equal(bin.headers.get("x-content-type-options"), "nosniff");
    assert.match(bin.headers.get("content-disposition") ?? "", /inline/);

    assert.equal((await deleteJson(`/api/fleet/maintenance/${id}/documents/${docId}`)).status, 400);
    await putForm(`/api/fleet/maintenance/${id}`, maintForm({ remarks: "add-doc" }, 1));
    const two = await getJson(baseUrl, `/api/fleet/maintenance/${id}/documents`);
    assert.equal(two.body.length, 2);
    const extraId = two.body.map((d: { id: number }) => d.id).find((n: number) => n !== docId);
    assert.equal((await deleteJson(`/api/fleet/maintenance/${id}/documents/${extraId}`)).status, 200);
  });

  it("6. pagination, filters, search and soft-delete lifecycle", async () => {
    const vehicle = await seedVehicle("S");
    const driver = await seedDriver("S");
    await postJson(baseUrl, `/api/fleet/maintenance/${(await postForm("/api/fleet/maintenance", maintForm({
      date: TODAY, vehicleId: vehicle.id, driverId: driver.id, currentKM: 90000,
      maintenanceType: ["Engine"], serviceType: "General", idempotencyKey: randomUUID(),
    }))).body.id}/approve`, { approvedBy: "tester" });

    const paged = await getJson(baseUrl, "/api/fleet/maintenance?page=1&limit=2");
    assert.equal(paged.status, 200);
    assert.ok(Array.isArray(paged.body.data));
    assert.equal(paged.body.meta.page, 1);
    assert.equal(paged.body.meta.limit, 2);

    const byId = rowsOf(await getJson(baseUrl, `/api/fleet/maintenance?vehicleId=${vehicle.id}&status=Approved`));
    assert.equal(byId.length, 1);

    const all = rowsOf(await getJson(baseUrl, `/api/fleet/maintenance?vehicleId=${vehicle.id}`));
    const billNo = all[0].billNo as string;
    const found = rowsOf(await getJson(baseUrl, `/api/fleet/maintenance?search=${encodeURIComponent(billNo)}`));
    assert.ok(found.some((r) => r.billNo === billNo));

    const target = all[0].id as number;
    const removed = await deleteJson(`/api/fleet/maintenance/${target}`, { reason: "test-cleanup" });
    assert.equal(removed.status, 200);
    assert.ok(!rowsOf(await getJson(baseUrl, `/api/fleet/maintenance?vehicleId=${vehicle.id}`)).some((r) => r.id === target));
    assert.ok(rowsOf(await getJson(baseUrl, `/api/fleet/maintenance?vehicleId=${vehicle.id}&includeDeleted=true`)).some((r) => r.id === target));
    assert.equal((await getJson(baseUrl, `/api/fleet/maintenance/${target}`)).status, 404);
    const dbRow = await pool.query(`SELECT deleted, deleted_reason FROM fleet_maintenance WHERE id = $1`, [target]);
    assert.equal(dbRow.rows[0].deleted, true);
    assert.equal(dbRow.rows[0].deleted_reason, "test-cleanup");
  });

  it("7. maintenance requires authorization", async () => {
    const anon = await fetch(`${baseUrl}/api/fleet/maintenance`);
    assert.equal(anon.status, 401);
  });

  it("8. accepts historical bill dates and locks edits/deletes ten days after entry", async () => {
    const vehicle = await seedVehicle("W");
    const driver = await seedDriver("W");
    const historicalDate = "2026-01-15";
    const created = await postForm("/api/fleet/maintenance", maintForm({
      date: historicalDate, vehicleId: vehicle.id, driverId: driver.id, currentKM: 95000,
      maintenanceType: ["Engine"], serviceType: "Historical bill", idempotencyKey: randomUUID(),
    }));
    assert.equal(created.status, 201, "an old bill date must be accepted when entered today");

    const withinWindow = await putJson(baseUrl, `/api/fleet/maintenance/${created.body.id}`, {
      remarks: "corrected after entry",
    });
    assert.equal(withinWindow.status, 200);

    await pool.query(
      `UPDATE fleet_maintenance SET created_at = NOW() - INTERVAL '11 days' WHERE id = $1`,
      [created.body.id]
    );
    const lockedUpdate = await putJson(baseUrl, `/api/fleet/maintenance/${created.body.id}`, {
      remarks: "too late",
    });
    assert.equal(lockedUpdate.status, 409);
    assert.match(lockedUpdate.body.message, /saved record can no longer be edited or deleted/i);

    const lockedDelete = await deleteJson(`/api/fleet/maintenance/${created.body.id}`);
    assert.equal(lockedDelete.status, 409);
  });
});
