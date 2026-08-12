/**
 * Trip Entry — live API + PostgreSQL verification suite (v2).
 * Runs against http://localhost:4000/api (the running backend).
 *
 * Phase 0: existing Draft trip #52 holds the PRIMARY resource set
 *   (veh2 AP16AB1234 / Rahim / Ruhulla / Anil / Babu). Completing it through
 *   Steps 2-5 (→ Pending) is required before any NEW trip can use those same
 *   resources — exactly the real-world blocker the user hit. This phase also
 *   proves TEST 11 (occupied before Step 5) and TEST 12 (released after Step 5).
 * Phase 1: numbering tests on 2026-08-12 with three disjoint resource sets.
 * Phase 2: resource-conflict 409 messages, same-trip edit, save progress,
 *          refresh, and double-submit safety.
 */
import pg from "pg";

const API = process.env.API_BASE || "http://localhost:4000/api";
const TRIP_DATE = "2026-08-12";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });

let PASSED = 0;
let FAILED = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) { PASSED++; console.log(`  PASS  ${name}`); }
  else { FAILED++; failures.push(name); console.log(`  FAIL  ${name}  ${extra}`); }
}

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

function step1(vehId, vehNo, drvId, drvName, supId, supName, helpers, loaders, extra = {}) {
  return {
    tripDate: TRIP_DATE, tripNo: "", status: "Draft", startStepSubmitted: true,
    startTime: new Date().toLocaleString(),
    vehicleId: vehId, vehicleNo: vehNo, driverId: drvId, driverName: drvName,
    supervisorId: supId, supervisorName: supName,
    openingMeter: 1000, advanceAmount: 500, helpers, loaders, remarks: "", ...extra,
  };
}

// Disjoint resource sets (names match DB masters expanded with fixtures).
const A = { veh: { id: 2, no: "AP16AB1234" }, drv: { id: 6, name: "Rahim" }, sup: { id: 7, name: "Ruhulla" }, helpers: ["Anil"], loaders: ["Babu"] };
const B = { veh: { id: 3, no: "AP16AC5678" }, drv: { id: 0, name: "" }, sup: { id: 2, name: "Suresh Reddy Bandi" }, helpers: ["Kareem"], loaders: ["Saleem"] };
const C = { veh: { id: 0, no: "TEST-VH-9000" }, drv: { id: 0, name: "" }, sup: { id: 0, name: "" }, helpers: [], loaders: [] };

