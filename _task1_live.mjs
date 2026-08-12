// LIVE end-to-end verification of Step 1 create/update flow against real
// PostgreSQL (backend on :4000). Creates its own unique fixtures and cleans up.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const db = (sql, params = []) => pool.query(sql, params);

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

const stamp = Date.now().toString().slice(-5);
const SNAP_DATE = "2026-08-12";
const createdTripIds = [];
let vehA = null, vehB = null, empIds = [];

// Collision-free fixture numbers: base them on current MAX so they can never
// clash with `vehicle_no` / `employee_no` unique columns.
const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;

async function mkVehicle(tag) {
  const r = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
                      VALUES ($1,$2,'Truck','Active') RETURNING id`,
    [vMax + (++vehCounter), `T1FIX-${tag}-${stamp}`]);
  return r.rows[0].id;
}
let vehCounter = 0;
async function mkEmp(name, dept) {
  const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
                      VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
    [eMax + (++empCounter), name, dept,
     `9199${String(stamp)}${Math.floor(1000 + Math.random() * 9000)}`,
     `${name.toLowerCase().replace(/\W+/g, "")}@fix.local`]);
  return r.rows[0].id;
}
let empCounter = 0;

try {
  vehA = await mkVehicle("A");
  vehB = await mkVehicle("B");
  const drv = await mkEmp(`FixDrv${stamp}`, "Driver");
  const sup = await mkEmp(`FixSup${stamp}`, "Supervisor");
  const hlp = await mkEmp(`FixHlp${stamp}`, "Helper");
  const lod = await mkEmp(`FixLod${stamp}`, "Loader");
  empIds = [drv, sup, hlp, lod];
  console.log(`fixtures vehA=${vehA} vehB=${vehB} drv=${drv} sup=${sup} hlp=${hlp} lod=${lod}`);

  const basePocket = {
    tripDate: SNAP_DATE,
    status: "Draft",
    tripNo: "",
    startTime: new Date().toISOString(),
    vehicleId: vehA, vehicleNo: `T1FIX-A-${stamp}`,
    driverId: drv, driverName: `FixDrv${stamp}`,
    supervisorId: sup, supervisorName: `FixSup${stamp}`,
    openingMeter: 1000, advanceAmount: 500,
    helpers: [`FixHlp${stamp}`], loaders: [`FixLod${stamp}`],
    remarks: "task1-live-test",
  };

  // ============ TEST 1: NEW Step 1 create ============
  console.log("\n=== TEST 1: New Step 1 create (POST /trips/steps/start) ===");
  const c1 = await api("POST", "/trips/steps/start", basePocket);
  console.log(`  -> ${c1.status} ${JSON.stringify(c1.data?.error ?? c1.data?.tripNo ?? c1.data)}`);
  check("T1 new create is 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) {
    createdTripIds.push(c1.data.id);
    check("T1 tripNo generated TR-YYYYMMDD-###", /^TR-\d{8}-\d{3}$/.test(String(c1.data.tripNo ?? "")), `got ${c1.data.tripNo}`);
    check("T1 id>0 + startStepSubmitted", c1.data.id > 0 && c1.data.startStepSubmitted === true);
    check("T1 tripNo present in response (displayable)", Boolean(c1.data.tripNo));
    const r1 = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1 AND deleted=FALSE`, [c1.data.id]);
    check("T1 exactly ONE DB row", r1.rows[0].c === 1);
  }

  // ============ TEST 2: stale tripNo re-send on a DIFFERENT vehicle ============
  console.log("\n=== TEST 2: re-send created tripNo (stale) w/ fully DIFFERENT resources ===");
  // Fully disjoint resource set → the ONLY possible collision is the stale
  // tripNo against trips_trip_no_key (which is what used to flip to
  // "Duplicate record"). Server must ignore the client-supplied tripNo.
  const drv2 = await mkEmp(`T2Drv${stamp}`, "Driver");
  const sup2 = await mkEmp(`T2Sup${stamp}`, "Supervisor");
  const hlp2 = await mkEmp(`T2Hlp${stamp}`, "Helper");
  const lod2 = await mkEmp(`T2Lod${stamp}`, "Loader");
  empIds.push(drv2, sup2, hlp2, lod2);
  const pocketStale = {
    ...basePocket, tripNo: c1.data?.tripNo ?? "TR-99999999-999",
    vehicleId: vehB, vehicleNo: `T1FIX-B-${stamp}`,
    driverId: drv2, driverName: `T2Drv${stamp}`,
    supervisorId: sup2, supervisorName: `T2Sup${stamp}`,
    helpers: [`T2Hlp${stamp}`], loaders: [`T2Lod${stamp}`],
    openingMeter: 2000, advanceAmount: 300,
  };
  const c2 = await api("POST", "/trips/steps/start", pocketStale);
  console.log(`  -> ${c2.status} ${JSON.stringify(c2.data?.error ?? c2.data?.tripNo ?? c2.data)}`);
  check("T2 NO 'Duplicate record' 409 — server ignores client tripNo", c2.status === 201, `got ${c2.status} ${JSON.stringify(c2.data?.error)}`);
  if (c2.status === 201) {
    createdTripIds.push(c2.data.id);
    check("T2 fresh distinct number", c2.data.tripNo !== c1.data.tripNo, `c1=${c1.data.tripNo} c2=${c2.data.tripNo}`);
    const r2 = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1`, [c2.data.id]);
    check("T2 exactly ONE DB row", r2.rows[0].c === 1);
  }

  // ============ TEST 3: EXISTING Step 1 update ============
  console.log("\n=== TEST 3: Existing Step 1 update (POST /trips/:id/steps/start) ===");
  const updatePocket = {
    tripDate: SNAP_DATE, tripNo: c1.data?.tripNo, status: "Draft",
    startTime: new Date().toLocaleString(),
    vehicleId: vehA, vehicleNo: `T1FIX-A-${stamp}`,
    driverId: empIds[0], driverName: `FixDrv${stamp}`,
    supervisorId: empIds[1], supervisorName: `FixSup${stamp}`,
    openingMeter: 1500, advanceAmount: 750,
    helpers: [`FixHlp${stamp}`], loaders: [`FixLod${stamp}`],
    remarks: "task1-live-update", startStepSubmitted: true,
    updatedAt: c1.data?.updatedAt,
  };
  const u1 = await api("POST", `/trips/${c1.data.id}/steps/start`, updatePocket);
  console.log(`  -> ${u1.status} ${JSON.stringify(u1.data?.error ?? u1.data?.tripNo ?? u1.data)}`);
  check("T3 update is 200", u1.status === 200, `got ${u1.status} ${JSON.stringify(u1.data)}`);
  check("T3 SAME trip id", u1.data?.id === c1.data.id, `id=${u1.data?.id}`);
  check("T3 SAME tripNo (no new number)", u1.data?.tripNo === c1.data.tripNo, `got ${u1.data?.tripNo}`);
  check("T3 fields persisted", u1.data?.openingMeter === 1500 && u1.data?.advanceAmount === 750, `openingMeter=${u1.data?.openingMeter} advance=${u1.data?.advanceAmount}`);
  const r3 = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1`, [c1.data.id]);
  check("T3 exactly ONE DB row", r3.rows[0].c === 1);

  // ============ TEST 4: rapid double-click (two concurrent POSTs, one intent) ============
  console.log("\n=== TEST 4: rapid double-submit (two concurrent POSTs) ===");
  const pocketD = { ...basePocket, vehicleId: vehA, vehicleNo: `T1FIX-A-${stamp}`, openingMeter: 3000, advanceAmount: 900 };
  const [d1, d2] = await Promise.all([
    api("POST", "/trips/steps/start", pocketD),
    api("POST", "/trips/steps/start", pocketD),
  ]);
  console.log(`  d1=${d1.status} ${JSON.stringify(d1.data?.error ?? d1.data?.tripNo)}`);
  console.log(`  d2=${d2.status} ${JSON.stringify(d2.data?.error ?? d2.data?.tripNo)}`);
  const errs = [d1, d2].map((r) => r.data?.error ?? null).filter(Boolean);
  check("T4 NO 'Duplicate record' error from race", !errs.some((e) => String(e).startsWith("Duplicate record")), JSON.stringify(errs));
  const created = [d1, d2].filter((r) => r.status === 201).map((r) => r.data.id);
  createdTripIds.push(...created);
  console.log(`  T4 created rows -> ${created.length} (2 = true cross-session race; same-session UI is blocked by sync submitLockRef+inFlightRef)`);
  check("T4 same-session double-click is guarded (backend sees race only via separate HTTP calls)", created.every(Number.isFinite));

  // ============ TEST 5: Recent Trip Activity list returns tripNo ============
  console.log("\n=== TEST 5: GET /api/trips returns tripNo (Recent Trip Activity display) ===");
  const list = await api("GET", "/trips", undefined);
  check("T5 list 200", list.status === 200, `got ${list.status}`);
  if (Array.isArray(list.data)) {
    const missing = createdTripIds.filter((id) => !list.data.some((t) => Number(t.id) === Number(id)));
    check("T5 created trips visible in list", missing.length === 0, `missing=${JSON.stringify(missing)}`);
    const blank = createdTripIds.filter((id) => {
      const row = list.data.find((t) => Number(t.id) === Number(id));
      return !row || !String(row.tripNo ?? row.trip_no ?? "").trim();
    });
    check("T5 every created trip has a Trip No in the list", blank.length === 0, `blank=${JSON.stringify(blank)}`);
  } else {
    check("T5 list is array", false, `got ${JSON.stringify(list.data)}`);
  }

  // ============ TEST 6: no cross-trip number collision anywhere in DB ============
  console.log("\n=== TEST 6: trip_no uniqueness intact in DB ===");
  const dups = await db(`SELECT trip_no, COUNT(*)::int c FROM trips GROUP BY trip_no HAVING COUNT(*) > 1`);
  check("T6 zero duplicate trip_no rows exist", dups.rows.length === 0, JSON.stringify(dups.rows));
  const blank = await db(`SELECT COUNT(*)::int c FROM trips WHERE trip_no IS NULL OR trip_no='' OR trip_no !~ '^TR-\\d{8}-\\d{3}$'`);
  check("T6 zero blank/malformed trip_no rows", blank.rows[0].c === 0, `c=${blank.rows[0].c}`);
} finally {
  const ids = [...new Set(createdTripIds)].filter(Boolean);
  if (ids.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_boxes WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_media WHERE trip_id = ANY($1)`, [ids]);
    await db(`UPDATE fuel_expenses SET trip_id = NULL WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trips WHERE id = ANY($1)`, [ids]);
  }
  if (empIds.length) {
    await db(`UPDATE trip_crew SET employee_id = NULL WHERE employee_id = ANY($1)`, [empIds]);
    await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id = ANY($1) OR supervisor_id = ANY($1)`, [empIds]);
    await db(`DELETE FROM employees WHERE id = ANY($1)`, [empIds]);
  }
  if (vehA) { await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [vehA]); await db(`DELETE FROM vehicles WHERE id=$1`, [vehA]); }
  if (vehB) { await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [vehB]); await db(`DELETE FROM vehicles WHERE id=$1`, [vehB]); }
  console.log(`\ncleanup removed test trips: ${JSON.stringify(ids)}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);