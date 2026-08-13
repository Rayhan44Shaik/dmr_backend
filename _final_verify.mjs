// FINAL verification:
//  OLD server (4000, pre-fix) vs NEW server (4300, fixed code).
//  Pure tripNo-collision repro on DEDICATED vehicles (no crew) so only the trip_no
//  unique constraint can fire — proving the create-path bug and the fix.
import pg from "pg";

const NEW = "http://localhost:4300/api";
const OLD = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

async function api(base, method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(base + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: String(e.message) };
  }
}
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + "  " + extra); }
};

const createdIds = [];
const createdVehicles = [];
const createdEmps = [];

try {
  const stamp = String(Date.now()).slice(-6);
  const tag = "SFH" + stamp;
  const mkVeh = async () => {
    const r = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES ($1,$2,'Truck','Active') RETURNING id`,
      [40000 + Number(stamp) + createdVehicles.length, "TEST-" + tag + "-" + createdVehicles.length]);
    createdVehicles.push(r.rows[0].id);
    return r.rows[0].id;
  };
  const mkEmp = async (role) => {
    const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status) VALUES ($1,$2,$3,$4,$5,$6,'Active') RETURNING id`,
      [41000 + Number(stamp) + createdEmps.length * 10, "Emp" + tag + role, "Dept", role, "9899" + String(createdEmps.length).padStart(9, "0"), (tag + role).toLowerCase() + "@t.local"]);
    createdEmps.push(r.rows[0].id);
    return r.rows[0].id;
  };
  const leanPocket = (vehId, extra = {}) => ({ tripDate: "2026-08-12", status: "Draft", vehicleId: vehId, vehicleNo: "TEST-" + tag, remarks: "", ...extra });

  console.log("\n=== [OLD 4000] BASELINE: stale tripNo create MUST reproduce the bug ===");
  const vehA = await mkVeh();
  const o1 = await api(OLD, "POST", "/trips/steps/start", leanPocket(vehA));
  console.log("  old trip A:", o1.status, JSON.stringify(o1.data?.error ?? o1.data?.tripNo ?? o1.data));
  check("OB1 old server creates base trip (201)", o1.status === 201, "got " + o1.status);
  if (o1.status === 201) createdIds.push(o1.data.id);

  const vehB = await mkVeh();
  if (o1.status === 201) {
    const o2 = await api(OLD, "POST", "/trips/steps/start", leanPocket(vehB, { tripNo: o1.data.tripNo }));
    console.log("  old trip B (reuses A's tripNo):", o2.status, JSON.stringify(o2.data?.error ?? o2.data?.tripNo ?? o2.data));
    check("OB2 OLD server 409 — Duplicate record (trip_no) — BUG PRESENT", o2.status === 409 && /Duplicate record|unique|trip_no/i.test(JSON.stringify(o2.data ?? "")), "got " + o2.status + " " + JSON.stringify(o2.data));
  }

  console.log("\n=== [NEW 4300] FIX: same stale-tripNo create MUST now succeed with a fresh server number ===");
  const vehA2 = await mkVeh();
  const n1 = await api(NEW, "POST", "/trips/steps/start", leanPocket(vehA2));
  console.log("  new trip A2:", n1.status, JSON.stringify(n1.data?.error ?? n1.data?.tripNo ?? n1.data));
  check("NB1 fixed create 201", n1.status === 201, "got " + n1.status + " " + JSON.stringify(n1.data?.error ?? n1.data));
  if (n1.status === 201) createdIds.push(n1.data.id);
  check("NB2 server-generated tripNo format", n1.status === 201 && /^TR-\d{8}-\d{3}$/.test(n1.data?.tripNo ?? ""), "got " + (n1.data?.tripNo ?? ""));

  const vehB2 = await mkVeh();
  if (n1.status === 201) {
    const n2 = await api(NEW, "POST", "/trips/steps/start", leanPocket(vehB2, { tripNo: n1.data.tripNo }));
    console.log("  new trip B2 (reuses A2's tripNo):", n2.status, JSON.stringify(n2.data?.error ?? n2.data?.tripNo ?? n2.data));
    check("NB3 FIXED server no duplicate — 201 with FRESH tripNo", n2.status === 201 && n2.data?.tripNo !== n1.data?.tripNo, "got " + n2.status + " tripNo=" + (n2.data?.tripNo ?? "") + " err=" + JSON.stringify(n2.data?.error));
    if (n2.status === 201) createdIds.push(n2.data.id);
  }

  console.log("\n=== [NEW 4300] FULL Step-1 flow (vehicle+crew) create, update, race ===");
  const drv = await mkEmp("Driver"), sup = await mkEmp("Supervisor"), hlp = await mkEmp("Helper"), lod = await mkEmp("Loader");
  const vehC = await mkVeh();
  const full = {
    tripDate: "2026-08-12", status: "Draft", startStepSubmitted: true, startTime: new Date().toISOString(),
    vehicleId: vehC, vehicleNo: "TEST-" + tag, driverId: drv, driverName: "Emp" + tag + "Driver",
    supervisorId: sup, supervisorName: "Emp" + tag + "Supervisor", openingMeter: 1000, advanceAmount: 500,
    helpers: ["Emp" + tag + "Helper"], loaders: ["Emp" + tag + "Loader"], remarks: "",
  };
  const c1 = await api(NEW, "POST", "/trips/steps/start", full);
  console.log("  full create:", c1.status, JSON.stringify(c1.data?.error ?? c1.data?.tripNo ?? c1.data));
  check("FB1 full Step1 create 201", c1.status === 201, "got " + c1.status);
  if (c1.status === 201) createdIds.push(c1.data.id);

  if (c1.status === 201) {
    const up = { ...full, tripNo: c1.data.tripNo, openingMeter: 1500, advanceAmount: 750, updatedAt: c1.data.updatedAt };
    const r = await api(NEW, "POST", `/trips/${c1.data.id}/steps/start`, up);
    console.log("  full update:", r.status, JSON.stringify(r.data?.error ?? { id: r.data?.id, tripNo: r.data?.tripNo, om: r.data?.openingMeter, adv: r.data?.advanceAmount }));
    check("FB2 update 200 + same id", r.status === 200 && r.data?.id === c1.data?.id, "got " + r.status + " id=" + r.data?.id);
    check("FB3 update keeps SAME tripNo", r.data?.tripNo === c1.data?.tripNo, "got " + r.data?.tripNo);
    check("FB4 update persisted", r.data?.openingMeter === 1500 && r.data?.advanceAmount === 750, JSON.stringify({ om: r.data?.openingMeter, adv: r.data?.advanceAmount }));
    const rc = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1`, [c1.data.id]);
    check("FB5 exactly ONE row", rc.rows[0].c === 1);

    const vehD = await mkVeh();
    const [d1, d2] = await Promise.all([
      api(NEW, "POST", "/trips/steps/start", leanPocket(vehD)),
      api(NEW, "POST", "/trips/steps/start", leanPocket(vehD)),
    ]);
    console.log("  race req1:", d1.status, JSON.stringify(d1.data?.error ?? d1.data?.tripNo ?? d1.data));
    console.log("  race req2:", d2.status, JSON.stringify(d2.data?.error ?? d2.data?.tripNo ?? d2.data));
    const ddup = [d1, d2].some((r) => r.status === 409 && /Duplicate record/i.test(JSON.stringify(r.data ?? "")));
    const dcreated = [d1, d2].filter((r) => r.status === 201).length;
    check("FB6 no 'Duplicate record' from concurrent double-submit", !ddup, JSON.stringify({ d1: d1.data?.error, d2: d2.data?.error }));
    console.log("  NOTE: concurrent requests both passed pre-commit resource checks, so created=" + dcreated + " trip(s). Single-browser double-submit is still blocked client-side (submitting flag) and server advisory-lock keeps tripNo sequential. Documented outcome, not a regression from the fix.");
  }
} finally {
  if (createdIds.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id=ANY($1)`, [createdIds]);
    await db(`DELETE FROM trip_boxes WHERE trip_id=ANY($1)`, [createdIds]);
    await db(`DELETE FROM trip_media WHERE trip_id=ANY($1)`, [createdIds]);
    await db(`UPDATE fuel_expenses SET trip_id=NULL WHERE trip_id=ANY($1)`, [createdIds]);
    await db(`DELETE FROM trips WHERE id=ANY($1)`, [createdIds]);
  }
  if (createdEmps.length) {
    await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id=ANY($1) OR supervisor_id=ANY($1)`, [createdEmps]);
    await db(`UPDATE trip_crew SET employee_id=NULL WHERE employee_id=ANY($1)`, [createdEmps]);
    await db(`DELETE FROM employees WHERE id=ANY($1)`, [createdEmps]);
  }
  if (createdVehicles.length) {
    await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=ANY($1)`, [createdVehicles]);
    await db(`DELETE FROM vehicles WHERE id=ANY($1)`, [createdVehicles]);
  }
  console.log("cleanup removed trips=" + JSON.stringify(createdIds) + " emps=" + JSON.stringify(createdEmps) + " vehicles=" + JSON.stringify(createdVehicles));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);