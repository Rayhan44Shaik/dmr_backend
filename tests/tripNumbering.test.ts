/**
 * Trip numbering — date-based TR-YYYYMMDD-NNN across all statuses including deleted.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { getJson, postJson, startApp, type TestApp } from "./helpers/app.js";
import { applySchema, startTestDb, type TestDb } from "./helpers/testDb.js";

const testDb: TestDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();
const app: TestApp = await startApp({ DATABASE_URL: testDb.url });
const baseUrl = app.baseUrl;

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");
const { AppError } = await import("../src/middleware/errorHandler.js");
const {
  businessTodayDateOnly,
  formatTripNo,
  resolveTripDateForNumbering,
  shiftDateOnly,
} = await import("../src/utils/tripNumbering.js");

after(async () => {
  await app.close();
  await testDb.close();
  await pool.end();
});

let crewSeq = 0;
async function seedCrew() {
  crewSeq += 1;
  const n = String(crewSeq).padStart(4, "0");
  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: `TN39N${n}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `TNENG${n}`,
    chassisNumber: `TNCHS${n}`,
    status: "Active",
  });
  const driver = await mastersService.upsertEmployee({
    employeeName: `Num Driver ${n}`,
    department: "Driver",
    role: "Driver",
    phoneNumber: `9500${n}01`,
    licenseNumber: `TNDL${n}`,
    salary: 18000,
    status: "Active",
  });
  const supervisor = await mastersService.upsertEmployee({
    employeeName: `Num Supervisor ${n}`,
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: `9510${n}01`,
    salary: 24000,
    status: "Active",
  });
  const helper = await mastersService.upsertEmployee({
    employeeName: `Num Helper ${n}`,
    department: "Helper",
    role: "Helper",
    phoneNumber: `9520${n}01`,
    salary: 12000,
    status: "Active",
  });
  const loader = await mastersService.upsertEmployee({
    employeeName: `Num Loader ${n}`,
    department: "Loader",
    role: "Loader",
    phoneNumber: `9530${n}01`,
    salary: 12000,
    status: "Active",
  });
  return { vehicle, driver, supervisor, helper, loader };
}

async function createStartTrip(
  crew: Awaited<ReturnType<typeof seedCrew>>,
  tripDate: string,
  openingMeter = 1000
) {
  return tripsService.save(null, {
    tripDate,
    status: "Draft",
    vehicleId: crew.vehicle.id,
    vehicleNo: crew.vehicle.vehicleNumber,
    driverId: crew.driver.id,
    driverName: crew.driver.employeeName,
    supervisorId: crew.supervisor.id,
    supervisorName: crew.supervisor.employeeName,
    helpers: [crew.helper.employeeName],
    loaders: [crew.loader.employeeName],
    openingMeter,
    startStepSubmitted: true,
  });
}

describe("trip numbering by selected date", () => {
  it("formats TR-YYYYMMDD-NNN from business date + sequence", () => {
    assert.equal(formatTripNo("2026-08-13", 1), "TR-20260813-001");
    assert.equal(formatTripNo("2026-08-13", 12), "TR-20260813-012");
  });

  it("rejects invalid / out-of-range trip dates", () => {
    assert.throws(() => resolveTripDateForNumbering("2026-02-30", { required: true }), AppError);
    const today = businessTodayDateOnly();
    const tooOld = shiftDateOnly(today, -800);
    assert.throws(() => resolveTripDateForNumbering(tooOld, { required: true }), AppError);
    const tooFuture = shiftDateOnly(today, 30);
    assert.throws(() => resolveTripDateForNumbering(tooFuture, { required: true }), AppError);
  });

  it("allocates next number for a selected past date across draft/pending/completed/deleted", async () => {
    const day = "2026-08-13";
    const a = await seedCrew();
    const b = await seedCrew();
    const c = await seedCrew();
    const d = await seedCrew();

    const t1 = await createStartTrip(a, day, 1000);
    assert.equal(t1.tripNo, "TR-20260813-001");
    assert.equal(t1.tripDate, day);

    const t2 = await createStartTrip(b, day, 1100);
    assert.equal(t2.tripNo, "TR-20260813-002");

    await tripsService.softDelete(t2.id, "numbering test");

    const t3 = await createStartTrip(c, day, 1200);
    assert.equal(t3.tripNo, "TR-20260813-003");

    await pool.query(`UPDATE trips SET status = 'Pending' WHERE id = $1`, [t1.id]);
    await pool.query(`UPDATE trips SET status = 'Completed', deleted = FALSE WHERE id = $1`, [t3.id]);

    const t4 = await createStartTrip(d, day, 1300);
    assert.equal(t4.tripNo, "TR-20260813-004");
    assert.equal(t4.tripDate, day);
  });

  it("uses an independent sequence per selected date", async () => {
    const crewA = await seedCrew();
    const crewB = await seedCrew();
    const first = await createStartTrip(crewA, "2026-08-14", 2000);
    const otherDay = await createStartTrip(crewB, "2026-08-15", 2100);
    assert.equal(first.tripNo, "TR-20260814-001");
    assert.equal(otherDay.tripNo, "TR-20260815-001");
  });

  it("locks trip_date after create (number embeds the date)", async () => {
    const crew = await seedCrew();
    const trip = await createStartTrip(crew, "2026-08-16", 3000);
    await assert.rejects(
      () =>
        tripsService.save(trip.id, {
          tripDate: "2026-08-17",
          vehicleId: crew.vehicle.id,
          driverId: crew.driver.id,
          supervisorId: crew.supervisor.id,
          helpers: [crew.helper.employeeName],
          loaders: [crew.loader.employeeName],
          startStepSubmitted: true,
        }),
      (err: unknown) => err instanceof AppError && err.status === 422
    );
    const reloaded = await tripsService.getById(trip.id);
    assert.equal(reloaded.tripDate, "2026-08-16");
    assert.equal(reloaded.tripNo, trip.tripNo);
  });

  it("preview next-number API matches create allocation rule", async () => {
    const day = "2026-08-18";
    const previewEmpty = await getJson(baseUrl, `/api/trips/next-number?date=${day}`);
    assert.equal(previewEmpty.status, 200);
    assert.equal(previewEmpty.body.tripDate, day);
    assert.equal(previewEmpty.body.tripNo, "TR-20260818-001");

    const crew = await seedCrew();
    const created = await createStartTrip(crew, day, 4000);
    assert.equal(created.tripNo, "TR-20260818-001");

    const previewNext = await getJson(baseUrl, `/api/trips/next-number?date=${day}`);
    assert.equal(previewNext.status, 200);
    assert.equal(previewNext.body.tripNo, "TR-20260818-002");
  });

  it("POST /steps/start assigns number from selected body.tripDate", async () => {
    const crew = await seedCrew();
    const day = "2026-08-19";
    const created = await postJson(baseUrl, "/api/trips/steps/start", {
      tripDate: day,
      vehicleId: crew.vehicle.id,
      vehicleNo: crew.vehicle.vehicleNumber,
      driverId: crew.driver.id,
      driverName: crew.driver.employeeName,
      supervisorId: crew.supervisor.id,
      supervisorName: crew.supervisor.employeeName,
      helpers: [crew.helper.employeeName],
      loaders: [crew.loader.employeeName],
      openingMeter: 5000,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.tripDate, day);
    assert.equal(created.body.tripNo, "TR-20260819-001");
  });
});