let fx = {};
async function addFixtures() {
  fx.empIds = [];
  const insEmp = async (name, dept, no) => {
    const r = await db(
      `INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
       VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
      [no, name, dept, `9${90000 + no}000`, `${name.toLowerCase().replace(/\W+/g, "")}@test.local`]
    );
    const id = r.rows[0].id;
    fx.empIds.push(id);
    return id;
  };
  fx.drvAlpha = await insEmp("TripTest DriverAlpha", "Driver", 1011);
  fx.drvBravo = await insEmp("TripTest DriverBravo", "Driver", 1012);
  fx.supAlpha = await insEmp("TripTest SupervisorAlpha", "Supervisor", 1013);
  fx.helperAlpha = await insEmp("TripTest HelperAlpha", "Helper", 1014);
  fx.loaderAlpha = await insEmp("TripTest LoaderAlpha", "Loader", 1015);
  const v = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES (9000,'TEST-VH-9000','Truck','Active') RETURNING id`);
  fx.vehTest = v.rows[0].id;

  B.drv = { id: fx.drvAlpha, name: "TripTest DriverAlpha" };
  C.veh = { id: fx.vehTest, no: "TEST-VH-9000" };
  C.drv = { id: fx.drvBravo, name: "TripTest DriverBravo" };
  C.sup = { id: fx.supAlpha, name: "TripTest SupervisorAlpha" };
  C.helpers = ["TripTest HelperAlpha"];
  C.loaders = ["TripTest LoaderAlpha"];
  console.log("  fixtures set (B.drv, C.*)  vehTest=", fx.vehTest);
}
async function removeFixtures() {
  const empIds = fx.empIds || [];
  if (empIds.length) {
    await db(`UPDATE trips SET driver_id=NULL, supervisor_id=NULL WHERE driver_id=ANY($1) OR supervisor_id=ANY($1)`, [empIds]);
    await db(`UPDATE trip_crew SET employee_id=NULL WHERE employee_id=ANY($1)`, [empIds]);
    await db(`DELETE FROM employees WHERE id=ANY($1)`, [empIds]);
  }
  if (fx.vehTest) {
    await db(`UPDATE trips SET vehicle_id=NULL WHERE vehicle_id=$1`, [fx.vehTest]);
    await db(`DELETE FROM vehicles WHERE id=$1`, [fx.vehTest]);
  }
  console.log("  fixtures removed");
}

async function completeTrip(id) {
  const st2 = await api("POST", `/trips/${id}/steps/farm`, { mode: "submit", sourceFarmId: 1, sourceFarm: "Sri Venkateswara Farm", destMeter: 1500, pickupTolls: 2, reachedTime: new Date().toLocaleString() });
  if (st2.status !== 200) return `farm ${st2.status} ${JSON.stringify(st2.data)}`;
  const st3 = await api("POST", `/trips/${id}/steps/pickup`, { mode: "submit", dcWeight: 1000, totalBirds: 2000, boxes: 20, avgWeight: 0.5, boxDetails: [{ boxNo: 1, birds: 100, weight: 50 }], dcPhotoKey: "TEST-DC-PHOTO" });
  if (st3.status !== 200) return `pickup ${st3.status} ${JSON.stringify(st3.data)}`;
  const st4 = await api("POST", `/trips/${id}/steps/deliveries`, { mode: "submit", deliveries: [{ shopId: 1, shopName: "City Broiler DMR", birds: 2000, weight: 940, mortality: 0, amount: 50000 }] });
  if (st4.status !== 200) return `deliveries ${st4.status} ${JSON.stringify(st4.data)}`;
  const st5 = await api("POST", `/trips/${id}/steps/expenses`, { mode: "submit", closingMeter: 2050, endMeter: 2050, deliveryTolls: 3, endTime: new Date().toLocaleString(), meals: 200, driverBata: 400, helperBata: 100 });
  if (st5.status !== 200) return `expenses ${st5.status} ${JSON.stringify(st5.data)}`;
  return null;
}

const createdTrips = [];

async function main() {
  console.log("========== PHASE 0 — existing draft trip #52 ==========");
  const base = await db(`SELECT id, trip_no, status, deleted FROM trips ORDER BY id`);
  console.log("  existing trips:", base.rows.map((r) => `#${r.id} ${r.trip_no} (${r.status},del=${r.deleted})`).join(", "));
  const draft52 = await db(`SELECT id FROM trips WHERE id=52 AND status='Draft' AND deleted=FALSE`);
  if (!draft52.rowCount) {
    console.log("  NOTE: trip #52 not present/inactive — skipping its completion phase.");
  } else {
    const occ = await api("POST", "/trips/steps/start", step1(A.veh.id, A.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders));
    check("P0 TEST11: primary resources occupied while #52 Draft -> 409", occ.status === 409, `got ${occ.status} ${occ.data?.error}`);
    check("P0 TEST11: 409 cites #52 trip", /TR-20260811-001/.test(occ.data?.error ?? ""), `got ${occ.data?.error}`);

    console.log("  completing trip #52 (Steps 2-5)...");
    const err52 = await completeTrip(52);
    check("P0 complete trip #52", err52 === null, err52 || "");
    const s52 = await db(`SELECT status, start_step_submitted, farm_step_submitted, pickup_step_submitted, delivery_step_submitted, expenses_step_submitted FROM trips WHERE id=52`);
    const r52 = s52.rows[0];
    check("P0 TEST12: #52 status=Pending after Step 5", r52.status === "Pending", `status=${r52.status}`);
    check("P0 TEST12: all steps submitted", r52.start_step_submitted && r52.farm_step_submitted && r52.pickup_step_submitted && r52.delivery_step_submitted && r52.expenses_step_submitted);

    const rel = await api("POST", "/trips/steps/start", step1(A.veh.id, A.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders));
    if (rel.status === 201) {
      createdTrips.push(rel.data.id);
      console.log(`  P0 TEST12: resources released -> created #${rel.data.id} ${rel.data.tripNo} (will be cleaned up)`);
      await api("DELETE", `/trips/${rel.data.id}`, { reason: "P0 release check cleanup" });
      check("P0 TEST12: released resources created a trip (201)", true);
    } else {
      check("P0 TEST12: released resources created a trip (201)", false, `got ${rel.status} ${rel.data?.error}`);
    }
  }

  console.log("\n========== SETUP fixtures ==========");
  await addFixtures();

  try {
    // ------------------------------------------------------------------
    console.log("\n========== TEST 1 — new trip uses set A -> 001 ==========");
    const t1 = await api("POST", "/trips/steps/start", step1(A.veh.id, A.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders));
    check("TEST1 201", t1.status === 201, `got ${t1.status} ${JSON.stringify(t1.data)}`);
    if (t1.status === 201) {
      createdTrips.push(t1.data.id);
      check("TEST1 tripNo=TR-20260812-001", t1.data.tripNo === "TR-20260812-001", `got ${t1.data.tripNo}`);
      check("TEST1 startStepSubmitted returned true", t1.data.startStepSubmitted === true);
      const cnt = await db(`SELECT COUNT(*) c FROM trips WHERE trip_date=$1::date AND deleted=FALSE AND vehicle_id=$2`, [TRIP_DATE, A.veh.id]);
      check("TEST1 exactly one trip for this vehicle", Number(cnt.rows[0].c) === 1, `count=${cnt.rows[0].c}`);
    }

    console.log("========== TEST 2 — new trip set B -> 002 ==========");
    const t2 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, B.drv.id, B.drv.name, B.sup.id, B.sup.name, B.helpers, B.loaders));
    check("TEST2 201", t2.status === 201, `got ${t2.status} ${JSON.stringify(t2.data)}`);
    if (t2.status === 201) {
      createdTrips.push(t2.data.id);
      check("TEST2 tripNo=TR-20260812-002", t2.data.tripNo === "TR-20260812-002", `got ${t2.data.tripNo}`);
    }

    console.log("========== TEST 3 — new trip set C -> 003 ==========");
    const t3 = await api("POST", "/trips/steps/start", step1(C.veh.id, C.veh.no, C.drv.id, C.drv.name, C.sup.id, C.sup.name, C.helpers, C.loaders));
    check("TEST3 201", t3.status === 201, `got ${t3.status} ${JSON.stringify(t3.data)}`);
    if (t3.status === 201) {
      createdTrips.push(t3.data.id);
      check("TEST3 tripNo=TR-20260812-003", t3.data.tripNo === "TR-20260812-003", `got ${t3.data.tripNo}`);
    }

    // ------------------------------------------------------------------
    console.log("========== TEST 4 — delete 002, next must be 004 ==========");
    if (t2.status === 201) {
      const del = await api("DELETE", `/trips/${t2.data.id}`, { reason: "TEST4 soft delete" });
      check("TEST4 delete 002 200", del.status === 200, `got ${del.status}`);
      const dbDel = await db(`SELECT deleted, status FROM trips WHERE id=$1`, [t2.data.id]);
      check("TEST4 002 soft-deleted & keeps trip_no", dbDel.rows[0].deleted === true && dbDel.rows[0].status === "Deleted");
    }
    const t4 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, B.drv.id, B.drv.name, B.sup.id, B.sup.name, B.helpers, B.loaders));
    check("TEST4 201", t4.status === 201, `got ${t4.status} ${JSON.stringify(t4.data)}`);
    if (t4.status === 201) {
      createdTrips.push(t4.data.id);
      check("TEST4 tripNo=TR-20260812-004 (NOT reused 002)", t4.data.tripNo === "TR-20260812-004", `got ${t4.data.tripNo}`);
      if (t2.status === 201) {
        const still = await db(`SELECT trip_no FROM trips WHERE id=$1`, [t2.data.id]);
        check("TEST4 deleted 002 keeps its number", still.rows[0].trip_no === "TR-20260812-002", `got ${still.rows[0].trip_no}`);
      }
    }

    // Active Draft now: 001 (A), 003 (C), 004 (B).
    console.log("========== TEST 5-9 — resource conflicts (targets in active 001) ==========");
    const c5 = await api("POST", "/trips/steps/start", step1(A.veh.id, A.veh.no, B.drv.id, B.drv.name, B.sup.id, B.sup.name, B.helpers, B.loaders));
    check("TEST5 vehicle conflict 409", c5.status === 409, `got ${c5.status}`);
    check("TEST5 msg: Vehicle AP16AB1234 -> TR-20260812-001",
      /Vehicle AP16AB1234 is already assigned to trip TR-20260812-001/.test(c5.data?.error ?? ""), `got ${c5.data?.error}`);
    check("TEST5 msg is NOT generic duplicate", c5.data?.error !== "Duplicate record");

    const c6 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, A.drv.id, A.drv.name, B.sup.id, B.sup.name, B.helpers, B.loaders));
    check("TEST6 driver conflict 409", c6.status === 409, `got ${c6.status}`);
    check("TEST6 msg: Driver Rahim -> TR-20260812-001", /Driver Rahim is already assigned to trip TR-20260812-001/.test(c6.data?.error ?? ""), `got ${c6.data?.error}`);

    const c7 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, B.drv.id, B.drv.name, A.sup.id, A.sup.name, B.helpers, B.loaders));
    check("TEST7 supervisor conflict 409", c7.status === 409, `got ${c7.status}`);
    check("TEST7 msg: Supervisor Ruhulla -> TR-20260812-001", /Supervisor Ruhulla is already assigned to trip TR-20260812-001/.test(c7.data?.error ?? ""), `got ${c7.data?.error}`);

    const c8 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, B.drv.id, B.drv.name, B.sup.id, B.sup.name, [...A.helpers], B.loaders));
    check("TEST8 helper conflict 409", c8.status === 409, `got ${c8.status}`);
    check("TEST8 msg: Helper Anil -> TR-20260812-001", /Helper Anil is already assigned to trip TR-20260812-001/.test(c8.data?.error ?? ""), `got ${c8.data?.error}`);

    const c9 = await api("POST", "/trips/steps/start", step1(B.veh.id, B.veh.no, B.drv.id, B.drv.name, B.sup.id, B.sup.name, B.helpers, [...A.loaders]));
    check("TEST9 loader conflict 409", c9.status === 409, `got ${c9.status}`);
    check("TEST9 msg: Loader Babu -> TR-20260812-001", /Loader Babu is already assigned to trip TR-20260812-001/.test(c9.data?.error ?? ""), `got ${c9.data?.error}`);

    const afterCf = await db(`SELECT COUNT(*) c FROM trips WHERE trip_date=$1::date AND deleted=FALSE`, [TRIP_DATE]);
    check("TEST5-9: no new trip from conflicts (still 3)", Number(afterCf.rows[0].c) === 3, `count=${afterCf.rows[0].c}`);

    // ------------------------------------------------------------------
    console.log("========== TEST 10 — same-trip edit keeps id + tripNo ==========");
    if (t1.status === 201) {
      const id1 = t1.data.id;
      const cur = await api("GET", `/trips/${id1}`);
      const ok = await api("PUT", `/trips/${id1}`, step1(A.veh.id, A.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders, { openingMeter: 1100, advanceAmount: 600, updatedAt: cur.data.updatedAt }));
      check("TEST10 update same resources 200", ok.status === 200, `got ${ok.status} ${JSON.stringify(ok.data)}`);
      check("TEST10 same id", ok.data?.id === id1, `id=${ok.data?.id}`);
      check("TEST10 same tripNo", ok.data?.tripNo === "TR-20260812-001", `got ${ok.data?.tripNo}`);

      const bad = await api("PUT", `/trips/${id1}`, step1(B.veh.id /* vehicle owned by active 004 */, B.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders));
      check("TEST10 change-to-busy-vehicle 409", bad.status === 409, `got ${bad.status} ${JSON.stringify(bad.data)}`);
      check("TEST10 409 names busy vehicle trip", /Vehicle AP16AC5678 is already assigned to trip TR-20260812-004/.test(bad.data?.error ?? ""), `got ${bad.data?.error}`);
      const afterEdit = await db(`SELECT trip_no, vehicle_id FROM trips WHERE id=$1`, [id1]);
      check("TEST10 failed edit didn't renumber", afterEdit.rows[0].trip_no === "TR-20260812-001" && Number(afterEdit.rows[0].vehicle_id) === A.veh.id);
    }

    // ------------------------------------------------------------------
    console.log("========== TEST 13/14 — save progress + refresh ==========");
    const t13id = (t3.status === 201) ? t3.data.id : (t4.status === 201 ? t4.data.id : null);
    if (t13id) {
      const sp = await api("POST", `/trips/${t13id}/steps/farm`, { mode: "save", remarks: "partial", destMeter: 1234 });
      check("TEST13 save progress 200 (no mandatory validation)", sp.status === 200, `got ${sp.status} ${JSON.stringify(sp.data)}`);
      check("TEST13 not submitted/locked", sp.data?.farmStepSubmitted === false, `got ${sp.data?.farmStepSubmitted}`);
      const ref = await api("GET", `/trips/${t13id}`);
      check("TEST14 refresh keeps partial data", ref.data?.destMeter === 1234, `destMeter=${ref.data?.destMeter}`);
      check("TEST14 status still Draft", ref.data?.status === "Draft", `got ${ref.data?.status}`);
    } else {
      check("TEST13/14 skipped (no trip)", false);
    }

    // ------------------------------------------------------------------
    console.log("========== TEST 15 — double submit (identical re-post blocked) ==========");
    if (t1.status === 201) {
      const dup = await api("POST", "/trips/steps/start", step1(A.veh.id, A.veh.no, A.drv.id, A.drv.name, A.sup.id, A.sup.name, A.helpers, A.loaders));
      check("TEST15 identical Step-1 re-post -> 409 (no duplicate row)", dup.status === 409, `got ${dup.status} ${JSON.stringify(dup.data)}`);
      const c2 = await db(`SELECT COUNT(*) c FROM trips WHERE trip_date=$1::date AND vehicle_id=$2 AND deleted=FALSE`, [TRIP_DATE, A.veh.id]);
      check("TEST15 exactly one active trip with vehicle A", Number(c2.rows[0].c) === 1, `count=${c2.rows[0].c}`);
    }

    // ------------------------------------------------------------------
    console.log("\n========== FINAL VERIFICATION ==========");
    const fin = await db(`SELECT trip_no, status, deleted FROM trips WHERE trip_date=$1::date ORDER BY trip_no`, [TRIP_DATE]);
    for (const r of fin.rows) console.log(`    ${r.trip_no}  ${r.status}  deleted=${r.deleted}`);
    const seq = await db(`SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int),0) m FROM trips WHERE trip_date=$1::date AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`, [TRIP_DATE]);
    console.log(`  max seq on ${TRIP_DATE} = ${seq.rows[0].m} (next = TR-${TRIP_DATE.replace(/-/g, "")}-${String(Number(seq.rows[0].m) + 1).padStart(3, "0")})`);
    const dupCNT = await db(`SELECT trip_no, COUNT(*) c FROM trips GROUP BY trip_no HAVING COUNT(*)>1`);
    check("no duplicate trip_no in DB", dupCNT.rowCount === 0, JSON.stringify(dupCNT.rows));
  } finally {
    console.log("\n========== CLEANUP ==========");
    const uniq = [...new Set(createdTrips)];
    for (const id of uniq) {
      try { await api("DELETE", `/trips/${id}`, { reason: "Automated trip-entry verification cleanup" }); } catch {}
    }
    const afterDel = await db(`SELECT trip_no, status, deleted FROM trips WHERE trip_date=$1::date ORDER BY trip_no`, [TRIP_DATE]);
    for (const r of afterDel.rows) console.log(`    ${r.trip_no}  ${r.status}  deleted=${r.deleted}`);
    await removeFixtures();
    await pool.end();
  }
  console.log(`\n========== RESULT: ${PASSED} passed, ${FAILED} failed ==========`);
  if (failures.length) console.log("Failures:", failures.join(" | "));
  process.exit(FAILED ? 1 : 0);
}

main().catch(async (e) => {
  console.error("UNEXPECTED:", e);
  try { await removeFixtures(); } catch {}
  try { await pool.end(); } catch {}
  process.exit(2);
});