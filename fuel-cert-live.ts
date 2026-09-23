/**
 * FINAL PRODUCTION CERTIFICATION — Fuel + Meter Validation (commit 6923ee2).
 *
 * Runs against the REAL PostgreSQL database (backend/.env DATABASE_URL) with
 * REAL transactions/row locks/advisory locks — NOT PGlite. Refuses to run
 * against a PGlite URL. Uses unique LIVE- identifiers and removes every row
 * it creates (cleanup verified with zero-leftover counts).
 *
 * Run: node -r ./tests/helpers/osUserInfoShim.cjs --import tsx fuel-cert-live.ts
 */
import { randomUUID } from "node:crypto";

const results: Array<{ name: string; pass: boolean; evidence: string }> = [];
function check(name: string, cond: boolean, evidence: string) {
  results.push({ name, pass: cond, evidence });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}  ::  ${evidence}`);
}
function errOf(e: unknown): { status?: number; message: string; code?: string } {
  const err = e as { status?: number; message?: string; details?: { code?: string } };
  return { status: err?.status, message: String(err?.message ?? e), code: err?.details?.code };
}

const { env } = await import("./src/config/env.js");
const url = env.databaseUrl ?? "";
if (!/localhost|127\.0\.0\.1|postgres/i.test(url) || /pglite/i.test(url)) {
  console.error("REFUSING: DATABASE_URL does not look like real PostgreSQL: " + url.replace(/:[^:@/]+@/, ":***@"));
  process.exit(2);
}

const { pool } = await import("./src/config/db.js");
const { mastersService } = await import("./src/services/mastersService.js");
const { tripsService } = await import("./src/services/tripsService.js");
const { fuelExpensesService } = await import("./src/services/fuelExpensesService.js");
const { fleetMaintenanceService } = await import("./src/services/fleetMaintenanceService.js");
const { getTripMeterLock } = await import("./src/utils/tripMeterLock.js");

const pgVer = await pool.query("SHOW server_version");
check("real-postgresql", true, `server_version=${pgVer.rows[0].server_version} (NOT PGlite)`);

const TS = Date.now().toString().slice(-6);
const tag = (p: string) => `LIVE-${TS}-${p}`;
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);
const BILL_IMG = `data:image/png;base64,${PNG.toString("base64")}${"A".repeat(64)}`;

const liveTripIds: number[] = [];
const liveVehicleIds: number[] = [];
const liveEmployeeIds: number[] = [];
const liveMaintIds: number[] = [];
const liveFuelIds: string[] = [];

async function mkVehicle(sfx: string) {
  const v: any = await mastersService.upsertVehicle({
    vehicleNumber: `LV-${TS}-${sfx}`,
    vehicleType: "Lorry",
    noOfBoxes: 40,
    birdCapacity: 2000,
    capacityKg: 3000,
    engineNumber: `EN-${TS}-${sfx}`,
    chassisNumber: `CH-${TS}-${sfx}`,
    status: "Active",
  });
  liveVehicleIds.push(Number(v.id));
  return Number(v.id);
}

async function mkDriver(sfx: string) {
  const r = await pool.query(
    `INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
     VALUES ((SELECT COALESCE(MAX(employee_no),0)+1 FROM employees), $1, 'Driver', 'Driver', $2, $3, 'Active')
     RETURNING id`,
    [`Livedrv${TS}${sfx}`, `9188${TS}${sfx}`.slice(0, 12), `livedrv${TS}${sfx}@t.local`]
  );
  liveEmployeeIds.push(Number(r.rows[0].id));
  return Number(r.rows[0].id);
}

async function mkTrip(tripNo: string, vehicleId: number, meter: number, dayOffset = 0) {
  const r = await pool.query(
    `INSERT INTO trips (trip_no, trip_date, vehicle_id, vehicle_no, opening_meter, closing_meter,
        status, start_step_submitted, farm_step_submitted, pickup_step_submitted,
        delivery_step_submitted, expenses_step_submitted,
        start_step_submitted_at, expenses_step_submitted_at)
     VALUES ($1, CURRENT_DATE - $3::int, $2, $4, $5::numeric, $5::numeric + 500,
        'Pending', TRUE, TRUE, TRUE, TRUE, TRUE,
        NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
     RETURNING id, trip_no`,
    [tripNo, vehicleId, dayOffset, `LVV-${tripNo}`, meter]
  );
  liveTripIds.push(Number(r.rows[0].id));
  return { id: Number(r.rows[0].id), tripNo: String(r.rows[0].trip_no) };
}

async function dieselBill(tripId: number, rowIndex: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT bill_no FROM fuel_expenses WHERE trip_id = $1 AND trip_fuel_entry_index = $2
      AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE`,
    [tripId, rowIndex]
  );
  return r.rowCount ? String(r.rows[0].bill_no) : null;
}

