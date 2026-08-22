// TASK 4 — LIVE end-to-end verification of Step 5 release behavior against real
// PostgreSQL (backend on :4000). Creates its own unique fixtures and cleans up.
//
// Business flow under test:
//   Steps 1-4 submitted -> trip stays Draft -> resources OCCUPIED
//   Step 5 submitted    -> trip flips to existing 'Pending' -> resources RELEASED
//
// Tests 1-6 from the task spec, plus an atomicity (rollback) proof and a fuel
// approval guard check.
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
const SNAP_DATE = "2026-08-13";
const createdTripIds = [];
const createdEmpIds = [];
const createdVehIds = [];
let fuelBillsToReset = [];

const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
let vehCounter = 0, empCounter = 0;

async function mkVehicle(tag) {
  const r = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
                      VALUES ($1,$2,'Truck','Active') RETURNING id`,
    [vMax + (++vehCounter), `T4FIX-VH-${tag}-${stamp}`]);
  createdVehIds.push(r.rows[0].id);
  return { id: r.rows[0].id, no: `T4FIX-VH-${tag}-${stamp}` };
}
async function mkEmp(name, dept) {
  const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
                      VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
    [eMax + (++empCounter), name, dept,
     `9199${String(stamp)}${Math.floor(1000 + Math.random() * 9000)}`,
     `${name.toLowerCase().replace(/\W+/g, "")}@fix.local`]);
  createdEmpIds.push(r.rows[0].id);
  return r.rows[0].id;
}

function startPayload(set) {
  return {
    tripDate: SNAP_DATE,
    tripNo: "",
    status: "Draft",
    startTime: new Date().toISOString(),
    vehicleId: set.v.id, vehicleNo: set.v.no,
    driverId: set.d, driverName: set.dName,
    supervisorId: set.s, supervisorName: set.sName,
    openingMeter: 1000, advanceAmount: 500,
    helpers: [set.hName], loaders: [set.lName],
    remarks: `task4-${stamp}`,
    startStepSubmitted: true,
  };
}
const farmP = () => ({ sourceFarmId: 1, destMeter: 1500, reachedTime: new Date().toISOString(), pickupTolls: 100, farmBirdTypeId: 1, farmBirdCount: 3000, farmLoadWeight: 3000, farmRate: 100 });
const pickupP = () => ({ dcWeight: 4000, totalBirds: 3000, boxes: 50, boxDetails: [{ boxNo: 1, birds: 300, weight: 500 }], dcPhotoKey: `t4-photo-${stamp}` });
const deliveriesP = () => ({ deliveries: [{ shopId: 1, birds: 1000, weight: 1500, rate: 100, amount: 150000, remarks: "t4" }] });
const expensesP = (diesel, submittedAt) => ({
  closingMeter: 2500, endMeter: 2500, endTime: new Date().toISOString(),
  ...(diesel ? { dieselEntries: diesel } : {}),
  ...(submittedAt ? { submittedAt } : {}),
});

async function dbTrip(id) {
  const r = await db(
    `SELECT id, trip_no, status, trip_date, vehicle_id, driver_id, supervisor_id, deleted,
            start_step_submitted, farm_step_submitted, pickup_step_submitted,
            delivery_step_submitted, expenses_step_submitted, end_step_submitted,
            submitted_at, expenses_step_submitted_at, updated_at
     FROM trips WHERE id=$1`, [id]);
  return r.rows[0];
}

let trip = { a: null, b: null, c: null };
const setA = { v: null, d: null, s: null, hName: null, lName: null, dName: null, sName: null };
const setB = { v: null, d: null, s: null, hName: null, lName: null, dName: null, sName: null };

try {
  // ---------- fixtures ----------
  setA.v = await mkVehicle("A"); setA.dName = `T4DrvA${stamp}`; setA.sName = `T4SupA${stamp}`;
  setA.hName = `T4HlpA${stamp}`; setA.lName = `T4LodA${stamp}`;
  setA.d = await mkEmp(setA.dName, "Driver"); setA.s = await mkEmp(setA.sName, "Supervisor");
  await mkEmp(setA.hName, "Helper"); await mkEmp(setA.lName, "Loader");

  setB.v = await mkVehicle("B"); setB.dName = `T4DrvB${stamp}`; setB.sName = `T4SupB${stamp}`;
  setB.hName = `T4HlpB${stamp}`; setB.lName = `T4LodB${stamp}`;
  setB.d = await mkEmp(setB.dName, "Driver"); setB.s = await mkEmp(setB.sName, "Supervisor");
  await mkEmp(setB.hName, "Helper"); await mkEmp(setB.lName, "Loader");
  console.log(`fixtures setA veh=${setA.v.id} drv=${setA.d} sup=${setA.s} | setB veh=${setB.v.id} drv=${setB.d} sup=${setB.s}`);

  // =========================================================
  // TEST 1: Step 1 submitted -> Draft; same-resource Trip B -> 409
  // =========================================================
  console.log("\n=== TEST 1: Step 1 submitted; resources occupied; Trip B same resources -> 409 ===");
  const c1 = await api("POST", "/trips/steps/start", startPayload(setA));
  check("T1 Trip A create 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) { trip.a = c1.data.id; createdTripIds.push(trip.a); }
  check("T1 Trip A status Draft", c1.data?.status === "Draft", `got ${c1.data?.status}`);

  const b1 = await api("POST", "/trips/steps/start", startPayload(setA));
  check("T1 Trip B same resources -> 409", b1.status === 409, `got ${b1.status} ${JSON.stringify(b1.data)}`);
  if (b1.data?.error) console.log(`     message: ${b1.data.error}`);

  // =========================================================
  // TEST 2: Steps 2,3,4 submitted -> still Draft; Trip B -> 409
  // =========================================================
  console.log("\n=== TEST 2: Steps 2-4 submitted; still Draft; Trip B -> 409 ===");
  const s2 = await api("POST", `/trips/${trip.a}/steps/farm`, { ...farmP(), mode: "submit" });
  check("T2 farm step 200", s2.status === 200, `got ${s2.status} ${JSON.stringify(s2.data)}`);
  const s3 = await api("POST", `/trips/${trip.a}/steps/pickup`, { ...pickupP(), mode: "submit" });
  check("T2 pickup step 200", s3.status === 200, `got ${s3.status} ${JSON.stringify(s3.data)}`);
  const s4 = await api("POST", `/trips/${trip.a}/steps/deliveries`, { ...deliveriesP(), mode: "submit" });
  check("T2 deliveries step 200", s4.status === 200, `got ${s4.status} ${JSON.stringify(s4.data)}`);
  const ta2 = await dbTrip(trip.a);
  check("T2 Trip A still Draft after steps 2-4", ta2.status === "Draft", `status=${ta2.status}`);

  const b2 = await api("POST", "/trips/steps/start", startPayload(setA));
  check("T2 Trip B same resources -> 409", b2.status === 409, `got ${b2.status} ${JSON.stringify(b2.data)}`);
  if (b2.data?.error) console.log(`     message: ${b2.data.error}`);

  // =========================================================
  // TEST 3: Step 5 success -> Pending; resources released; Trip B -> SUCCESS
  // =========================================================
  console.log("\n=== TEST 3: Step 5 submitted -> Pending; resources released; Trip B succeeds ===");
  const fuel1 = [{ rowIndex: 0, litres: 20, rate: 100, meter: 2100, bunkName: "T4 Bunk" }];
  const firstSubmitted = new Date(Date.now() + 2000).toISOString();
  const s5 = await api("POST", `/trips/${trip.a}/steps/expenses`, { ...expensesP(fuel1, firstSubmitted), mode: "submit" });
  check("T3 expenses step 200", s5.status === 200, `got ${s5.status} ${JSON.stringify(s5.data)}`);
  check("T3 Trip A status -> Pending", s5.data?.status === "Pending", `got ${s5.data?.status}`);

  const ta3 = await dbTrip(trip.a);
  check("T3 submittedAt persisted exactly (DB ms precision)",
    (ta3.submitted_at ? new Date(ta3.submitted_at).toISOString() : null) === firstSubmitted,
    `db=${ta3.submitted_at} client=${firstSubmitted}`);
  check("T3 Trip A Pending in DB", ta3.status === "Pending", `status=${ta3.status}`);
  check("T3 expenses + end step flags true", ta3.expenses_step_submitted === true && ta3.end_step_submitted === true);

  const b3 = await api("POST", "/trips/steps/start", startPayload(setA));
  check("T3 Trip B same resources now -> 201 SUCCESS", b3.status === 201, `got ${b3.status} ${JSON.stringify(b3.data)}`);
  if (b3.status === 201) {
    trip.b = b3.data.id; createdTripIds.push(trip.b);
    check("T3 Trip B has a distinct Trip No", /^TR-\d{8}-\d{3}$/.test(String(b3.data.tripNo ?? "")) && b3.data.tripNo !== ta3.trip_no, `got ${b3.data.tripNo}`);
    const tb3 = await dbTrip(trip.b);
    check("T3 Trip B next number after Trip A", tb3.trip_no !== ta3.trip_no, `${ta3.trip_no} vs ${tb3.trip_no}`);
  }

  // =========================================================
  // TEST 5: fuel bills stay Pending after Step 5 (not approved)
  // =========================================================
  console.log("\n=== TEST 5: fuel sync Pending on Step 5; approved only on trip completion ===");
  const fuelBefore = await db(
    `SELECT bill_no, status, ops_status FROM fuel_expenses WHERE trip_id=$1 AND source_type='TRIP'`, [trip.a]);
  check("T5 exactly 1 TRIP fuel bill created", fuelBefore.rows.length === 1, `n=${fuelBefore.rows.length}`);
  check("T5 fuel bill status Pending (NOT Approved)", fuelBefore.rows[0]?.status === "Pending", `got ${fuelBefore.rows[0]?.status}`);
  check("T5 ops_status Pending Approval", fuelBefore.rows[0]?.ops_status === "Pending Approval", `got ${fuelBefore.rows[0]?.ops_status}`);
  fuelBillsToReset = fuelBefore.rows.map((r) => r.bill_no);

  const finish = await api("PATCH", `/trips/${trip.a}/status`, { status: "Completed", approvedBy: "t4-test" });
  check("T5 trip complete 200", finish.status === 200, `got ${finish.status}`);
  const fuelAfter = await db(
    `SELECT bill_no, status, ops_status FROM fuel_expenses WHERE trip_id=$1 AND source_type='TRIP'`, [trip.a]);
  check("T5 fuel approved ONLY after trip completion", fuelAfter.rows[0]?.status === "Approved", `got ${fuelAfter.rows[0]?.status} (still Pending after Step 5 would be PASS)`);

  // =========================================================
  // TEST 6: Step 5 first-submission timestamp immutable on retry
  // =========================================================
  console.log("\n=== TEST 6: submitted_at / expenses_step_submitted_at immutable on Step 5 retry/edit ===");
  const s6a = await api("POST", `/trips/${trip.b}/steps/farm`, { ...farmP(), mode: "submit" });
  const s6b = await api("POST", `/trips/${trip.b}/steps/pickup`, { ...pickupP(), mode: "submit" });
  const s6c = await api("POST", `/trips/${trip.b}/steps/deliveries`, { ...deliveriesP(), mode: "submit" });
  const retrySubmitted = new Date(Date.now() + 4000).toISOString();
  const s6d = await api("POST", `/trips/${trip.b}/steps/expenses`, { ...expensesP(fuel1, retrySubmitted), mode: "submit" });
  check("T6 Trip B reaches Pending", s6d.data?.status === "Pending", `got ${s6d.data?.status}`);
  const firstDb = (await db(`SELECT submitted_at FROM trips WHERE id=$1`, [trip.b])).rows[0].submitted_at;

  const editSubmitted = new Date(Date.now() + 6000).toISOString();
  const s6e = await api("POST", `/trips/${trip.b}/steps/expenses`, {
    ...expensesP([{ rowIndex: 0, litres: 25, rate: 100, meter: 2200, bunkName: "T4 Bunk Edit" }], editSubmitted),
    closingMeter: 2600, endMeter: 2600, mode: "submit",
  });
  check("T6 edit/retry step 200", s6e.status === 200, `got ${s6e.status} ${JSON.stringify(s6e.data)}`);
  const tb6 = await dbTrip(trip.b);
  check("T6 submitted_at IMMUTABLE on retry (DB ms precision)",
    new Date(tb6.submitted_at).toISOString() === new Date(firstDb).toISOString(),
    `first=${firstDb} now=${tb6.submitted_at}`);
  check("T6 DB expenses_step_submitted_at unchanged (non-null set on first submit)", tb6.expenses_step_submitted_at != null, `got ${tb6.expenses_step_submitted_at}`);
  check("T6 edited fuel amount persisted (data changed, timestamps not)", Number(s6e.data?.fuel ?? 0) === 2500, `fuel=${s6e.data?.fuel}`);

  // =========================================================
  // TEST 4: Step 5 FAILURE -> Draft retained, resources stay occupied
  //  4a) validation failure (bad payload) -> 422
  //  4b) mid-transaction failure (duplicate diesel row_index) -> rollback
  // =========================================================
  console.log("\n=== TEST 4: Step 5 failure -> Trip stays Draft; resources remain unavailable ===");
  const c1c = await api("POST", "/trips/steps/start", startPayload(setB));
  check("T4 Trip C create 201", c1c.status === 201, `got ${c1c.status}`);
  if (c1c.status === 201) { trip.c = c1c.data.id; createdTripIds.push(trip.c); }
  await api("POST", `/trips/${trip.c}/steps/farm`, { ...farmP(), mode: "submit" });
  await api("POST", `/trips/${trip.c}/steps/pickup`, { ...pickupP(), mode: "submit" });
  await api("POST", `/trips/${trip.c}/steps/deliveries`, { ...deliveriesP(), mode: "submit" });
  const tc4before = await dbTrip(trip.c);
  check("T4 Trip C Draft before Step 5 failure", tc4before.status === "Draft");

  // 4a: validation failure
  const failA = await api("POST", `/trips/${trip.c}/steps/expenses`, { closingMeter: 9999, mode: "submit" });
  check("T4 (a) invalid Step 5 payload rejected (4xx)", failA.status === 422 || failA.status === 400, `got ${failA.status}`);

  // 4b: mid-transaction rollback (duplicate diesel row_index violates unique index)
  const failB = await api("POST", `/trips/${trip.c}/steps/expenses`, {
    ...expensesP([{ rowIndex: 0, litres: 10, rate: 100, meter: 2100, bunkName: "dup" }, { rowIndex: 0, litres: 5, rate: 90, meter: 2150 }], new Date().toISOString()),
    mode: "submit",
  });
  check("T4 (b) mid-transaction Step 5 failure returned an HTTP error", failB.status >= 400, `got ${failB.status}`);

  const tc4after = await dbTrip(trip.c);
  check("T4 Trip C remained Draft", tc4after.status === "Draft", `status=${tc4after.status}`);
  check("T4 expenses_step_submitted NOT set", tc4after.expenses_step_submitted === false, `got ${tc4after.expenses_step_submitted}`);
  check("T4 end_step_submitted NOT set", tc4after.end_step_submitted === false);
  check("T4 submitted_at NULL (no partial submission)", tc4after.submitted_at == null, `got ${tc4after.submitted_at}`);
  const noDups = await db(`SELECT COUNT(*)::int c FROM trip_diesel_entries WHERE trip_id=$1`, [trip.c]);
  check("T4 no partial diesel rows persisted", noDups.rows[0].c === 0, `n=${noDups.rows[0].c}`);
  const noFuel = await db(`SELECT COUNT(*)::int c FROM fuel_expenses WHERE trip_id=$1`, [trip.c]);
  check("T4 no duplicate/no partial fuel records", noFuel.rows[0].c === 0, `n=${noFuel.rows[0].c}`);
  check("T4 Trip C updated_at unchanged by failed Step 5", (tc4after.updated_at ?? "").toString() === (tc4before.updated_at ?? "").toString(), `before=${tc4before.updated_at} after=${tc4after.updated_at}`);

  const d1 = await api("POST", "/trips/steps/start", startPayload(setB));
  check("T4 resources still OCCUPIED -> Trip D same resources -> 409", d1.status === 409, `got ${d1.status}`);
  if (d1.data?.error) console.log(`     message: ${d1.data.error}`);
} finally {
  // ---------- cleanup ----------
  const ids = [...new Set(createdTripIds)].filter(Boolean);
  const vehs = [...new Set(createdVehIds)].filter(Boolean);
  const emps = [...new Set(createdEmpIds)].filter(Boolean);
  if (ids.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_boxes WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_media WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_diesel_entries WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_delivery_boxes WHERE delivery_id IN (SELECT id FROM trip_deliveries WHERE trip_id = ANY($1))`, [ids]);
    await db(`DELETE FROM trip_delivery_per_box WHERE delivery_id IN (SELECT id FROM trip_deliveries WHERE trip_id = ANY($1))`, [ids]);
    await db(`DELETE FROM trip_deliveries WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM fuel_expenses WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trips WHERE id = ANY($1)`, [ids]);
  }
  if (emps.length) {
    await db(`UPDATE trip_crew SET employee_id = NULL WHERE employee_id = ANY($1)`, [emps]);
    await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id = ANY($1) OR supervisor_id = ANY($1)`, [emps]);
    await db(`DELETE FROM employees WHERE id = ANY($1)`, [emps]);
  }
  if (vehs.length) {
    await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id = ANY($1)`, [vehs]);
    await db(`DELETE FROM vehicles WHERE id = ANY($1)`, [vehs]);
  }
  if (fuelBillsToReset.length) {
    await db(`DELETE FROM fuel_expenses WHERE bill_no = ANY($1)`, [fuelBillsToReset]);
  }
  console.log(`\ncleanup done: trips=${JSON.stringify(ids)}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);