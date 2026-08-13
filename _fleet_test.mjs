// LIVE end-to-end verification of the Fleet module (Entry + History) against
// real PostgreSQL. Backend must be running on :4000 (tsx watch). Creates its
// own unique fixtures and cleans up afterwards. Covers tests A–M.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
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

// Since maintenance entries now REQUIRE at least one document, every create
// must be submitted as multipart/form-data with an attached bill/parts file.
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);

async function postMaintenance(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === "") continue;
    if (k === "maintenanceType" || k === "parts") form.append(k, JSON.stringify(v));
    else form.append(k, String(v));
  }
  form.append("documents", new Blob([PNG], { type: "image/png" }), "bill.png");
  const res = await fetch(API + "/fleet/maintenance", { method: "POST", body: form });
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

const stamp = Date.now().toString().slice(-6);
const TEST_DATE = "2026-08-10";
const createdMaintIds = [];
let vehId = null, drvId = null, supId = null;

try {
  // ---- Fixtures (direct DB inserts, unique numbers via MAX+1) ----
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
  const veh = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
                        VALUES ($1,$2,'Truck','Active') RETURNING id, vehicle_number`,
    [vMax + 1, `FLTFIX-${stamp}`]);
  vehId = veh.rows[0].id;
  const vehNumber = veh.rows[0].vehicle_number;
  const drv = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
                        VALUES ($1,$2,'Driver','Driver',$3,$4,'Active') RETURNING id, employee_name`,
    [eMax + 1, `FLTDrv${stamp}`, `9199${stamp}${Math.floor(100 + Math.random() * 900)}`, `fltdrv${stamp}@fix.local`]);
  drvId = drv.rows[0].id;
  const drvName = drv.rows[0].employee_name;
  const sup = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
                        VALUES ($1,$2,'Supervisor','Supervisor',$3,$4,'Active') RETURNING id, employee_name`,
    [eMax + 2, `FLTSup${stamp}`, `9198${stamp}${Math.floor(100 + Math.random() * 900)}`, `fltsup${stamp}@fix.local`]);
  supId = sup.rows[0].id;
  console.log(`fixtures vehId=${vehId} veh=${vehNumber} drvId=${drvId} supId=${supId}`);

  const baseEntry = {
    date: TEST_DATE,
    vehicleId: vehId,
    driverId: drvId,
    currentKM: 45230,
    nextServiceKM: 50000,
    maintenanceType: ["Engine Oil Change", "Oil Filter Replacement"],
    serviceType: "Oil Change",
    garage: "Test Garage",
    mechanic: "Raju",
    parts: [
      { name: "Engine Oil", specification: "15W-40 5L", quantity: 2, rate: 1450 },
      { name: "Oil Filter", specification: "", quantity: 1, rate: 350, amount: 350 },
    ],
    remarks: "fleet-e2e-test",
    createdBy: "fleet-test",
  };

  // ============ A. Create valid Fleet Entry ============
  console.log("\n=== A. Create valid Fleet Entry (POST /fleet/maintenance) ===");
  const a1 = await postMaintenance(baseEntry);
  console.log(`  -> ${a1.status} ${JSON.stringify(a1.data?.error ?? a1.data?.billNo ?? a1.data)}`);
  check("A1 201 created", a1.status === 201, `got ${a1.status}`);
  if (a1.status === 201) {
    createdMaintIds.push(a1.data.id);
    check("A2 has positive id", a1.data.id > 0);
    check("A3 server billNo generated", /^MNT-\d{8}-\d{3}$/.test(a1.data.billNo), `got ${a1.data.billNo}`);
    check("A4 status Pending Approval", a1.data.status === "Pending Approval", `got ${a1.data.status}`);
    check("A5 paymentStatus pending", a1.data.paymentStatus === "pending");
    // vehicle snapshot auto-resolved from Vehicle Master
    check("A6 vehicleNo snapshot from master", a1.data.vehicleNo === vehNumber, `got ${a1.data.vehicleNo}`);
    check("A7 driverName snapshot from master", a1.data.driverName === drvName, `got ${a1.data.driverName}`);
    // server-computed totalCost = 2*1450 + 350 = 3250
    check("A8 server-computed totalCost", a1.data.totalCost === 3250, `got ${a1.data.totalCost}`);
    check("A9 maintenanceType joined", a1.data.maintenanceType === "Engine Oil Change, Oil Filter Replacement", a1.data.maintenanceType);
    check("A10 createdAt present", Boolean(a1.data.createdAt));
  }

  // ============ E. Entry persists after API response ============
  console.log("\n=== E. Entry persists after API response (direct DB) ===");
  const e1 = await db(`SELECT id, bill_no, vehicle_id, current_km, total_cost, status FROM fleet_maintenance WHERE id = $1`, [a1.data?.id]);
  check("E1 exactly one DB row", e1.rowCount === 1);
  check("E2 DB row matches API", e1.rows[0]?.id === a1.data?.id && e1.rows[0]?.vehicle_id === vehId && Number(e1.rows[0]?.current_km) === 45230);
  check("E3 persisted status", String(e1.rows[0]?.status) === "Pending Approval");

  // ============ F + G. History returns record with correct vehicle info ============
  console.log("\n=== F+G. History returns record + correct vehicle information ===");
  const f1 = await api("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  check("F1 list by vehicleId is 200", f1.status === 200);
  const fRow = Array.isArray(f1.data) ? f1.data.find((r) => r.id === a1.data?.id) : null;
  check("F2 entry appears in History", Boolean(fRow));
  check("G1 correct vehicleId", fRow?.vehicleId === vehId);
  check("G2 correct vehicle number", fRow?.vehicleNo === vehNumber, `got ${fRow?.vehicleNo}`);
  check("G3 correct meter reading", fRow?.currentKM === 45230);
  check("G4 correct amount", fRow?.totalCost === 3250);
  check("G5 has created/updated info", Boolean(fRow?.createdAt));

  // ============ H. Filtering / search / pagination ============
  console.log("\n=== H. Filtering / search / pagination ===");
  const h1 = await api("GET", `/fleet/maintenance?vehicleId=${vehId}&fromDate=2026-08-01&toDate=2026-08-31`);
  check("H1 date range filter returns entry", Array.isArray(h1.data) && h1.data.some((r) => r.id === a1.data?.id));
  const h2 = await api("GET", `/fleet/maintenance?search=${encodeURIComponent(a1.data?.billNo ?? "")}`);
  check("H2 search by billNo returns entry", Array.isArray(h2.data) && h2.data.some((r) => r.id === a1.data?.id));
  const h3 = await api("GET", `/fleet/maintenance?search=${encodeURIComponent(drvName)}`);
  check("H3 search by driver name returns entry", Array.isArray(h3.data) && h3.data.some((r) => r.id === a1.data?.id));
  const h4 = await api("GET", `/fleet/maintenance?vehicleId=999999`);
  check("H4 non-matching vehicle filter returns empty", Array.isArray(h4.data) && h4.data.length === 0);
  const h5 = await api("GET", `/fleet/maintenance?page=1&limit=5`);
  check("H5 pagination shape", h5.data && Array.isArray(h5.data.data) && h5.data.meta && h5.data.meta.total >= 1 && h5.data.meta.totalPages >= 1, JSON.stringify(h5.data));

  // ============ I. Update existing Entry ============
  console.log("\n=== I. Update existing Entry (PUT /fleet/maintenance/:id) ===");
  const i1 = await api("PUT", `/fleet/maintenance/${a1.data?.id}`, {
    currentKM: 46210,
    serviceType: "Oil Change + Brake Service",
    parts: [{ name: "Brake Pads", specification: "Front", quantity: 1, rate: 1800 }],
    remarks: "updated",
  });
  console.log(`  -> ${i1.status} ${JSON.stringify(i1.data?.error ?? i1.data?.serviceType ?? i1.data)}`);
  check("I1 200 updated", i1.status === 200, `got ${i1.status}`);
  check("I2 new currentKM applied", i1.data?.currentKM === 46210);
  check("I3 new serviceType applied", i1.data?.serviceType === "Oil Change + Brake Service");
  check("I4 totalCost recomputed", i1.data?.totalCost === 1800, `got ${i1.data?.totalCost}`);
  check("I5 parts replaced", Array.isArray(i1.data?.parts) && i1.data.parts.length === 1);
  const i2 = await db(`SELECT current_km, total_cost FROM fleet_maintenance WHERE id = $1`, [a1.data?.id]);
  check("I6 persisted update", Number(i2.rows[0]?.current_km) === 46210 && Number(i2.rows[0]?.total_cost) === 1800);

  // ============ K. Refresh / re-query gives same state ============
  console.log("\n=== K. Refresh / re-query gives same state ===");
  const k1 = await api("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  const k2 = await api("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  const kJ1 = JSON.stringify(k1.data);
  const kJ2 = JSON.stringify(k2.data);
  check("K1 two queries identical", kJ1 === kJ2);
  check("K2 entry present in both", JSON.stringify(kJ1).includes(String(a1.data?.id)));

  // ============ B. Invalid vehicle rejected ============
  console.log("\n=== B. Invalid vehicle → rejected ===");
  const b1 = await postMaintenance({ ...baseEntry, vehicleId: 999999 });
  console.log(`  -> ${b1.status} ${JSON.stringify(b1.data?.error)}`);
  check("B1 422 vehicle not found", b1.status === 422, `got ${b1.status} ${JSON.stringify(b1.data)}`);

  // ============ C. Invalid employee reference rejected ============
  console.log("\n=== C. Invalid employee reference → rejected ===");
  const c1 = await postMaintenance({ ...baseEntry, driverId: 999999 });
  console.log(`  -> ${c1.status} ${JSON.stringify(c1.data?.error)}`);
  check("C1 422 driver not found", c1.status === 422, `got ${c1.status} ${JSON.stringify(c1.data)}`);

  // ============ D. Invalid meter / amount / date rejected ============
  console.log("\n=== D. Invalid meter / amount / date → rejected ===");
  const d1 = await postMaintenance({ ...baseEntry, currentKM: -5 });
  console.log(`  -> ${d1.status} ${JSON.stringify(d1.data?.error)}`);
  check("D1 negative KM rejected", d1.status === 400, `got ${d1.status}`);
  const d2 = await postMaintenance({ ...baseEntry, date: "2026-13-45" });
  console.log(`  -> ${d2.status} ${JSON.stringify(d2.data?.error)}`);
  check("D2 invalid date rejected", d2.status === 400, `got ${d2.status}`);
  const d3 = await postMaintenance({ ...baseEntry, parts: [{ name: "Part", quantity: 1, rate: -200 }] });
  console.log(`  -> ${d3.status} ${JSON.stringify(d3.data?.error)}`);
  check("D3 negative part rate rejected", d3.status === 400, `got ${d3.status}`);
  const d4 = await postMaintenance({ ...baseEntry, maintenanceType: [] });
  console.log(`  -> ${d4.status} ${JSON.stringify(d4.data?.error)}`);
  check("D4 empty maintenance type rejected", d4.status === 400, `got ${d4.status}`);
  const dCount = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE vehicle_id = $1 AND maintenance_date = $2`, [vehId, TEST_DATE])).rows[0].c;
  check("D5 rejected entries left no rows", dCount === 1, `got ${dCount} (expected 1 — only the valid A entry)`);

  // ============ J. Failed transaction leaves no partial records ============
  console.log("\n=== J. Failed transaction leaves no partial records ===");
  const beforeJ = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE vehicle_id = $1 AND maintenance_date = $2`, [vehId, TEST_DATE])).rows[0].c;
  // Insert fails at DB level (duplicate bill_no) inside the transaction → rollback.
  const j1 = await postMaintenance({ ...baseEntry, billNo: a1.data?.billNo });
  console.log(`  -> ${j1.status} ${JSON.stringify(j1.data?.error)}`);
  check("J1 duplicate bill rejected 409", j1.status === 409, `got ${j1.status} ${JSON.stringify(j1.data)}`);
  const afterJ = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE vehicle_id = $1 AND maintenance_date = $2`, [vehId, TEST_DATE])).rows[0].c;
  check("J2 no partial row left behind", afterJ === beforeJ, `before=${beforeJ} after=${afterJ}`);
  const jErrCount = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE bill_no = $1`, [a1.data?.billNo])).rows[0].c;
  check("J3 still exactly one row for that bill", jErrCount === 1, `got ${jErrCount}`);

  // ============ L. No duplicate records from repeated submission ============
  console.log("\n=== L. No duplicate records from repeated submission ===");
  const lBody = { ...baseEntry, billNo: `FLTB-${stamp}` };
  const l1 = await postMaintenance(lBody);
  console.log(`  -> first ${l1.status}`);
  check("L1 first submit 201", l1.status === 201, `got ${l1.status}`);
  if (l1.status === 201) createdMaintIds.push(l1.data.id);
  const l2 = await postMaintenance(lBody);
  console.log(`  -> second ${l2.status} ${JSON.stringify(l2.data?.error)}`);
  check("L2 duplicate submit rejected 409", l2.status === 409, `got ${l2.status} ${JSON.stringify(l2.data)}`);
  const lCount = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE bill_no = $1`, [lBody.billNo])).rows[0].c;
  check("L3 only one row persisted", lCount === 1, `got ${lCount}`);

  // ============ Approval workflow ============
  console.log("\n=== Approval workflow (approve / reject / delete) ===");
  const app = await api("POST", `/fleet/maintenance/${l1.data?.id}/approve`, { approvedBy: "tester" });
  check("W1 approve 200", app.status === 200, `got ${app.status} ${JSON.stringify(app.data?.error)}`);
  check("W2 status Approved", app.data?.status === "Approved" && app.data?.paymentStatus === "approved");
  const app2 = await api("POST", `/fleet/maintenance/${l1.data?.id}/approve`);
  check("W3 double approve rejected 409", app2.status === 409, `got ${app2.status}`);
  const rej = await api("POST", `/fleet/maintenance/${a1.data?.id}/reject`, { reason: "not required", rejectedBy: "tester" });
  check("W4 reject 200", rej.status === 200 && rej.data?.status === "Rejected", `got ${rej.status} ${JSON.stringify(rej.data?.error)}`);
  const rej2 = await api("POST", `/fleet/maintenance/${a1.data?.id}/reject`);
  check("W5 reject without reason 400", rej2.status === 400, `got ${rej2.status}`);
  const del = await api("DELETE", `/fleet/maintenance/${a1.data?.id}`, { reason: "wrong entry" });
  check("W6 soft delete 200", del.status === 200 && del.data?.deleted === true, `got ${del.status}`);
  const afterDel = await api("GET", `/fleet/maintenance?vehicleId=${vehId}`);
  check("W7 deleted hidden by default", Array.isArray(afterDel.data) && !afterDel.data.some((r) => r.id === a1.data?.id));
  const withDel = await api("GET", `/fleet/maintenance?vehicleId=${vehId}&includeDeleted=true`);
  check("W8 deleted visible with includeDeleted", Array.isArray(withDel.data) && withDel.data.some((r) => r.id === a1.data?.id));

  // ============ M. Vehicle Master remains unchanged ============
  console.log("\n=== M. Existing Vehicle Master data remains unchanged ===");
  const m1 = await db(`SELECT vehicle_no, vehicle_number, vehicle_type, status, no_of_boxes FROM vehicles WHERE id = $1`, [vehId]);
  const mRow = m1.rows[0];
  check("M1 vehicle master intact", Number(mRow.vehicle_no) === vMax + 1 && mRow.vehicle_number === `FLTFIX-${stamp}` && String(mRow.status) === "Active");
  const m2 = await db(`SELECT employee_no, employee_name, department, status FROM employees WHERE id = $1`, [drvId]);
  const eRow = m2.rows[0];
  check("M2 employee master intact", String(eRow.employee_name) === `FLTDrv${stamp}` && String(eRow.department) === "Driver");

  console.log(`\n======================================`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  // ---- Cleanup ----
  try {
    if (createdMaintIds.length) {
      await db(`DELETE FROM fleet_maintenance WHERE id = ANY($1)`, [createdMaintIds]);
    }
    if (vehId != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehId]);
    if (drvId != null) await db(`DELETE FROM employees WHERE id = $1`, [drvId]);
    if (supId != null) await db(`DELETE FROM employees WHERE id = $1`, [supId]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}
