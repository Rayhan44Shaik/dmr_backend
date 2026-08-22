// Definitive Step 1 flow test against the LIVE backend, using dedicated
// fresh fixtures so nothing collides with existing production rows.
import pg from "pg";

const API = "http://localhost:4000/api";
const TRIP_DATE = new Date().toISOString().split("T")[0];
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
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
let vehId = null, drvId = null, supId = null, hlprId = null, lodrId = null;

try {
  // ---- fixtures ----
  const tag = "Step1FlowTest";
  const v = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES ($1,$2,'Truck','Active') RETURNING id`, [12000, `TEST-${tag}-12000`]);
  vehId = v.rows[0].id;
  const insEmp = async (name, dept, no) => {
    const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status) VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
      [no, name, dept, `9${95000 + no}000`, `${name.toLowerCase().replace(/\W+/g, "")}@test.local`]);
    return r.rows[0].id;
  };
  drvId = await insEmp(`SFH Driver`, "Driver", 1301);
  supId = await insEmp(`SFH Supervisor`, "Supervisor", 1302);
  hlprId = await insEmp(`SFH Helper`, "Helper", 1303);
  lodrId = await insEmp(`SFH Loader`, "Loader", 1304);
  console.log("fixtures: veh", vehId, "drv", drvId, "sup", supId, "hlpr", hlprId, "lodr", lodrId);

  const payload = (opening = 1000, advance = 500) => ({
    tripDate: TRIP_DATE,
    tripNo: "",
    status: "Draft",
    startStepSubmitted: true,
    startTime: new Date().toISOString(),
    vehicleId: vehId,
    vehicleNo: `TEST-${tag}-12000`,
    driverId: drvId,
    driverName: "SFH Driver",
    supervisorId: supId,
    supervisorName: "SFH Supervisor",
    openingMeter: opening,
    advanceAmount: advance,
    helpers: ["SFH Helper"],
    loaders: ["SFH Loader"],
    remarks: "",
  });

  const before = await db(`SELECT COUNT(*)::int c FROM trips WHERE vehicle_id=$1`, [vehId]);
  console.log(`\ntrips before for fixture veh: ${before.rows[0].c}`);
  console.log("\n=== T1: EXACT frontend create (POST /trips/steps/start) ===");
  const c1 = await api("POST", "/trips/steps/start", payload());
  console.log("  status", c1.status, JSON.stringify(c1.data?.error ?? c1.data?.tripNo ?? "(no tripNo)"));
  check("T1 create 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) {
    createdTripIds.push(c1.data.id);
    check("T1 has id and tripNo", c1.data.id > 0 && /^TR-\d{8}-\d{3}$/.test(c1.data.tripNo), `id=${c1.data.id} tripNo=${c1.data.tripNo}`);
    check("T1 startStepSubmitted returned true", c1.data.startStepSubmitted === true);
    const rowCheck = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1 AND start_step_submitted=TRUE AND deleted=FALSE`, [c1.data.id]);
    check("T1 exactly one row, start submitted", rowCheck.rows[0].c === 1, `count=${rowCheck.rows[0].c}`);

    console.log("\n=== T2: EXACT frontend UPDATE (Update Start Details) ===");
    const updatePayload = {
      tripDate: TRIP_DATE, tripNo: c1.data.tripNo, status: "Draft",
      startTime: new Date().toLocaleString(), vehicleId: vehId, vehicleNo: `TEST-${tag}-12000`,
      driverId: drvId, driverName: "SFH Driver", supervisorId: supId, supervisorName: "SFH Supervisor",
      openingMeter: 1100, advanceAmount: 600, helpers: ["SFH Helper"], loaders: ["SFH Loader"],
      remarks: "", updatedAt: c1.data.updatedAt, startStepSubmitted: true,
    };
    const u1 = await api("POST", `/trips/${c1.data.id}/steps/start`, updatePayload);
    console.log("  status", u1.status, JSON.stringify(u1.data?.error ?? u1.data?.tripNo));
    check("T2 update 200", u1.status === 200, `got ${u1.status} ${JSON.stringify(u1.data)}`);
    check("T2 SAME id", u1.data?.id === c1.data.id, `id=${u1.data?.id} expected ${c1.data.id}`);
    check("T2 SAME tripNo (no new number)", u1.data?.tripNo === c1.data.tripNo, `got ${u1.data?.tripNo}`);
    check("T2 openingMeter persisted", u1.data?.openingMeter === 1100, `got ${u1.data?.openingMeter}`);
    const cnt2 = await db(`SELECT COUNT(*)::int c FROM trips WHERE id=$1 AND deleted=FALSE`, [c1.data.id]);
    check("T2 still exactly ONE trip row", cnt2.rows[0].c === 1);

    console.log("\n=== T3: SECOND update (different vehicle kept SAME trip) ===");
    const u2 = await api("POST", `/trips/${c1.data.id}/steps/start`, { ...updatePayload, openingMeter: 1200, updatedAt: u1.data.updatedAt });
    check("T3 update 200", u2.status === 200, `got ${u2.status} ${JSON.stringify(u2.data)}`);
    check("T3 SAME id + tripNo", u2.data?.id === c1.data.id && u2.data?.tripNo === c1.data.tripNo);
    check("T3 openingMeter 1200", u2.data?.openingMeter === 1200, `got ${u2.data?.openingMeter}`);
  }

  console.log("\n=== T4: SEQUENTIAL second submit on a NEW trip (double click, serialized) ===");
  const p2 = payload(2000, 300);
  const s1 = await api("POST", "/trips/steps/start", p2);
  check("T4 first create 201", s1.status === 201, `got ${s1.status} ${JSON.stringify(s1.data?.error ?? s1.data)}`);
  let s1Id = s1.data?.id;
  if (s1Id) createdTripIds.push(s1Id);
  // Re-post the SAME create payload AFTER first commit (resources now occupied)
  const s2 = await api("POST", "/trips/steps/start", { ...p2, startTime: new Date().toISOString() });
  console.log(`  second sequential same-payload create -> ${s2.status} ${JSON.stringify(s2.data?.error ?? s2.data?.tripNo)}`);
  const cnt4 = await db(`SELECT COUNT(*)::int c FROM trips WHERE vehicle_id=$1 AND deleted=FALSE`, [vehId]);
  check("T4 exactly TWO trips total (one per distinct create intent)", cnt4.rows[0].c === 2, `count=${cnt4.rows[0].c}`);

  console.log("\n=== T5: CONCURRENT double-submit for ONE new trip intent ===");
  const p3 = payload(3000, 700);
  const [d1, d2] = await Promise.all([
    api("POST", "/trips/steps/start", { ...p3, startTime: new Date().toISOString() }),
    api("POST", "/trips/steps/start", { ...p3, startTime: new Date().toISOString() }),
  ]);
  console.log(`  c1=${d1.status} ${JSON.stringify(d1.data?.error ?? d1.data?.tripNo)}`);
  console.log(`  c2=${d2.status} ${JSON.stringify(d2.data?.error ?? d2.data?.tripNo)}`);
  const createdNow = [d1, d2].filter((r) => r.status === 201).map((r) => r.data.id);
  createdTripIds.push(...createdNow);
  check("T5 ONLY ONE of the two concurrent creates succeeded", createdNow.length === 1, `created=${createdNow.length}`);
} finally {
  // ---- cleanup only OUR rows ----
  const ids = [...new Set(createdTripIds)].filter(Boolean);
  if (ids.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trip_boxes WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trip_media WHERE trip_id=ANY($1)`, [ids]);
    await db(`UPDATE fuel_expenses SET trip_id=NULL WHERE trip_id=ANY($1)`, [ids]);
    await db(`DELETE FROM trips WHERE id=ANY($1)`, [ids]);
  }
  if (vehId || drvId || supId || hlprId || lodrId) {
    const empIds = [drvId, supId, hlprId, lodrId].filter(Boolean);
    if (empIds.length) {
      await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id=ANY($1) OR supervisor_id=ANY($1)`, [empIds]);
      await db(`UPDATE trip_crew SET employee_id=NULL WHERE employee_id=ANY($1)`, [empIds]);
      await db(`DELETE FROM employees WHERE id=ANY($1)`, [empIds]);
    }
    await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [vehId]);
    await db(`DELETE FROM vehicles WHERE id=$1`, [vehId]);
  }
  console.log(`\ncleanup done; removed test trips ${JSON.stringify([...new Set(createdTripIds)])}`);
}
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);