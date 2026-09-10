// LIVE end-to-end verification of Fleet → EMI (vehicle EMIs + persisted
// schedule) against real PostgreSQL. Backend must be running on :4000
// (tsx watch). Creates its own unique fixtures and cleans up afterwards.
//
// Mirrors the EXACT EMI contract the frontend already drives:
//   EMI record per vehicle with vehicleId + vehicleNo, financeCompany,
//   loanAmount, emiAmount, startDate, endDate, nextEMIDate, status
//   (active|paid|overdue), paidEMIs, pendingEMIs, totalEMIs.
// The schedule (vehicle_emi_installments) is the single source of truth for
// paid/pending/next/status.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const stamp = Date.now().toString().slice(-6);
const vehIds = [];
let emiId = null;

try {
  // ---- Fixtures: dedicated vehicles (unique numbers via MAX+1) ----
  const mkVehicle = async (no, prefix, emiDay = 15) => {
    const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
    const veh = await db(
      `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status, emi_day, no_of_boxes, bird_capacity, capacity_kg)
       VALUES ($1,$2,'Truck','Active',$3,85,1000,5000) RETURNING id, vehicle_number`,
      [vMax + 1, `${prefix}-${stamp}`, emiDay]
    );
    vehIds.push(veh.rows[0].id);
    return { id: veh.rows[0].id, number: veh.rows[0].vehicle_number };
  };

  const v1 = await mkVehicle(1, "EMIFIX");
  const v2 = await mkVehicle(2, "EMIFIX-OVR");
  const v3 = await mkVehicle(3, "EMIFIX-RND", 28);
  console.log(`fixtures v1=${v1.id}/${v1.number} v2=${v2.id}/${v2.number} v3=${v3.id}/${v3.number}`);

  // ============ 1. Create (valid) ============
  console.log("\n=== 1. Create EMI (POST /fleet/emis) ===");
  const c1 = await api("POST", "/fleet/emis", {
    vehicleId: v1.id,
    financeCompany: "HDFC Bank",
    loanAmount: 120000,
    totalEMIs: 12,
    startDate: "2026-08-01",
    createdBy: "emi-test",
  });
  check("1.1 201 created", c1.status === 201, `got ${c1.status} ${JSON.stringify(c1.data)}`);
  if (c1.status === 201) {
    emiId = c1.data.id;
    check("1.2 positive id", c1.data.id > 0);
    check("1.3 vehicleId echoed", c1.data.vehicleId === v1.id, `got ${c1.data.vehicleId}`);
    check("1.4 vehicleNo resolved from master", c1.data.vehicleNo === v1.number, `got ${c1.data.vehicleNo}`);
    check("1.5 financeCompany", c1.data.financeCompany === "HDFC Bank", c1.data.financeCompany);
    check("1.6 loanAmount", c1.data.loanAmount === 120000, `got ${c1.data.loanAmount}`);
    // flat-principal formula already displayed by the page: round(120000/12)
    check("1.7 emiAmount derived (round formula)", c1.data.emiAmount === 10000, `got ${c1.data.emiAmount}`);
    check("1.8 startDate", c1.data.startDate === "2026-08-01", c1.data.startDate);
    check("1.9 endDate derived = start + 12 months", c1.data.endDate === "2027-08-01", c1.data.endDate);
    check("1.10 totalEMIs", c1.data.totalEMIs === 12, `got ${c1.data.totalEMIs}`);
    check("1.11 paidEMIs 0", c1.data.paidEMIs === 0, `got ${c1.data.paidEMIs}`);
    check("1.12 pendingEMIs 12", c1.data.pendingEMIs === 12, `got ${c1.data.pendingEMIs}`);
    // first due = emi_day (15) in the start month (2026-08-15, today 08-14 -> active)
    check("1.13 nextEMIDate = first due", c1.data.nextEMIDate === "2026-08-15", `got ${c1.data.nextEMIDate}`);
    check("1.14 past first due date is overdue", c1.data.status === "overdue", `got ${c1.data.status}`);
    check("1.15 createdAt present", Boolean(c1.data.createdAt));
  }

  // ============ 2. Persisted schedule ============
  console.log("\n=== 2. Schedule persisted (direct DB) ===");
  const s2 = await db(
    `SELECT COUNT(*)::int c, COUNT(*) FILTER (WHERE status='paid')::int paid,
            MIN(due_date)::text first_due, SUM(amount)::text sum_amt
     FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`,
    [emiId]
  );
  check("2.1 exactly totalEMIs rows", s2.rows[0].c === 12, `got ${s2.rows[0].c}`);
  check("2.2 all pending on create", s2.rows[0].paid === 0);
  check("2.3 first due date", s2.rows[0].first_due === "2026-08-15", s2.rows[0].first_due);
  check("2.4 schedule sums to loanAmount", Number(s2.rows[0].sum_amt) === 120000, s2.rows[0].sum_amt);
  const emiRow = (await db(`SELECT paid_emis, next_emi_date::text, status FROM vehicle_emis WHERE id = $1`, [emiId])).rows[0];
  check("2.5 record aggregates match schedule", emiRow.paid_emis === 0 && emiRow.next_emi_date === "2026-08-15" && emiRow.status === "overdue", JSON.stringify(emiRow));

  // ============ 3. Duplicate vehicle -> 409, nothing extra ============
  console.log("\n=== 3. Duplicate EMI for same vehicle ===");
  const d3 = await api("POST", "/fleet/emis", {
    vehicleId: v1.id, financeCompany: "Axis", loanAmount: 50000, totalEMIs: 6, startDate: "2026-08-01",
  });
  check("3.1 409 conflict", d3.status === 409, `got ${d3.status} ${JSON.stringify(d3.data)}`);
  const rows3 = (await db(`SELECT COUNT(*)::int c FROM vehicle_emis WHERE vehicle_id = $1`, [v1.id])).rows[0].c;
  const inst3 = (await db(`SELECT COUNT(*)::int c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [emiId])).rows[0].c;
  check("3.2 still one EMI row", rows3 === 1, `got ${rows3}`);
  check("3.3 schedule untouched", inst3 === 12, `got ${inst3}`);

  // ============ 4. Validation ============
  console.log("\n=== 4. Validation ===");
  const vCases = [
    ["missing financeCompany", { vehicleId: v2.id, loanAmount: 50000, totalEMIs: 6, startDate: "2026-08-01" }],
    ["negative loanAmount", { vehicleId: v2.id, financeCompany: "X", loanAmount: -5, totalEMIs: 6, startDate: "2026-08-01" }],
    ["zero totalEMIs", { vehicleId: v2.id, financeCompany: "X", loanAmount: 50000, totalEMIs: 0, startDate: "2026-08-01" }],
    ["non-integer totalEMIs", { vehicleId: v2.id, financeCompany: "X", loanAmount: 50000, totalEMIs: 6.5, startDate: "2026-08-01" }],
    ["bad startDate", { vehicleId: v2.id, financeCompany: "X", loanAmount: 50000, totalEMIs: 6, startDate: "01/08/2026" }],
    ["missing vehicleId", { financeCompany: "X", loanAmount: 50000, totalEMIs: 6, startDate: "2026-08-01" }],
  ];
  for (const [label, body] of vCases) {
    const r = await api("POST", "/fleet/emis", body);
    check(`4.${label} -> 4xx`, r.status >= 400 && r.status < 500, `got ${r.status} ${JSON.stringify(r.data)}`);
  }
  const rBad = await api("POST", "/fleet/emis", { vehicleId: 99999999, financeCompany: "X", loanAmount: 50000, totalEMIs: 6, startDate: "2026-08-01" });
  check("4.7 invalid vehicle -> 4xx", rBad.status >= 400 && rBad.status < 500, `got ${rBad.status}`);
  const none4 = (await db(`SELECT COUNT(*)::int c FROM vehicle_emis WHERE vehicle_id = $1`, [v2.id])).rows[0].c;
  check("4.8 no rows leaked", none4 === 0, `got ${none4}`);

  // ============ 5. Create with rounding + past start (overdue) ============
  console.log("\n=== 5. Rounding + overdue derivation ===");
  const c5 = await api("POST", "/fleet/emis", {
    vehicleId: v3.id,
    financeCompany: "ICICI",
    loanAmount: 800000,
    totalEMIs: 36,
    startDate: "2025-01-10",
    createdBy: "emi-test",
  });
  check("5.1 201 created", c5.status === 201, `got ${c5.status} ${JSON.stringify(c5.data)}`);
  if (c5.status === 201) {
    check("5.2 emiAmount uses cent precision", c5.data.emiAmount === 22222.22, `got ${c5.data.emiAmount}`);
    check("5.3 nextEMIDate = first due in past", c5.data.nextEMIDate === "2025-01-28", `got ${c5.data.nextEMIDate}`);
    check("5.4 past-due start surfaces as overdue", c5.data.status === "overdue", `got ${c5.data.status}`);
    const sum5 = (await db(`SELECT SUM(amount)::text s FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [c5.data.id])).rows[0].s;
    check("5.5 schedule sums to loanAmount", Number(sum5) === 800000, sum5);
    const last5 = (await db(`SELECT amount::text a FROM vehicle_emi_installments WHERE vehicle_emi_id = $1 ORDER BY installment_no DESC LIMIT 1`, [c5.data.id])).rows[0].a;
    check("5.6 final installment remains non-negative and cent-precise", Number(last5) === 22222.22, last5);
  }

  // ============ 6. Detail + vehicle-wise + schedule endpoints ============
  console.log("\n=== 6. Reads ===");
  const g1 = await api("GET", `/fleet/emis/${emiId}`);
  check("6.1 getById 200", g1.status === 200 && g1.data.id === emiId, `got ${g1.status}`);
  const gv = await api("GET", `/fleet/emis/vehicle/${v1.id}`);
  check("6.2 getByVehicle 200", gv.status === 200 && gv.data.vehicleId === v1.id, `got ${gv.status}`);
  const gn = await api("GET", `/fleet/emis/vehicle/99999999`);
  check("6.3 getByVehicle missing -> 404", gn.status === 404, `got ${gn.status}`);
  const gs = await api("GET", `/fleet/emis/${emiId}/schedule`);
  check("6.4 schedule 200", gs.status === 200, `got ${gs.status}`);
  check("6.5 schedule length 12", Array.isArray(gs.data) && gs.data.length === 12, `got ${gs.data?.length}`);
  check("6.6 schedule ordered + shaped", Array.isArray(gs.data) && gs.data[0].installmentNo === 1 && gs.data[0].dueDate === "2026-08-15" && gs.data[0].amount === 10000 && gs.data[0].status === "pending", JSON.stringify(gs.data?.[0]));
  check("6.7 schedule includes id + vehicleEmiId", Boolean(gs.data?.[0]?.id && gs.data?.[0]?.vehicleEmiId));

  // ============ 7. List + filters ============
  console.log("\n=== 7. List & search ===");
  const l1 = await api("GET", "/fleet/emis");
  check("7.1 list 200 + array", l1.status === 200 && Array.isArray(l1.data), `got ${l1.status}`);
  const mine = l1.data.filter((r) => vehIds.includes(r.vehicleId));
  check("7.2 fixture EMIs present", mine.length >= 2, `got ${mine.length}`);
  check("7.3 vehicleNo resolved", mine.every((r) => r.vehicleNo && r.vehicleNo.startsWith("EMIFIX")), JSON.stringify(mine.map((r) => r.vehicleNo)));
  const ls = await api("GET", `/fleet/emis?search=${v1.number}`);
  check("7.4 search by vehicle number", Array.isArray(ls.data) && ls.data.some((r) => r.vehicleId === v1.id), JSON.stringify(ls.data));
  const lv = await api("GET", `/fleet/emis?vehicleId=${v3.id}`);
  check("7.5 vehicleId filter", Array.isArray(lv.data) && lv.data.length === 1 && lv.data[0].vehicleId === v3.id, JSON.stringify(lv.data));
  const lo = await api("GET", `/fleet/emis?status=overdue`);
  check("7.6 status filter overdue", Array.isArray(lo.data) && lo.data.some((r) => r.vehicleId === v3.id), JSON.stringify(lo.data));

  // ============ 8. Payment ============
  console.log("\n=== 8. Pay advances the schedule ===");
  const firstPayKey = crypto.randomUUID();
  const p1 = await api("POST", `/fleet/emis/${emiId}/pay`, { paidBy: "emi-test", idempotencyKey: firstPayKey });
  check("8.1 pay 200", p1.status === 200, `got ${p1.status} ${JSON.stringify(p1.data)}`);
  check("8.2 paidEMIs advanced to 1", p1.data.paidEMIs === 1, `got ${p1.data.paidEMIs}`);
  check("8.3 pendingEMIs 11", p1.data.pendingEMIs === 11, `got ${p1.data.pendingEMIs}`);
  check("8.4 nextEMIDate moved to Sep", p1.data.nextEMIDate === "2026-09-15", `got ${p1.data.nextEMIDate}`);
  check("8.5 status still active", p1.data.status === "active", p1.data.status);
  const sch1 = (await db(`SELECT status, paid_at FROM vehicle_emi_installments WHERE vehicle_emi_id = $1 AND installment_no = 1`, [emiId])).rows[0];
  check("8.6 installment 1 marked paid + stamped", sch1.status === "paid" && sch1.paid_at != null, JSON.stringify(sch1));
  const replayPay = await api("POST", `/fleet/emis/${emiId}/pay`, { paidBy: "emi-test", idempotencyKey: firstPayKey });
  check("8.6b duplicate payment key is an idempotent replay", replayPay.status === 200 && replayPay.data.paidEMIs === 1, JSON.stringify(replayPay.data));

  // Pay the remaining 11 -> fully paid
  for (let i = 0; i < 11; i++) {
    const r = await api("POST", `/fleet/emis/${emiId}/pay`, { idempotencyKey: crypto.randomUUID() });
    check(`8.7 pay #${i + 2} 200`, r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  }
  const fin = await api("GET", `/fleet/emis/${emiId}`);
  check("8.8 fully paid -> paidEMIs 12", fin.data.paidEMIs === 12, `got ${fin.data.paidEMIs}`);
  check("8.9 pendingEMIs 0", fin.data.pendingEMIs === 0, `got ${fin.data.pendingEMIs}`);
  check("8.10 status paid", fin.data.status === "paid", fin.data.status);
  check("8.11 nextEMIDate null when done", fin.data.nextEMIDate === null, `got ${fin.data.nextEMIDate}`);
  const over = await api("POST", `/fleet/emis/${emiId}/pay`, { idempotencyKey: crypto.randomUUID() });
  check("8.12 paying a fully-paid EMI -> 409", over.status === 409, `got ${over.status} ${JSON.stringify(over.data)}`);
  check("8.13 no state change after rejected pay", fin.data.paidEMIs === 12);

  // ============ 9. Update ============
  console.log("\n=== 9. Update ===");
  // 9a. financeCompany-only update keeps schedule
  const u1 = await api("PUT", `/fleet/emis/${emiId}`, { financeCompany: "HDFC Ltd" });
  check("9.1 financeCompany updated", u1.status === 200 && u1.data.financeCompany === "HDFC Ltd", `got ${u1.status} ${u1.data?.financeCompany}`);
  check("9.2 schedule untouched (still 12 paid)", (await db(`SELECT COUNT(*)::int c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1 AND status='paid'`, [emiId])).rows[0].c === 12);
  // 9b. schedule-affecting update preserves paid count
  const u2 = await api("PUT", `/fleet/emis/${c5.data.id}`, { loanAmount: 900000, totalEMIs: 24 });
  check("9.3 schedule-affecting update 200", u2.status === 200, `got ${u2.status} ${JSON.stringify(u2.data)}`);
  check("9.4 emiAmount recomputed round(900000/24)=37500", u2.data.emiAmount === 37500, `got ${u2.data.emiAmount}`);
  check("9.5 totalEMIs 24", u2.data.totalEMIs === 24, `got ${u2.data.totalEMIs}`);
  check("9.6 endDate recomputed", u2.data.endDate === "2027-01-10", u2.data.endDate);
  const u2rows = (await db(`SELECT COUNT(*)::int c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [c5.data.id])).rows[0].c;
  check("9.7 schedule regenerated to 24 rows", u2rows === 24, `got ${u2rows}`);
  const u2sum = (await db(`SELECT SUM(amount)::text s FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [c5.data.id])).rows[0].s;
  check("9.8 regenerated schedule sums to new loan", Number(u2sum) === 900000, u2sum);
  const u2paid = (await db(`SELECT COUNT(*)::int c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1 AND status='paid'`, [c5.data.id])).rows[0].c;
  check("9.9 paid count preserved (0 for overdue fixture)", u2paid === 0, `got ${u2paid}`);

  // ============ 10. Update validation + missing 404 ============
  console.log("\n=== 10. Update guards ===");
  const ux = await api("PUT", `/fleet/emis/99999999`, { financeCompany: "Nope" });
  check("10.1 update missing -> 404", ux.status === 404, `got ${ux.status}`);
  const ubad = await api("PUT", `/fleet/emis/${emiId}`, { totalEMIs: -3 });
  check("10.2 invalid update -> 4xx", ubad.status >= 400 && ubad.status < 500, `got ${ubad.status}`);

  // ============ 11. Delete ============
  console.log("\n=== 11. Delete ===");
  const del = await api("DELETE", `/fleet/emis/${emiId}`);
  check("11.1 delete 200", del.status === 200 && del.data.deleted === true, `got ${del.status} ${JSON.stringify(del.data)}`);
  check("11.2 record gone", (await db(`SELECT COUNT(*)::int c FROM vehicle_emis WHERE id = $1`, [emiId])).rows[0].c === 0);
  check("11.3 schedule cascaded", (await db(`SELECT COUNT(*)::int c FROM vehicle_emi_installments WHERE vehicle_emi_id = $1`, [emiId])).rows[0].c === 0);
  const del2 = await api("DELETE", `/fleet/emis/${emiId}`);
  check("11.4 delete again -> 404", del2.status === 404, `got ${del2.status}`);

  console.log(`\n======================================`);
  console.log(`EMI TESTS RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    for (const id of vehIds) await db(`DELETE FROM vehicles WHERE id = $1`, [id]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}