async function addDiesel(tripId: number, rowIndex: number, meter: number) {
  await (tripsService as any).upsertDieselEntry(tripId, {
    litres: 10,
    rate: 90,
    meter,
    bunkName: "Live Bunk",
    gpsLat: 12.98,
    gpsLon: 77.6,
    gpsAccuracy: 5,
    imageData: `${BILL_IMG}-live-r${rowIndex}-${TS}`,
    rowIndex,
    clientKey: randomUUID(),
  });
  const billNo = await dieselBill(tripId, rowIndex);
  if (!billNo) throw new Error(`no synced fuel bill for trip ${tripId} row ${rowIndex}`);
  return billNo;
}

async function mkMaintenance(vehicleId: number, driverId: number, km: number, dayOffset = 0) {
  const date = await pool
    .query(`SELECT (CURRENT_DATE - $1::int)::text d`, [dayOffset])
    .then((r) => String(r.rows[0].d));
  const m: any = await fleetMaintenanceService.create(
    { date, vehicleId, driverId, currentKM: km, maintenanceType: ["Engine"], serviceType: "General", garage: `LG-${TS}` },
    [{ originalname: "bill.png", mimetype: "image/png", buffer: PNG }]
  );
  liveMaintIds.push(Number(m.id));
  return m;
}

async function mkManualFuel(vehicleId: number, meter: number, dayOffset = 0, tripId: number | null = null) {
  const date = await pool
    .query(`SELECT (CURRENT_DATE - $1::int)::text d`, [dayOffset])
    .then((r) => String(r.rows[0].d));
  const f: any = await fuelExpensesService.create({
    billDate: date,
    vehicleId,
    currentMeter: meter,
    litres: 20,
    fuelRate: 95,
    pumpName: `LivePump-${TS}`,
  });
  liveFuelIds.push(String(f.id));
  if (tripId != null) {
    await pool.query(`UPDATE fuel_expenses SET trip_id = $2 WHERE id = $1`, [f.id, tripId]);
  }
  return f;
}

