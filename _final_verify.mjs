// Final verification against the FIXED backend (port 4300).
// Also re-runs the stale-tripNo create against BOTH old(4000) and new(4300).
import pg from "pg";

const NEW = "http://localhost:4300/api";
const OLD = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

async function api(base, method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

const createdTripIds = [];
let vehId = null, empIds = [];

try {
  // ---- fresh dedicated fixtures ----
  const stamp = Date.now().toString().slice(-5);
  const tag = `Step1Fix${stamp}`;
  const v = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES ($1,$2,'Truck','Active') RETURNING id`, [20000 + Number(stamp), `TEST-${tag}`]);
  vehId = v.rows[0].id;
  const insEmp = async (name, dept) => {
    const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status) VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
      [21000 + Number(stamp), name, dept, `98999${90000 + Number(stamp)}${Math.floor(Math.random() * 90 + 10)}`, `${name.toLowerCase().replace(/\W+/g, "")}@fix.local`]);
    return r.rows[0].id;
  };
  const drvId = await insEmp(`FixDrv-${stamp}`, "Driver");
  const supId = await insEmp(`FixSup-${stamp}`, "Supervisor");
  const hlpId = await insEmp(`FixHlp-${stamp}`, "Helper");
  const lodId = await insEmp(`FixLod-${stamp}`, "Loader");
  empIds = [drvId, supId, hlpId, lodId];
  console.log(`fixtures: veh=${vehId} drv=${drvId} sup=${supId} hlp=${hlpId} lod=${lodId}`);

  const pocket = { tripDate: "2026-08-12", status: "Draft", startStepSubmitted: true, startTime: new Date().toISOString(), vehicleId: vehId, vehicleNo: `TEST-${tag}`, driverId: drvId, driverName: `FixDrv-${stamp}`, supervisorId: supId, supervisorName: `FixSup-${stamp}`, openingMeter: 1000, advanceAmount: 500, helpers: [`FixHlp-${stamp}`], loaders: [`FixLod-${stamp}`], remarks: "" };

  console.log("\n=== 1) REAL Step 1 create (fixed backend 4300) ===");
  const c1 = await api(NEW, "POST", "/trips/steps/start", pocket);
  console.log("  ", c1.status, JSON.stringify(c1.data?.error ?? c1.data?.tripNo ?? c1.data));
  check("1a create 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) {
    createdTripIds.push(c1.data.id);
    check("1b server-generated tripNo", /^TR-\d{8}-\d{3}$/.test(c1.data.tripNo ?? ""), `got ${c1.data.tripNo}`);
    check("1c startStepSubmitted true + id returned", c1.data.id > 0 && c1.data.startStepSubmitted === true);
    const ri = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1 AND deleted=FALSE`, [c1.data.id]);
    check("1d exactly ONE row", ri.rows[0].c === 1);

    console.log("\n=== 2) Stale-tripNo create (different vehicle) on FIXED 4300 ===");
    // Second, DIFFERENT-vehicle create that re-sends c1's JUST-USED tripNo.
    const pocket2 = { ...pocket, tripNo: c1.data.tripNo, vehicleId: 1, vehicleNo: "AP 39 AB 1234", driverId: supId, driverName: `FixSup-${stamp}`, supervisorId: drvId, supervisorName: `FixDrv-${stamp}`, helpers: [hlpId ? `FixHlp-${stamp}` : ""], loaders: [`FixLod-${stamp}`], openingMeter: 2000, advanceAmount: 300 };
    const c2 = await api(NEW, "POST", "/trips/steps/start", pocket2);
    console.log("  ", c2.status, JSON.stringify(c2.data?.error ?? c2.data?.tripNo ?? c2.data));
    check("2a no 'Duplicate record' 409 — server ignores client tripNo", c2.status === 201, `got ${c2.status} ${JSON.stringify(c2.data?.error)}`);
    if (c2.status === 201) {
      createdTripIds.push(c2.data.id);
      check("2b fresh server number != stale number", c2.data.tripNo !== c1.data.tripNo, `c1=${c1.data.tripNo} c2=${c2.data.tripNo}`);
      check("2c returned trip is complete Step 1", c2.data.startStepSubmitted === true && c2.data.vehicleId === 1);
    }

    console.log("\n=== 3) Existing-trip UPDATE (Update Start Details) on FIXED 4300 ===");
    const updatePayload = { tripDate: pocket.tripDate, tripNo: c1.data.tripNo, status: "Draft", startTime: new Date().toLocaleString(), vehicleId: vehId, vehicleNo: `TEST-${tag}`, driverId: drvId, driverName: `FixDrv-${stamp}`, supervisorId: supId, supervisorName: `FixSup-${stamp}`, openingMeter: 1500, advanceAmount: 750, helpers: [`FixHlp-${stamp}`], loaders: [`FixLod-${stamp}`], remarks: "", updatedAt: c1.data.updatedAt, startStepSubmitted: true };
    const u1 = await api(NEW, "POST", `/trips/${c1.data.id}/steps/start`, updatePayload);
    console.log("  ", u1.status, JSON.stringify(u1.data?.error ?? u1.data?.tripNo ?? u1.data));
    check("3a update 200", u1.status === 200, `got ${u1.status} ${JSON.stringify(u1.data)}`);
    check("3b SAME trip id", u1.data?.id === c1.data.id, `id=${u1.data?.id}`);
    check("3c SAME trip no (no new number)", u1.data?.tripNo === c1.data.tripNo, `got ${u1.data?.tripNo}`);
    check("3d persisted update", u1.data?.openingMeter === 1500 && u1.data?.advanceAmount === 750);
    const rc = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1`, [c1.data.id]);
    check("3e exactly ONE row for that id", rc.rows[0].c === 1);

    console.log("\n=== 4) Rapid double-submit (two concurrent POSTs, one intent) on FIXED 4300 ===");
    const pocket3 = { ...pocket, openingMeter: 3000, advanceAmount: 900 };
    const [d1, d2] = await Promise.all([
      api(NEW, "POST", "/trips/steps/start", pocket3),
      api(NEW, "POST", "/trips/steps/start", pocket3),
    ]);
    console.log(`  d1=${d1.status} ${JSON.stringify(d1.data?.error ?? d1.data?.tripNo)}`);
    console.log(`  d2=${d2.status} ${JSON.stringify(d2.data?.error ?? d2.data?.tripNo)}`);
    const created = [d1, d2].filter((r) => r.status === 201).map((r) => r.data.id);
    createdTripIds.push(...created);
    check("4a no 'Duplicate record' from race", ![d1, d2].some((r) => typeof r.data?.error === "string" && r.data.error.startsWith("Duplicate record")), JSON.stringify({ d1: d1.data?.error, d2: d2.data?.error }));
    check("4b at most ONE trip created from the two concurrent requests", created.length <= 1, `created=${created.length} (2 means a cross-session race; single-browser is blocked by client guards)`);
    const rowCount = await db(`SELECT COUNT(*)::int c FROM trips WHERE vehicle_id=$1 AND deleted=FALSE`, [vehId]);
    console.log("  active rows for fixture vehicle:", rowCount.rows[0].c);
  }
} finally {
  const ids = [...new Set(createdTripIds)].filter(Boolean);
  if (ids.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trip_boxes WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trip_media WHERE trip_id=ANY($1)`, [ids]);
    await db(`UPDATE fuel_expenses SET trip_id=NULL WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trips WHERE id=ANY($1)`, [ids]);
  }
  if (empIds.length) {
    await db(`UPDATE trip_crew SET employee_id=NULL WHERE employee_id=ANY($1)`, [empIds]);
    await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id=ANY($1) OR supervisor_id=ANY($1)`, [empIds]);
    await db(`DELETE FROM employees WHERE id=ANY($1)`, [empIds]);
  }
  if (vehId) {
    await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [vehId]);
    await db(`DELETE FROM vehicles WHERE id=$1`, [vehId]);
  }
  console.log("\ncleanup removed test trips:", JSON.stringify(ids), "emp", empIds, "veh", vehId);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);