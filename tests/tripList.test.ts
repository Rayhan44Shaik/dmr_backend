/**
 * Trip List backend tests — read-only, completed/approved-only, deleted-safe.
 *
 * Runs the real Express app against a real PostgreSQL engine (PGlite WASM
 * behind the pg-gateway wire-protocol server) — no mocks.
 *
 * Covers the Trip List acceptance criteria:
 *   - Draft / Pending trips are excluded
 *   - Completed/approved trips appear
 *   - Deleted trips (soft-deleted AND legacy inconsistent states) never appear
 *   - Deleted trips cannot be resurrected via status or autosave
 *   - Filters (search/date/vehicle/supervisor/driver/farm) and pagination
 *   - Detail endpoint only returns eligible trips
 *   - A second server instance (≈ backend restart / new machine) sees the same data
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

// Import the shared pool + services only after DATABASE_URL is set so the
// module-level pool points at the PGlite server (same DB the app uses).
const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Seed helpers (use the production services so setup mirrors real usage).
// ---------------------------------------------------------------------------

async function seedMasters() {
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: "AP39TL0001",
    vehicleType: "Lorry",
    noOfBoxes: 85,
    birdCapacity: 5000,
    capacityKg: 6000,
    engineNumber: "TLENG0001",
    chassisNumber: "TLCHS0001",
    status: "Active",
  });
  const vehicle2 = await mastersService.upsertVehicle({
    vehicleNumber: "AP39TL0002",
    vehicleType: "Tata 407",
    noOfBoxes: 50,
    birdCapacity: 2300,
    capacityKg: 5000,
    engineNumber: "TLENG0002",
    chassisNumber: "TLCHS0002",
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: "TL Driver",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9000000001",
    licenseNumber: "TLDL0001",
    salary: 18000,
    status: "Active",
  });
  const driver2 = await mastersService.upsertEmployee({
    employeeName: "TL Driver 2",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9000000002",
    licenseNumber: "TLDL0002",
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: "TL Supervisor",
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: "9000000003",
    salary: 24000,
    status: "Active",
  });
  // Dedicated resources for the Draft-status fixture trip below: a trip left
  // in Draft never releases its vehicle/driver/supervisor (see
  // src/validation/tripResourceValidation.ts), so it must not share
  // resources with any of the other (Pending/Completed) fixture trips.
  const draftVehicle = await mastersService.upsertVehicle({
    vehicleNumber: "AP39TL0003",
    vehicleType: "Lorry",
    noOfBoxes: 60,
    birdCapacity: 3000,
    capacityKg: 4000,
    engineNumber: "TLENG0003",
    chassisNumber: "TLCHS0003",
    status: "Active",
  });
  const draftDriver = await mastersService.upsertEmployee({
    employeeName: "TL Draft Driver",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9000000004",
    licenseNumber: "TLDL0003",
    salary: 18000,
    status: "Active",
  });
  const draftSupervisor = await mastersService.upsertEmployee({
    employeeName: "TL Draft Supervisor",
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: "9000000005",
    salary: 24000,
    status: "Active",
  });
  const farm = await mastersService.upsertFarm({
    farmName: "TL Test Farm",
    ownerName: "Owner",
    supervisorName: "Farm Sup",
    phoneNumber: "9650000001",
    village: "Village",
    address: "Address",
    capacity: 30000,
    status: "Active",
  });
  const birdType = await mastersService.upsertBirdType({
    birdType: "Broiler",
    averageWeight: 2.35,
    description: "Broiler",
    status: "Active",
  });

  return {
    vehicle,
    vehicle2,
    driver,
    driver2,
    supervisor,
    draftVehicle,
    draftDriver,
    draftSupervisor,
    farm,
    birdType,
  };
}

interface TripInput {
  tripNo: string;
  tripDate: string;
  status?: "Draft" | "Pending" | "Completed" | "Deleted";
  vehicleId?: number;
  driverId?: number;
  supervisorId?: number;
  farmId?: number;
  submitted?: boolean;
}

async function makeTrip(m: Awaited<ReturnType<typeof seedMasters>>, input: TripInput) {
  const trip = await tripsService.save(null, {
    tripNo: input.tripNo,
    tripDate: input.tripDate,
    status: input.status === "Completed" ? "Pending" : (input.status ?? "Draft"),
    startTime: `${input.tripDate}T05:30:00.000Z`,
    vehicleId: input.vehicleId ?? m.vehicle.id,
    vehicleNo: m.vehicle.vehicleNumber,
    driverId: input.driverId ?? m.driver.id,
    driverName: m.driver.employeeName,
    supervisorId: input.supervisorId ?? m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: input.farmId ?? m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: input.submitted ?? true,
    farmStepSubmitted: input.submitted ?? true,
    pickupStepSubmitted: input.submitted ?? true,
    deliveryStepSubmitted: input.submitted ?? true,
    expensesStepSubmitted: input.submitted ?? true,
    totalKm: 100,
    totalWeight: 5000,
  });
  if (input.status === "Completed") {
    return tripsService.updateStatus(trip.id, {
      status: "Completed",
      approvedBy: "test",
    });
  }
  return trip;
}

let m: Awaited<ReturnType<typeof seedMasters>>;
let draftTrip: Awaited<ReturnType<typeof makeTrip>>;
let pendingTrip: Awaited<ReturnType<typeof makeTrip>>;
let completedA: Awaited<ReturnType<typeof makeTrip>>;
let completedB: Awaited<ReturnType<typeof makeTrip>>;
let softDeletedTrip: Awaited<ReturnType<typeof makeTrip>>;
let flagDeletedCompletedId: number;
let statusDeletedId: number;
let flagDeletedTripNo: string;
let statusDeletedTripNo: string;
let partialTripNo: string;

before(async () => {
  m = await seedMasters();

  draftTrip = await makeTrip(m, {
    tripNo: "TRP-TL-DRAFT-001",
    tripDate: "2026-08-10",
    status: "Draft",
    submitted: false,
    vehicleId: m.draftVehicle.id,
    driverId: m.draftDriver.id,
    supervisorId: m.draftSupervisor.id,
  });
  pendingTrip = await makeTrip(m, {
    tripNo: "TRP-TL-PENDING-001",
    tripDate: "2026-08-11",
    status: "Pending",
    submitted: true,
  });
  completedA = await makeTrip(m, {
    tripNo: "TRP-TL-COMP-001",
    tripDate: "2026-08-12",
    status: "Completed",
    submitted: true,
  });
  completedB = await makeTrip(m, {
    tripNo: "TRP-TL-COMP-002",
    tripDate: "2026-08-13",
    status: "Completed",
    submitted: true,
    vehicleId: m.vehicle2.id,
    driverId: m.driver2.id,
  });

  // Soft-deleted via the existing production delete path.
  softDeletedTrip = await makeTrip(m, {
    tripNo: "TRP-TL-DEL-001",
    tripDate: "2026-08-14",
    status: "Completed",
    submitted: true,
  });
  await tripsService.softDelete(softDeletedTrip.id, "test soft delete");

  // Legacy inconsistent state 1: deleted flag set, status left 'Completed'.
  const flagOnly = await makeTrip(m, {
    tripNo: "TRP-TL-DEL-002",
    tripDate: "2026-08-15",
    status: "Completed",
    submitted: true,
  });
  flagDeletedCompletedId = flagOnly.id;
  flagDeletedTripNo = flagOnly.tripNo;
  await pool.query(`UPDATE trips SET deleted = TRUE WHERE id = $1`, [flagOnly.id]);

  // Legacy inconsistent state 2: status 'Deleted', deleted flag left FALSE.
  const statusOnly = await makeTrip(m, {
    tripNo: "TRP-TL-DEL-003",
    tripDate: "2026-08-16",
    status: "Completed",
    submitted: true,
  });
  statusDeletedId = statusOnly.id;
  statusDeletedTripNo = statusOnly.tripNo;
  await pool.query(`UPDATE trips SET status = 'Deleted' WHERE id = $1`, [
    statusOnly.id,
  ]);

  const partial = await tripsService.save(null, {
    tripDate: "2026-08-17",
    status: "Draft",
    vehicleId: m.vehicle2.id,
    vehicleNo: m.vehicle2.vehicleNumber,
    driverId: m.driver2.id,
    driverName: m.driver2.employeeName,
    supervisorId: m.supervisor.id,
    supervisorName: m.supervisor.employeeName,
    sourceFarmId: m.farm.id,
    sourceFarm: m.farm.farmName,
    openingMeter: 1000,
    startStepSubmitted: true,
    farmStepSubmitted: true,
    pickupStepSubmitted: true,
    deliveryStepSubmitted: true,
    expensesStepSubmitted: false,
  });
  partialTripNo = partial.tripNo;
});

// ---------------------------------------------------------------------------
// Eligibility (the core business rule)
// ---------------------------------------------------------------------------

function tripListRows(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: Array<Record<string, unknown>> }).data;
  }
  return [];
}

describe("Trip List eligibility", () => {
  it("returns only completed/approved trips (excludes Draft, Pending)", async () => {
    const { status, body } = await getJson(baseUrl, "/api/operations/trip-list");
    assert.equal(status, 200);
    const rows = tripListRows(body);
    assert.ok(Array.isArray(rows), "response must be an array of eligible trips");

    const tripNos = rows.map((t) => t.tripNo);
    assert.ok(tripNos.includes(completedA.tripNo), "completed trip must appear");
    assert.ok(tripNos.includes(completedB.tripNo), "second completed trip must appear");
    assert.ok(!tripNos.includes(draftTrip.tripNo), "draft trip must NOT appear");
    assert.ok(!tripNos.includes(pendingTrip.tripNo), "pending trip must NOT appear");
    const listed = rows.find((t) => t.id === completedA.id);
    assert.ok(listed, "completed trip id must be unchanged in Trip List");
    assert.equal(listed?.tripNo, completedA.tripNo, "completed trip number must be unchanged");
  });

  it("excludes every deleted trip, including legacy inconsistent states", async () => {
    const { body } = await getJson(baseUrl, "/api/operations/trip-list");
    const rows = tripListRows(body);
    const tripNos = rows.map((t) => t.tripNo);

    assert.ok(!tripNos.includes(softDeletedTrip.tripNo), "soft-deleted trip must NOT appear");
    assert.ok(
      !tripNos.includes(flagDeletedTripNo),
      "flag-deleted completed trip must NOT appear"
    );
    assert.ok(
      !tripNos.includes(statusDeletedTripNo),
      "status-deleted trip must NOT appear"
    );
    assert.ok(
      rows.every((t) => t.status === "Completed" && t.deleted === false),
      "every returned row must be status=Completed and deleted=false"
    );
  });

  it("excludes a partially completed trip that has not been approved", async () => {
    const { body } = await getJson(baseUrl, "/api/operations/trip-list");
    const tripNos = tripListRows(body).map((t) => t.tripNo);
    assert.ok(!tripNos.includes(partialTripNo), "partially completed trip must NOT appear");
  });

  it("direct API request is the only source — refresh yields identical results", async () => {
    const first = await getJson(baseUrl, "/api/operations/trip-list");
    const second = await getJson(baseUrl, "/api/operations/trip-list");
    assert.deepEqual(tripListRows(second.body), tripListRows(first.body), "repeat request must be identical");
  });

  it("a second server instance (backend restart / new machine) sees the same data", async () => {
    const app2 = await startApp({ DATABASE_URL: testDb.url });
    try {
      const { status, body } = await getJson(app2.baseUrl, "/api/operations/trip-list");
      assert.equal(status, 200);
      const tripNos = tripListRows(body).map((t) => t.tripNo);
      assert.ok(tripNos.includes(completedA.tripNo));
      assert.ok(!tripNos.includes(draftTrip.tripNo));
      assert.ok(!tripNos.includes(softDeletedTrip.tripNo));
      assert.ok(!tripNos.includes(flagDeletedTripNo));
      assert.ok(!tripNos.includes(statusDeletedTripNo));
    } finally {
      await app2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Filters + pagination (server-side)
// ---------------------------------------------------------------------------

describe("Trip List filters and pagination", () => {
  it("search never surfaces non-eligible trips", async () => {
    const draftSearch = await getJson(
      baseUrl,
      `/api/operations/trip-list?search=${draftTrip.tripNo}`
    );
    assert.equal(tripListRows(draftSearch.body).length, 0, "searching a draft must return nothing");

    const deletedSearch = await getJson(
      baseUrl,
      `/api/operations/trip-list?search=${softDeletedTrip.tripNo}`
    );
    assert.equal(tripListRows(deletedSearch.body).length, 0, "searching a deleted trip must return nothing");

    const hit = await getJson(
      baseUrl,
      `/api/operations/trip-list?search=${completedA.tripNo}`
    );
    assert.equal(tripListRows(hit.body).length, 1);
    assert.equal(tripListRows(hit.body)[0].tripNo, completedA.tripNo);
  });

  it("date-range filter is enforced server-side", async () => {
    const { body } = await getJson(
      baseUrl,
      "/api/operations/trip-list?fromDate=2026-08-13&toDate=2026-08-13"
    );
    const tripNos = tripListRows(body).map((t) => t.tripNo);
    assert.deepEqual(tripNos, [completedB.tripNo]);
  });

  it("vehicle filter is enforced server-side", async () => {
    const { body } = await getJson(
      baseUrl,
      `/api/operations/trip-list?vehicleId=${m.vehicle2.id}`
    );
    const tripNos = tripListRows(body).map((t) => t.tripNo);
    assert.deepEqual(tripNos, [completedB.tripNo]);
  });

  it("supervisor, driver and farm filters are enforced server-side", async () => {
    const bySupervisor = await getJson(
      baseUrl,
      `/api/operations/trip-list?supervisorId=${m.supervisor.id}`
    );
    assert.ok(
      tripListRows(bySupervisor.body).every((t) => t.supervisorId === m.supervisor.id)
    );

    const byDriver = await getJson(
      baseUrl,
      `/api/operations/trip-list?driverId=${m.driver2.id}`
    );
    assert.deepEqual(
      tripListRows(byDriver.body).map((t) => t.tripNo),
      [completedB.tripNo]
    );

    const byFarm = await getJson(
      baseUrl,
      `/api/operations/trip-list?farmId=${m.farm.id}`
    );
    assert.ok(tripListRows(byFarm.body).length >= 2);
    assert.ok(
      tripListRows(byFarm.body).every((t) => t.sourceFarmId === m.farm.id)
    );
  });

  it("pagination returns correct totals and pages", async () => {
    const page1 = await getJson(baseUrl, "/api/operations/trip-list?page=1&limit=1");
    assert.equal(page1.body.meta.total, 2, "only the 2 completed trips are counted");
    assert.equal(page1.body.data.length, 1);
    assert.equal(page1.body.meta.totalPages, 2);

    const page2 = await getJson(baseUrl, "/api/operations/trip-list?page=2&limit=1");
    assert.equal(page2.body.data.length, 1);
    assert.notEqual(page2.body.data[0].tripNo, page1.body.data[0].tripNo);
  });
});

// ---------------------------------------------------------------------------
// Detail endpoint (read-only, eligible only)
// ---------------------------------------------------------------------------

describe("Trip List detail endpoint", () => {
  it("returns full detail for an eligible trip", async () => {
    const { status, body } = await getJson(
      baseUrl,
      `/api/operations/trip-list/${completedA.id}`
    );
    assert.equal(status, 200);
    assert.equal(body.id, completedA.id);
    assert.equal(body.status, "Completed");
    assert.equal(body.deleted, false);
    assert.equal(typeof body.vehicleNo, "string");
    assert.equal(typeof body.driverName, "string");
    assert.equal(typeof body.supervisorName, "string");
    assert.equal(typeof body.sourceFarm, "string");
    assert.ok(Array.isArray(body.deliveries));
  });

  it("returns 404 for Draft, Pending and Deleted trips", async () => {
    for (const id of [draftTrip.id, pendingTrip.id, softDeletedTrip.id, flagDeletedCompletedId, statusDeletedId]) {
      const { status } = await getJson(baseUrl, `/api/operations/trip-list/${id}`);
      assert.equal(status, 404, `trip ${id} must not be reachable via Trip List`);
    }
  });
});

// ---------------------------------------------------------------------------
// Deletion permanence (cannot be resurrected)
// ---------------------------------------------------------------------------

describe("Deleted trips stay deleted", () => {
  it("status PATCH cannot restore a deleted trip", async () => {
    const res = await fetch(`${baseUrl}/api/operations/trips/${softDeletedTrip.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "Pending" }),
    });
    assert.equal(res.status, 422, "restoring a deleted trip must be rejected");
  });

  it("status PATCH cannot restore a flag-deleted trip (legacy state)", async () => {
    const res = await fetch(
      `${baseUrl}/api/operations/trips/${flagDeletedCompletedId}/status`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Pending" }),
      }
    );
    assert.equal(res.status, 422, "flag-deleted trip must not be resurrected");
  });

  it("autosave cannot modify a deleted trip", async () => {
    const res = await fetch(`${baseUrl}/api/operations/trips/${softDeletedTrip.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "Draft" }),
    });
    assert.equal(res.status, 422, "autosave on a deleted trip must be rejected");
  });

  it("saving a new trip with status Deleted persists both status and flag", async () => {
    const created = await tripsService.save(null, {
      tripNo: "TRP-TL-DEL-004",
      tripDate: "2026-08-17",
      status: "Deleted",
    });
    const row = await pool.query(`SELECT status, deleted FROM trips WHERE id = $1`, [
      created.id,
    ]);
    assert.equal(row.rows[0].status, "Deleted");
    assert.equal(row.rows[0].deleted, true);
  });
});