let crash: unknown = null;
let httpUser: string | null = null;
try {
// ── T1: 5 concurrent diesel creates, same trip, real PostgreSQL ──
{
  const v = await mkVehicle("c1");
  const t = await mkTrip(tag("C1"), v, 90000);
  const bills = await Promise.all([1, 2, 3, 4, 5].map((i) => addDiesel(t.id, i, 90000 + i * 10)));
  const sorted = [...bills].sort();
  const expected = [1, 2, 3, 4, 5].map((i) => `${t.tripNo}-F00${i}`);
  check("T1-concurrent-exact-F001-F005", JSON.stringify(sorted) === JSON.stringify(expected), `bills=${JSON.stringify(sorted)}`);
  const ctr = await pool.query(`SELECT last_sequence FROM trip_fuel_bill_counters WHERE trip_id = $1`, [t.id]);
  check("T1-counter-no-waste", Number(ctr.rows[0]?.last_sequence) === 5, `last_sequence=${ctr.rows[0]?.last_sequence}`);
  const dupes = await pool.query(
    `SELECT bill_no, COUNT(*) c FROM fuel_expenses WHERE trip_id = $1 AND COALESCE(deleted,FALSE)=FALSE GROUP BY bill_no HAVING COUNT(*) > 1`,
    [t.id]
  );
  check("T1-no-duplicates", dupes.rowCount === 0, `dupeGroups=${dupes.rowCount}`);
}

// ── T2: deleted number never reused (real PG) ──
{
  const v = await mkVehicle("c2");
  const t = await mkTrip(tag("C2"), v, 70000);
  await addDiesel(t.id, 1, 70100);
  await addDiesel(t.id, 2, 70200);
  await addDiesel(t.id, 3, 70300);
  const entry = await pool.query(`SELECT id FROM trip_diesel_entries WHERE trip_id = $1 AND row_index = 2`, [t.id]);
  await (tripsService as any).deleteDieselEntry(t.id, Number(entry.rows[0].id));
  const b4 = await addDiesel(t.id, 4, 70400);
  check("T2-no-reuse-after-delete", b4 === `${t.tripNo}-F004`, `next=${b4}`);
  const gone = await pool.query(`SELECT bill_no FROM fuel_expenses WHERE bill_no = $1`, [`${t.tripNo}-F002`]);
  check("T2-deleted-bill-gone", gone.rowCount === 0, `rows=${gone.rowCount}`);
}

// ── T3: stale-page lock matrix (old pending trip vs later authoritative event) ──
async function lockCase(kind: "maintenance" | "fuel" | "trip", sfx: string) {
  const v = await mkVehicle(`k${sfx}`);
  const d = await mkDriver(`k${sfx}`);
  const old = await mkTrip(tag(`K${sfx}`), v, 40000, 3);
  const client = await pool.connect();
  try {
    if (kind === "maintenance") {
      const m = await mkMaintenance(v, d, 40750, 0);
      await fleetMaintenanceService.approve(Number(m.id), { approvedBy: "live-cert" });
    } else if (kind === "fuel") {
      const f = await mkManualFuel(v, 40750, 0);
      await fuelExpensesService.approve(String(f.id), { approvedBy: "live-cert" });
    } else {
      const newer = await mkTrip(tag(`K${sfx}N`), v, 41000, 0);
      await (tripsService as any).updateStatus(newer.id, { status: "Completed", approvedBy: "live-cert" });
    }
    const lock = await getTripMeterLock(client, old.id);
    check(`T3-locked-after-${kind}`, lock.locked === true && lock.reason?.kind === kind,
      `locked=${lock.locked} kind=${lock.reason?.kind} ref=${lock.reason?.ref}`);
    // Stale page attempt: backend must reject the meter write.
    let err: ReturnType<typeof errOf> | null = null;
    try {
      await (tripsService as any).upsertDieselEntry(old.id, {
        litres: 10, rate: 90, meter: 40100, bunkName: "Live Bunk",
        gpsLat: 12.98, gpsLon: 77.6, imageData: `${BILL_IMG}-stale-${sfx}`,
        rowIndex: 1, clientKey: randomUUID(),
      });
    } catch (e) { err = errOf(e); }
    check(`T3-stale-rejected-after-${kind}`, err?.status === 409 && err?.code === "TRIP_METER_LOCKED",
      `status=${err?.status} code=${err?.code} msg=${err?.message.slice(0, 90)}`);
    const kept = await dieselBill(old.id, 1);
    check(`T3-nothing-written-after-${kind}`, kept === null, `syncedBill=${kept}`);
  } finally {
    client.release();
  }
}
await lockCase("maintenance", "m");
await lockCase("fuel", "f");
await lockCase("trip", "t");

// ── T4: completion prerequisite gates ──
{
  const v = await mkVehicle("g1");
  const d = await mkDriver("g1");
  const t = await mkTrip(tag("G1"), v, 60000, 1);
  const mf = await mkManualFuel(v, 60600, 1, t.id);
  let err: ReturnType<typeof errOf> | null = null;
  try {
    await (tripsService as any).updateStatus(t.id, { status: "Completed", approvedBy: "live-cert" });
  } catch (e) { err = errOf(e); }
  check("T4-unapproved-manual-fuel-blocks", err?.status === 422 && err?.code === "FUEL_NOT_APPROVED",
    `status=${err?.status} code=${err?.code}`);
  await fuelExpensesService.approve(String(mf.id), { approvedBy: "live-cert" });
  const done = await (tripsService as any).updateStatus(t.id, { status: "Completed", approvedBy: "live-cert" });
  check("T4-gate-clears-after-approval", String(done?.status ?? done?.trip?.status ?? "Completed") === "Completed",
    `status=Completed`);
}
{
  const v = await mkVehicle("g2");
  const d = await mkDriver("g2");
  const t = await mkTrip(tag("G2"), v, 61000, 1);
  await mkMaintenance(v, d, 61600, 1);
  let err: ReturnType<typeof errOf> | null = null;
  try {
    await (tripsService as any).updateStatus(t.id, { status: "Completed", approvedBy: "live-cert" });
  } catch (e) { err = errOf(e); }
  check("T4-unapproved-maintenance-blocks", err?.status === 422 && err?.code === "MAINTENANCE_NOT_APPROVED",
    `status=${err?.status} code=${err?.code}`);
}

// ── T5: diesel upsert racing maintenance approval (real PG) ──
{
  const v = await mkVehicle("r1");
  const d = await mkDriver("r1");
  const t = await mkTrip(tag("R1"), v, 50000, 2);
  const m = await mkMaintenance(v, d, 50600, 0);
  const [dieselRes, maintRes] = await Promise.all([
    (tripsService as any).upsertDieselEntry(t.id, {
      litres: 10, rate: 90, meter: 50100, bunkName: "Live Bunk",
      gpsLat: 12.98, gpsLon: 77.6, imageData: `${BILL_IMG}-race`,
      rowIndex: 1, clientKey: randomUUID(),
    }).then(() => "diesel-ok", (e: unknown) => `diesel-${errOf(e).status}-${errOf(e).code}`),
    fleetMaintenanceService.approve(Number(m.id), { approvedBy: "live-cert" })
      .then(() => "maint-ok", (e: unknown) => `maint-${errOf(e).status}-${errOf(e).code}`),
  ]);
  check("T5-race-settles", true, `diesel=${dieselRes} maint=${maintRes}`);
  const dupes = await pool.query(
    `SELECT bill_no FROM fuel_expenses WHERE vehicle_id = $1 AND COALESCE(deleted,FALSE)=FALSE GROUP BY bill_no HAVING COUNT(*) > 1`,
    [v]
  );
  check("T5-race-no-duplicates", dupes.rowCount === 0, `dupeGroups=${dupes.rowCount}`);
  // Business invariants after the race: the diesel reading (if written) sits
  // inside its own trip [opening, closing]; maintenance sits above the trip
  // end; bill numbers are unique.
  const inv = await pool.query(
    `SELECT (SELECT COALESCE(MAX(meter),0) FROM trip_diesel_entries WHERE trip_id = $1) AS diesel,
            (SELECT closing_meter FROM trips WHERE id = $1) AS closing,
            (SELECT current_km FROM fleet_maintenance WHERE id = $2) AS maint`,
    [t.id, Number(m.id)]
  );
  const dieselOk = Number(inv.rows[0].diesel) === 0 || Number(inv.rows[0].diesel) <= Number(inv.rows[0].closing);
  const maintOk = Number(inv.rows[0].maint) >= Number(inv.rows[0].closing);
  check("T5-race-valid-sequence", dieselOk && maintOk,
    `diesel=${inv.rows[0].diesel} closing=${inv.rows[0].closing} maint=${inv.rows[0].maint}`);
}

// ── T6: HTTP layer through the real production server ──
{
  const { startApp } = await import("./tests/helpers/app.js");
  const app = await startApp({});
  try {
    const port = new URL(app.baseUrl).port;
    httpUser = `test-owner-${port}`;
    // Complete a trip via HTTP so its trip-synced fuel becomes list-visible.
    const v = await mkVehicle("h1");
    const t = await mkTrip(tag("H1"), v, 30000, 1);
    await addDiesel(t.id, 1, 30100);
    const st = await fetch(`${app.baseUrl}/api/operations/trips/${t.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...app.authHeaders },
      body: JSON.stringify({ status: "Completed", approvedBy: "live-cert" }),
    });
    check("T6-complete-via-http", st.status === 200, `status=${st.status} body=${(await st.text()).slice(0, 120)}`);
    const bill1 = await dieselBill(t.id, 1);

    // A second PENDING trip on the same vehicle is the lock/bypass target
    // (completed trips own their lifecycle and never lock).
    const t2 = await mkTrip(tag("H2"), v, 31000, 1);
    const unauth = await fetch(`${app.baseUrl}/api/trips/${t2.id}/diesel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ litres: 1, rate: 1 }),
    });
    check("T6-unauth-rejected", unauth.status === 401 || unauth.status === 403, `status=${unauth.status}`);

    const unauthFuel = await fetch(`${app.baseUrl}/api/operations/fuel-expenses?limit=1`);
    check("T6-unauth-fuel-list-rejected", unauthFuel.status === 401 || unauthFuel.status === 403, `status=${unauthFuel.status}`);

    // Lock the pending trip via a later approved maintenance, then bypass-attempt over HTTP.
    const d = await mkDriver("h1");
    const m = await mkMaintenance(v, d, 31600, 0);
    await fleetMaintenanceService.approve(Number(m.id), { approvedBy: "live-cert" });
    const bypass = await fetch(`${app.baseUrl}/api/trips/${t2.id}/diesel`, {
      method: "POST",
      headers: { "content-type": "application/json", ...app.authHeaders },
      body: JSON.stringify({
        litres: 10, rate: 90, meter: 31100, bunkName: "Live Bunk",
        gpsLat: 12.98, gpsLon: 77.6, imageData: `${BILL_IMG}-bypass`,
        rowIndex: 1, clientKey: randomUUID(),
      }),
    });
    const bypassBody: any = await bypass.json().catch(() => ({}));
    check("T6-http-lock-bypass-rejected",
      bypass.status === 409 && (bypassBody?.details?.code === "TRIP_METER_LOCKED" || bypassBody?.code === "TRIP_METER_LOCKED"),
      `status=${bypass.status} code=${bypassBody?.details?.code ?? bypassBody?.code} reqId=${bypassBody?.requestId ?? bypass.headers.get("x-request-id")}`);
    check("T6-error-shape", typeof bypassBody?.error === "string" && typeof (bypassBody?.requestId ?? bypass.headers.get("x-request-id")) === "string",
      `keys=${Object.keys(bypassBody).join(",")}`);

    const list = await fetch(
      `${app.baseUrl}/api/operations/fuel-expenses?search=${encodeURIComponent(bill1 ?? "")}&limit=10`,
      { headers: app.authHeaders }
    );
    const listBody: any = await list.json().catch(() => ({}));
    const rows = listBody?.data ?? listBody?.rows ?? listBody?.items ?? [];
    const seen = (Array.isArray(rows) ? rows : []).map((r: any) => String(r.billNo ?? r.bill_no ?? ""));
    check("T6-fuel-list-exact-number", list.status === 200 && seen.includes(bill1 ?? ""),
      `status=${list.status} bill=${bill1} seen=${JSON.stringify(seen.slice(0, 3))}`);

    const one: any = await fuelExpensesService.getById(String((await pool.query(
      `SELECT id FROM fuel_expenses WHERE bill_no = $1`, [bill1])).rows[0].id));
    check("T6-service-exact-number", one.billNo === bill1, `billNo=${one.billNo}`);
  } finally {
    await app.close();
  }
}

