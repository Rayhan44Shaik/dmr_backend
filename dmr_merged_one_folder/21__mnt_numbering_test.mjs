// LIVE end-to-end verification of vehicle-specific Fleet maintenance numbering.
// Backend must be running on :4000 (tsx watch).
// Format: MNT-<VEHICLE-NO>-<NNN>, per-vehicle sequence, deleted numbers never
// reused, concurrency-safe, invalid vehicles rejected, frontend-supplied MNT
// numbers ignored.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

async function jsonApi(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

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

const stamp = Date.now().toString().slice(-6);
const TEST_DATE = "2026-08-13";
const VEH_A_NO = "AP39AB1234";
const VEH_B_NO = "AP40XY5678";
const RACE_NO = `RACE-${stamp}`;

const createdMaintIds = [];
let vehA = null, vehB = null, vehC = null, drv = null;

try {
  // Drop any leftover test fixtures with the canonical numbers from a crashed
  // previous run so sequences start deterministically at 001.
  await db(`DELETE FROM fleet_maintenance WHERE vehicle_id IN
            (SELECT id FROM vehicles WHERE vehicle_number = ANY($1::text[]))`,
    [[VEH_A_NO, VEH_B_NO, RACE_NO]]);
  await db(`DELETE FROM vehicles WHERE vehicle_number = ANY($1::text[])`,
    [[VEH_A_NO, VEH_B_NO, RACE_NO]]);

  // ---- Fixtures: two vehicles with the canonical example numbers + a driver ----
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
  const a = await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
     VALUES ($1,$2,'Truck','Active') RETURNING id, vehicle_number`,
    [vMax + 1, VEH_A_NO]
  );
  vehA = a.rows[0].id;
  const b = await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
     VALUES ($1,$2,'Container','Active') RETURNING id, vehicle_number`,
    [vMax + 2, VEH_B_NO]
  );
  vehB = b.rows[0].id;
  const c = await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status)
     VALUES ($1,$2,'Truck','Active') RETURNING id, vehicle_number`,
    [vMax + 3, RACE_NO]
  );
  vehC = c.rows[0].id;
  const d = await db(
    `INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
     VALUES ($1,$2,'Driver','Driver',$3,$4,'Active') RETURNING id, employee_name`,
    [eMax + 1, `MNTDrv${stamp}`, `9196${stamp}${Math.floor(100 + Math.random() * 900)}`, `mntdrv${stamp}@fix.local`]
  );
  drv = d.rows[0].id;
  console.log(`fixtures vehA=${vehA} (${VEH_A_NO}) vehB=${vehB} (${VEH_B_NO}) vehC=${vehC} (${RACE_NO}) drv=${drv}`);

  const base = (vehicleId, seqSuffix) => ({
    date: TEST_DATE,
    vehicleId,
    driverId: drv,
    currentKM: 45230,
    nextServiceKM: 50000,
    maintenanceType: ["Engine Oil Change"],
    serviceType: "Oil Change",
    garage: "Num Test Garage",
    mechanic: "Raju",
    parts: [{ name: "Engine Oil", specification: "15W-40 5L", quantity: 2, rate: 1450 }],
    remarks: `mnt-numbering-${stamp}-${seqSuffix}`,
    createdBy: "mnt-test",
  });

  const fmt = /^MNT-[A-Za-z0-9 -]+-\d{3}$/;

  // ============ 1. Same vehicle — sequential MNT numbers ============
  console.log("\n=== 1. Same vehicle sequence (AP39AB1234) ===");
  const c1 = await postMaintenance(base(vehA, "a1"));
  check("1.1 create 201", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) createdMaintIds.push(c1.data.id);
  check("1.2 MNT-AP39AB1234-001", c1.data?.billNo === `MNT-${VEH_A_NO}-001`, `got ${c1.data?.billNo}`);
  check("1.3 vehicleNo snapshot from master", c1.data?.vehicleNo === VEH_A_NO, `got ${c1.data?.vehicleNo}`);
  check("1.4 status Pending Approval (consumes number)", c1.data?.status === "Pending Approval");

  const c2 = await postMaintenance(base(vehA, "a2"));
  if (c2.status === 201) createdMaintIds.push(c2.data.id);
  check("1.5 MNT-AP39AB1234-002", c2.data?.billNo === `MNT-${VEH_A_NO}-002`, `got ${c2.data?.billNo}`);

  const c3 = await postMaintenance(base(vehA, "a3"));
  if (c3.status === 201) createdMaintIds.push(c3.data.id);
  check("1.6 MNT-AP39AB1234-003", c3.data?.billNo === `MNT-${VEH_A_NO}-003`, `got ${c3.data?.billNo}`);

  // ============ 2. Different vehicle — independent sequence ============
  console.log("\n=== 2. Different vehicle independent sequence (AP40XY5678) ===");
  const c4 = await postMaintenance(base(vehB, "b1"));
  if (c4.status === 201) createdMaintIds.push(c4.data.id);
  check("2.1 MNT-AP40XY5678-001", c4.data?.billNo === `MNT-${VEH_B_NO}-001`, `got ${c4.data?.billNo}`);
  const c5 = await postMaintenance(base(vehB, "b2"));
  if (c5.status === 201) createdMaintIds.push(c5.data.id);
  check("2.2 MNT-AP40XY5678-002", c5.data?.billNo === `MNT-${VEH_B_NO}-002`, `got ${c5.data?.billNo}`);
  check("2.3 A keeps its own sequence (next would be 004)", c3.data?.billNo === `MNT-${VEH_A_NO}-003`);
  check("2.4 no cross-vehicle reuse", c5.data?.billNo !== c2.data?.billNo);

  // ============ 3. Soft-deleted number never reused ============
  console.log("\n=== 3. Soft-deleted MNT never reused ===");
  const del = await jsonApi("DELETE", `/fleet/maintenance/${c3.data?.id}`, { reason: "numbering test" });
  check("3.1 soft delete 200", del.status === 200 && del.data?.deleted === true, `got ${del.status}`);
  const c6 = await postMaintenance(base(vehA, "a4"));
  if (c6.status === 201) createdMaintIds.push(c6.data.id);
  check("3.2 next is MNT-AP39AB1234-004 (never 003)", c6.data?.billNo === `MNT-${VEH_A_NO}-004`, `got ${c6.data?.billNo}`);
  const stillConsumed = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE bill_no = $1 AND deleted = TRUE`, [c3.data?.billNo])).rows[0].c;
  check("3.3 deleted 003 still occupies its row (consumed)", stillConsumed === 1, `got ${stillConsumed}`);

  // ============ 4. Pending / Approved / Rejected all consume numbers ============
  console.log("\n=== 4. Approved + Rejected records consume numbers ===");
  const app = await jsonApi("POST", `/fleet/maintenance/${c1.data?.id}/approve`, { approvedBy: "tester" });
  check("4.1 approve 001", app.status === 200 && app.data?.status === "Approved", `got ${app.status}`);
  const rej = await jsonApi("POST", `/fleet/maintenance/${c2.data?.id}/reject`, { reason: "test reject", rejectedBy: "tester" });
  check("4.2 reject 002", rej.status === 200 && rej.data?.status === "Rejected", `got ${rej.status}`);
  const c7 = await postMaintenance(base(vehA, "a5"));
  if (c7.status === 201) createdMaintIds.push(c7.data.id);
  check("4.3 after approved+rejected+pending next is -005", c7.data?.billNo === `MNT-${VEH_A_NO}-005`, `got ${c7.data?.billNo}`);

  // ============ 5. Concurrency — 8 simultaneous creates for same vehicle ============
  console.log(`\n=== 5. Concurrency — 8 simultaneous creates for ${RACE_NO} ===`);
  const racePost = async () => {
    const form = new FormData();
    form.append("date", TEST_DATE);
    form.append("vehicleId", String(vehC));
    form.append("driverId", String(drv));
    form.append("currentKM", "12345");
    form.append("maintenanceType", JSON.stringify(["Engine Oil Change"]));
    form.append("serviceType", "Oil Change");
    form.append("parts", JSON.stringify([{ name: "Oil", quantity: 1, rate: 100 }]));
    form.append("createdBy", "race-test");
    form.append("documents", new Blob([PNG], { type: "image/png" }), "b.png");
    const res = await fetch(API + "/fleet/maintenance", { method: "POST", body: form });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => racePost()));
  const created = results.filter((r) => r.status === 201);
  created.forEach((r) => createdMaintIds.push(r.data.id));
  check("5.1 all 8 concurrent creates succeeded", created.length === 8, `${created.length}/8 ${JSON.stringify(results.map((r) => r.status))}`);
  const raceNos = created.map((r) => r.data.billNo);
  check("5.2 no duplicates", new Set(raceNos).size === 8, JSON.stringify(raceNos));
  const expectedSeq = Array.from({ length: 8 }, (_, i) => `MNT-${RACE_NO}-${String(i + 1).padStart(3, "0")}`);
  check("5.3 sequences are exactly 001..008", JSON.stringify([...raceNos].sort()) === JSON.stringify([...expectedSeq].sort()), JSON.stringify(raceNos));

  // ============ 6. Invalid vehicle → clean 4xx, no MNT generated ============
  console.log("\n=== 6. Invalid vehicle rejected ===");
  const bad = await postMaintenance(base(999999, "bad"));
  check("6.1 invalid vehicle returns 4xx", bad.status >= 400 && bad.status < 500, `got ${bad.status} ${JSON.stringify(bad.data)}`);
  const badCounter = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance_number_counters WHERE vehicle_id = 999999`)).rows[0].c;
  check("6.2 no counter row created", badCounter === 0, `got ${badCounter}`);
  const badRow = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE vehicle_id = 999999`)).rows[0].c;
  check("6.3 no maintenance row created", badRow === 0, `got ${badRow}`);

  // ============ 7. Frontend-supplied MNT number is ignored ============
  console.log("\n=== 7. Manually supplied MNT number ignored ===");
  const faked = await postMaintenance({ ...base(vehA, "a6"), billNo: `MNT-${VEH_A_NO}-999` });
  if (faked.status === 201) createdMaintIds.push(faked.data.id);
  check("7.1 create with fake billNo still 201", faked.status === 201, `got ${faked.status}`);
  check("7.2 fake number ignored — server generated -006", faked.data?.billNo === `MNT-${VEH_A_NO}-006`, `got ${faked.data?.billNo}`);
  const fakeCount = (await db(`SELECT COUNT(*)::int c FROM fleet_maintenance WHERE bill_no = 'MNT-${VEH_A_NO}-999'`)).rows[0].c;
  check("7.3 fake number never persisted", fakeCount === 0, `got ${fakeCount}`);

  // ============ 8. DB-level uniqueness + counter correctness ============
  console.log("\n=== 8. Database uniqueness + counter state ===");
  const aCounters = (await db(`SELECT last_sequence FROM fleet_maintenance_number_counters WHERE vehicle_id = $1`, [vehA])).rows;
  check("8.1 vehicle A counter matches issued max", Number(aCounters[0]?.last_sequence) === 6, JSON.stringify(aCounters));
  const bCounters = (await db(`SELECT last_sequence FROM fleet_maintenance_number_counters WHERE vehicle_id = $1`, [vehB])).rows;
  check("8.2 vehicle B counter matches issued max", Number(bCounters[0]?.last_sequence) === 2, JSON.stringify(bCounters));
  const cCounters = (await db(`SELECT last_sequence FROM fleet_maintenance_number_counters WHERE vehicle_id = $1`, [vehC])).rows;
  check("8.3 vehicle C counter matches issued max", Number(cCounters[0]?.last_sequence) === 8, JSON.stringify(cCounters));
  const allNos = (await db(`SELECT bill_no FROM fleet_maintenance WHERE id = ANY($1::int[])`, [createdMaintIds])).rows.map((r) => r.bill_no);
  check("8.4 no duplicate bill_no persisted", new Set(allNos).size === allNos.length, JSON.stringify(allNos));
  const uniqueIndex = (await db(
    `SELECT COUNT(*)::int c FROM pg_indexes WHERE tablename='fleet_maintenance' AND indexname='idx_fleet_maintenance_bill_no' AND indexdef LIKE '%UNIQUE%'`
  )).rows[0].c;
  check("8.5 explicit unique index on bill_no present", uniqueIndex === 1, `got ${uniqueIndex}`);

  // ============ 9. List/search still work with new format ============
  console.log("\n=== 9. List + search with new format ===");
  const listA = await jsonApi("GET", `/fleet/maintenance?vehicleId=${vehA}`);
  const aRows = Array.isArray(listA.data) ? listA.data : [];
  check("9.1 list by vehicle A", aRows.every((r) => String(r.vehicleNo) === VEH_A_NO), JSON.stringify(aRows.map((r) => r.billNo)));
  const sMnt = await jsonApi("GET", `/fleet/maintenance?search=${encodeURIComponent(c6.data?.billNo ?? "")}`);
  check("9.2 search by new-format MNT number", Array.isArray(sMnt.data) && sMnt.data.some((r) => r.id === c6.data?.id), JSON.stringify(sMnt.data?.map?.((r) => r.billNo)));
  const sVeh = await jsonApi("GET", `/fleet/maintenance?search=${encodeURIComponent(VEH_B_NO)}`);
  check("9.3 search by vehicle number", Array.isArray(sVeh.data) && sVeh.data.some((r) => r.id === c5.data?.id), JSON.stringify(sVeh.data?.map?.((r) => r.billNo)));

  console.log(`\n======================================`);
  console.log(`MNT NUMBERING RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    if (createdMaintIds.length) {
      await db(`DELETE FROM fleet_maintenance_documents WHERE maintenance_id = ANY($1::int[])`, [createdMaintIds]);
      await db(`DELETE FROM fleet_maintenance WHERE id = ANY($1::int[])`, [createdMaintIds]);
    }
    await db(`DELETE FROM fleet_maintenance WHERE vehicle_id IN ($1,$2,$3)`, [vehA, vehB, vehC].map((v) => v ?? 0));
    if (vehA != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehA]);
    if (vehB != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehB]);
    if (vehC != null) await db(`DELETE FROM vehicles WHERE id = $1`, [vehC]);
    if (drv != null) await db(`DELETE FROM employees WHERE id = $1`, [drv]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}
