/**
 * EMI Management overview (GET /api/fleet/emis/overview) contract.
 *
 * Verifies the read-only, Vehicle-Master-derived EMI view:
 *   - every ACTIVE vehicle appears (no separate vehicle/EMI source)
 *   - total EMI / purchase amount / purchase date / EMI day come from the
 *     Vehicle Master
 *   - completed EMI comes from the existing payment schedule
 *   - pending = total - completed (never negative), status = pending|completed
 *   - master changes propagate after refetch
 *   - inactive vehicles never appear
 *   - month-end EMI days never produce invalid dates
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
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

function rowFor(rows: any[], vehicleNumber: string) {
  return rows.find((r) => r.vehicleNo === vehicleNumber);
}

async function overview() {
  const res = await getJson(baseUrl, "/api/fleet/emis/overview");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  return res.body;
}

async function vehicleNoOf(vehicleNumber: string): Promise<number> {
  const result = await pool.query<{ vehicle_no: number }>(
    `SELECT vehicle_no FROM vehicles WHERE vehicle_number = $1`,
    [vehicleNumber]
  );
  assert.ok(result.rowCount);
  return Number(result.rows[0].vehicle_no);
}

describe("Fleet EMI overview (Vehicle-Master-derived)", () => {
  it("CASE 1 — new active vehicle with no EMI record yet shows master EMI facts", async () => {
    const v1 = await mastersService.upsertVehicle({
      vehicleNumber: "OV-1",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG1",
      chassisNumber: "OVCHAS1",
      purchaseAmount: 100000,
      purchaseDate: "2024-08-18",
      emiDay: 18,
      totalEMIs: 60,
      status: "Active",
    });
    assert.ok(v1.id > 0);

    const rows = await overview();
    const row = rowFor(rows, "OV-1");
    assert.ok(row, "OV-1 should appear in the overview");
    assert.equal(row.purchaseAmount, 100000);
    assert.equal(row.purchaseDate, "2024-08-18");
    assert.equal(row.totalEMIs, 60);
    assert.equal(row.completedEMIs, 0);
    assert.equal(row.pendingEMIs, 60);
    assert.equal(row.status, "pending");
    assert.equal(row.emiRecordId, null);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.emiDate ?? ""), `valid emiDate, got ${row.emiDate}`);
  });

  it("CASE 6/16 — inactive vehicle never appears", async () => {
    await mastersService.upsertVehicle({
      vehicleNumber: "OV-INACTIVE",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG2",
      chassisNumber: "OVCHAS2",
      purchaseAmount: 50000,
      purchaseDate: "2024-05-10",
      emiDay: 10,
      totalEMIs: 24,
      status: "Inactive",
    });

    const rows = await overview();
    assert.equal(rowFor(rows, "OV-INACTIVE"), undefined);
  });

  it("CASE 2 — completed EMI comes from the payment schedule", async () => {
    const v2 = await mastersService.upsertVehicle({
      vehicleNumber: "OV-2",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG3",
      chassisNumber: "OVCHAS3",
      purchaseAmount: 120000,
      purchaseDate: "2024-01-15",
      emiDay: 15,
      totalEMIs: 12,
      status: "Active",
    });
    const rowsBefore = await overview();
    const ov2 = rowFor(rowsBefore, "OV-2");

    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: ov2.vehicleId,
      financeCompany: "HDFC Bank",
      loanAmount: 120000,
      totalEMIs: 12,
      startDate: "2024-01-15",
    });
    assert.equal(created.status, 201);

    // Pay 2 installments -> completed 2, pending 10.
    for (let i = 0; i < 2; i++) {
      const paid = await postJson(baseUrl, `/api/fleet/emis/${created.body.id}/pay`, {});
      assert.equal(paid.status, 200);
    }

    const rows = await overview();
    const row = rowFor(rows, "OV-2");
    assert.equal(row.completedEMIs, 2);
    assert.equal(row.pendingEMIs, 10);
    assert.equal(row.status, "pending");
    assert.equal(row.emiRecordId, created.body.id);
  });

  it("CASE 11 — month-end EMI day produces a valid date", async () => {
    await mastersService.upsertVehicle({
      vehicleNumber: "OV-31",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG4",
      chassisNumber: "OVCHAS4",
      purchaseAmount: 50000,
      purchaseDate: "2025-03-15",
      emiDay: 31,
      totalEMIs: 6,
      status: "Active",
    });
    const rowsBefore = await overview();
    const v31 = rowFor(rowsBefore, "OV-31");

    const created = await postJson(baseUrl, "/api/fleet/emis", {
      vehicleId: v31.vehicleId,
      financeCompany: "Axis",
      loanAmount: 50000,
      totalEMIs: 6,
      startDate: "2025-03-15",
    });
    assert.equal(created.status, 201);
    // First due date is the 31st clamped to March (31 days -> 31st is valid).
    assert.equal(created.body.nextEMIDate, "2025-03-31");

    const schedule = await getJson(baseUrl, `/api/fleet/emis/${created.body.id}/schedule`);
    assert.equal(schedule.status, 200);
    // April has 30 days -> the April installment must be clamped to the 30th.
    assert.equal(schedule.body[1].dueDate, "2025-04-30");
  });

  it("CASE 12 — payment updates completed/pending/status from the same backend source", async () => {
    const rowsBefore = await overview();
    const v2 = rowFor(rowsBefore, "OV-2");
    const paid = await postJson(baseUrl, `/api/fleet/emis/${v2.emiRecordId}/pay`, {});
    assert.equal(paid.status, 200);
    assert.equal(paid.body.paidEMIs, 3);

    const rows = await overview();
    const row = rowFor(rows, "OV-2");
    assert.equal(row.completedEMIs, 3);
    assert.equal(row.pendingEMIs, 9);
    assert.equal(row.status, "pending");
  });

  it("CASE 7 — master purchase amount change propagates to the overview", async () => {
    const rowsBefore = await overview();
    const v1 = rowFor(rowsBefore, "OV-1");
    await mastersService.upsertVehicle({
      id: v1.vehicleId,
      vehicleNo: await vehicleNoOf("OV-1"),
      vehicleNumber: "OV-1",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG1",
      chassisNumber: "OVCHAS1",
      purchaseAmount: 999999,
      purchaseDate: "2024-08-18",
      emiDay: 18,
      totalEMIs: 60,
      status: "Active",
    });

    const rows = await overview();
    assert.equal(rowFor(rows, "OV-1").purchaseAmount, 999999);
  });

  it("CASE 8 — master purchase date change propagates to the overview", async () => {
    const rowsBefore = await overview();
    const v1 = rowFor(rowsBefore, "OV-1");
    await mastersService.upsertVehicle({
      id: v1.vehicleId,
      vehicleNo: await vehicleNoOf("OV-1"),
      vehicleNumber: "OV-1",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG1",
      chassisNumber: "OVCHAS1",
      purchaseAmount: 999999,
      purchaseDate: "2023-07-01",
      emiDay: 18,
      totalEMIs: 60,
      status: "Active",
    });

    const rows = await overview();
    assert.equal(rowFor(rows, "OV-1").purchaseDate, "2023-07-01");
  });

  it("CASE 9 — master EMI day change recalculates the EMI date", async () => {
    const rowsBefore = await overview();
    const v1 = rowFor(rowsBefore, "OV-1");
    await mastersService.upsertVehicle({
      id: v1.vehicleId,
      vehicleNo: await vehicleNoOf("OV-1"),
      vehicleNumber: "OV-1",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG1",
      chassisNumber: "OVCHAS1",
      purchaseAmount: 999999,
      purchaseDate: "2023-07-01",
      emiDay: 25,
      totalEMIs: 60,
      status: "Active",
    });

    const rows = await overview();
    const row = rowFor(rows, "OV-1");
    assert.equal(row.emiDay, 25);
    // No EMI record for OV-1, so emiDate = next occurrence of day 25.
    assert.ok(row.emiDate && row.emiDate.endsWith("-25"), `emiDate on 25th, got ${row.emiDate}`);
  });

  it("CASE 5/10 — master total EMI change clamps completed and never lets pending go negative", async () => {
    // OV-2 already has 3 paid installments (total 12). Lower the master total to 2.
    const rowsBefore = await overview();
    const v2 = rowFor(rowsBefore, "OV-2");
    await mastersService.upsertVehicle({
      id: v2.vehicleId,
      vehicleNo: await vehicleNoOf("OV-2"),
      vehicleNumber: "OV-2",
      vehicleType: "Truck",
      noOfBoxes: 40,
      birdCapacity: 1000,
      capacityKg: 2000,
      engineNumber: "OVENG3",
      chassisNumber: "OVCHAS3",
      purchaseAmount: 120000,
      purchaseDate: "2024-01-15",
      emiDay: 15,
      totalEMIs: 2,
      status: "Active",
    });

    const rows = await overview();
    const row = rowFor(rows, "OV-2");
    assert.equal(row.totalEMIs, 2);
    assert.equal(row.completedEMIs, 2); // clamped to total (never exceeds)
    assert.equal(row.pendingEMIs, 0); // never negative
    assert.equal(row.status, "completed");
  });

  it("CASE 4/15 — fully paid active vehicle stays visible as COMPLETED", async () => {
    // OV-2 has master total 2 and 3 paid installments -> completed, pending 0.
    const rows = await overview();
    const row = rowFor(rows, "OV-2");
    assert.ok(row, "still visible (active in master)");
    assert.equal(row.status, "completed");
    assert.equal(row.pendingEMIs, 0);
    assert.equal(row.emiDate, null);
  });

  it("CASE 13/14 — refetch is stable and multiple active vehicles each resolve correctly", async () => {
    const first = await overview();
    const second = await overview();
    assert.deepEqual(
      first.map((r: any) => r.vehicleNo).sort(),
      second.map((r: any) => r.vehicleNo).sort()
    );
    for (const vehicleNo of ["OV-1", "OV-2", "OV-31"]) {
      assert.ok(rowFor(first, vehicleNo), `${vehicleNo} present`);
    }
    assert.equal(first.filter((r: any) => r.status === "completed").length, 1); // OV-2

    // Default order is PENDING first, then COMPLETED (deterministic).
    const statuses = first.map((r: any) => r.status);
    const firstCompletedIndex = statuses.indexOf("completed");
    if (firstCompletedIndex !== -1) {
      assert.equal(statuses.indexOf("pending", firstCompletedIndex), -1, "pending before completed");
    }
    // Within each group vehicle number is ascending.
    const pendingNos = first.filter((r: any) => r.status === "pending").map((r: any) => r.vehicleNo);
    assert.deepEqual(pendingNos, [...pendingNos].sort());
  });
});