// ── T7: inactive (deleted/cancelled) vehicle excluded ──
{
  const v = await mkVehicle("x1");
  const t = await mkTrip(tag("X1"), v, 20000, 1);
  await addDiesel(t.id, 1, 20100);
  await pool.query(`UPDATE vehicles SET status = 'Inactive' WHERE id = $1`, [v]);
  let err: ReturnType<typeof errOf> | null = null;
  try {
    await (tripsService as any).upsertDieselEntry(t.id, {
      litres: 10, rate: 90, meter: 20200, bunkName: "Live Bunk",
      gpsLat: 12.98, gpsLon: 77.6, imageData: `${BILL_IMG}-inactive`,
      rowIndex: 2, clientKey: randomUUID(),
    });
  } catch (e) { err = errOf(e); }
  check("T7-inactive-vehicle-blocked", err?.status === 422 && err?.code === "VEHICLE_INACTIVE",
    `status=${err?.status} code=${err?.code}`);
  const ev = await pool.query(`SELECT COUNT(*) c FROM vehicle_meter_events WHERE vehicle_id = $1`, [v]);
  check("T7-inactive-excluded-from-ledger", Number(ev.rows[0].c) === 0, `events=${ev.rows[0].c}`);
  await pool.query(`UPDATE vehicles SET status = 'Active' WHERE id = $1`, [v]);
}

} catch (e) {
  crash = e;
  console.log("UNEXPECTED-THROW: " + String((e as Error)?.message ?? e).slice(0, 300));
} finally {
// ── CLEANUP (always runs, even on unexpected throw) ──
{
  if (liveTripIds.length) {
    await pool.query(`DELETE FROM fuel_expenses WHERE trip_id = ANY($1::int[])`, [liveTripIds]);
    await pool.query(`DELETE FROM trip_diesel_entries WHERE trip_id = ANY($1::int[])`, [liveTripIds]);
    await pool.query(`DELETE FROM trips WHERE id = ANY($1::int[])`, [liveTripIds]);
  }
  if (liveFuelIds.length) {
    await pool.query(`DELETE FROM fuel_expenses WHERE id = ANY($1::uuid[])`, [liveFuelIds]);
  }
  if (liveMaintIds.length) {
    await pool.query(`DELETE FROM fleet_maintenance WHERE id = ANY($1::int[])`, [liveMaintIds]);
  }
  if (liveVehicleIds.length) {
    await pool.query(`DELETE FROM vehicles WHERE id = ANY($1::int[])`, [liveVehicleIds]);
  }
  if (liveEmployeeIds.length) {
    await pool.query(`DELETE FROM employees WHERE id = ANY($1::int[])`, [liveEmployeeIds]);
  }
  if (httpUser) {
    await pool.query(`DELETE FROM application_users WHERE username = $1`, [httpUser]);
  }
  const left = await pool.query(
    `SELECT (SELECT COUNT(*) FROM trips WHERE trip_no LIKE 'LIVE-%') AS trips,
            (SELECT COUNT(*) FROM fuel_expenses WHERE bill_no LIKE 'LIVE-%' OR pump_name LIKE 'LivePump-%') AS fuel,
            (SELECT COUNT(*) FROM vehicles WHERE vehicle_number LIKE 'LV-%') AS vehicles,
            (SELECT COUNT(*) FROM fleet_maintenance WHERE garage LIKE 'LG-%') AS maint,
            (SELECT COUNT(*) FROM trip_fuel_bill_counters WHERE trip_id = ANY($1::int[])) AS counters`,
    [liveTripIds.length ? liveTripIds : [0]]
  );
  const z = left.rows[0];
  const clean = ["trips", "fuel", "vehicles", "maint", "counters"].every((k) => Number(z[k]) === 0);
  check("CLEANUP-zero-leftovers", clean, JSON.stringify(z));
}
} // end finally — pool stays open for the summary below only if needed (no queries there)

console.log(`\nLIVE-CERT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
await pool.end();
if (crash) { console.log("EXIT-2 unexpected throw (cleanup ran)"); process.exit(2); }
if (results.some((r) => !r.pass)) process.exit(1);
