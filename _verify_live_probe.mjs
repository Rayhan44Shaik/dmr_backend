// Live strict verification probe — runs the REAL services/routes against a
// real PostgreSQL engine (PGlite). Scratch file, removed after verification.
import { startTestDb, applySchema } from "./tests/helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("./src/config/db.js");
const { staffService } = await import("./src/services/staffService.js");
const { mastersService } = await import("./src/services/mastersService.js");
const { dutyPlannerService } = await import("./src/services/dutyPlannerService.js");

let failures = 0;
let checks = 0;
function ok(cond, label, extra) {
  checks++;
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${extra ? "  -> " + JSON.stringify(extra) : ""}`);
  }
}
async function expectReject(p, label, wantStatus, msgContains) {
  try {
    const r = await p;
    ok(false, label, `resolved with ${JSON.stringify(r)}`);
  } catch (e) {
    const status = e && e.status;
    const msg = e && e.message ? String(e.message) : "";
    ok(
      status === wantStatus && (!msgContains || msg.toLowerCase().includes(msgContains.toLowerCase())),
      label,
      { status, msg }
    );
  }
}
function pad2(n) { return n < 10 ? `0${n}` : String(n); }
function loc(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
function sundayOf(dateStr) { return addDays(mondayOf(dateStr), 6); }

let empSeq = 0;
async function seedEmp(name) {
  empSeq++;
  const e = await mastersService.upsertEmployee({
    employeeName: `${name}-${empSeq}`,
    department: "Operations",
    role: "Worker",
    phoneNumber: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    salary: 15000,
    status: "Active",
  });
  return { id: e.id, name: `${name}-${empSeq}` };
}

async function setPaidAt(id, daysAgo) {
  await pool.query("ALTER TABLE salary_records DISABLE TRIGGER trg_salary_lifecycle");
  try {
    await pool.query(`UPDATE salary_records SET paid_at = NOW() - INTERVAL '${daysAgo} days' WHERE id = $1`, [id]);
  } finally {
    await pool.query("ALTER TABLE salary_records ENABLE TRIGGER trg_salary_lifecycle");
  }
}

const now = new Date();
const today = loc(now);
const curMonday = mondayOf(today);
const curSunday = sundayOf(today);
const prevWeekMonday = addDays(curMonday, -7);
const prevWeekSunday = addDays(curMonday, -1);
const pastMonday = addDays(curMonday, -21);
const pastSunday = sundayOf(pastMonday);
const nextMonday = addDays(curMonday, 7);
console.log(`today=${today} curMonday=${curMonday} curSunday=${curSunday}`);
console.log(`prevWeekMonday=${prevWeekMonday} prevWeekSunday=${prevWeekSunday}`);
console.log(`pastMonday=${pastMonday} pastSunday=${pastSunday} nextMonday=${nextMonday}`);

console.log("\n=== 1A/1B SALARY lifecycle (Pending/Submitted) ===");
{
  const e = await seedEmp("SA");
  const rec = await staffService.createSalary({ employeeId: e.id, month: "2026-02", basicSalary: 9000 });
  ok(rec.status === "Pending", "create -> Pending");
  const edited = await staffService.updateSalaryById(rec.id, { basicSalary: 9500, overtime: 300 });
  ok(edited.basicSalary === 9500 && edited.netSalary === 9800 && edited.status === "Pending", "draft editable, totals server-computed");
  const sub = await staffService.submitSalary(rec.id, "tester");
  ok(sub.status === "Submitted", "submit -> Submitted (B)");
  await expectReject(staffService.updateSalaryById(rec.id, { basicSalary: 1 }), "submitted edit rejected", 409, "Submitted");
  await expectReject(staffService.deleteSalary(rec.id), "submitted delete rejected", 409);
  await expectReject(staffService.submitSalary(rec.id), "submitted re-submit rejected", 409);
  ok((await staffService.updateSalaryStatus(rec.id)).status === "Pending", "un-submit Submitted -> Pending allowed");
}

console.log("\n=== 1C SALARY Paid within 7 days ===");
{
  const e = await seedEmp("SB");
  const rec = await staffService.createSalary({ employeeId: e.id, month: "2026-02", basicSalary: 10000 });
  const paid = await staffService.paySalary(rec.id, { paymentDate: "2026-02-27", paymentMode: "Cash", paidBy: "acc" });
  ok(paid.status === "Paid" && paid.paymentRef, "pay -> Paid with ref (paid_at=NOW)");
  await expectReject(staffService.updateSalaryById(rec.id, { basicSalary: 1 }), "Paid (window open) edit rejected", 409, "Paid");
  await expectReject(staffService.deleteSalary(rec.id), "Paid (window open) delete rejected", 409);
  await expectReject(staffService.paySalary(rec.id, { paymentDate: "2026-02-27", paymentMode: "Cash" }), "Paid (window open) re-pay rejected", 409);
  const reverted = await staffService.updateSalaryStatus(rec.id);
  ok(reverted.status === "Pending" && reverted.paymentRef == null, "Mark-Unpaid allowed inside window (uses real paid_at)");
}

console.log("\n=== 1D SALARY Paid after 7 days (open month, per-record) ===");
{
  const old = await seedEmp("SC1");
  const fresh = await seedEmp("SC2");
  const rOld = await staffService.createSalary({ employeeId: old.id, month: "2026-01", basicSalary: 11000 });
  const rFresh = await staffService.createSalary({ employeeId: fresh.id, month: "2026-01", basicSalary: 12000 });
  const pOld = await staffService.paySalary(rOld.id, { paymentDate: "2026-01-30", paymentMode: "Cash", paidBy: "acc" });
  await staffService.paySalary(rFresh.id, { paymentDate: "2026-01-30", paymentMode: "Cash", paidBy: "acc" });
  const refBefore = pOld.paymentRef;
  const paidAtBefore = String(pOld.paidAt);
  await setPaidAt(rOld.id, 9);
  const row = (await pool.query("SELECT status, payment_ref, paid_at FROM salary_records WHERE id=$1", [rOld.id])).rows[0];
  ok(row.status === "Paid", "record still Paid after window expiry");
  await expectReject(staffService.updateSalaryStatus(rOld.id), "post-7d Mark-Unpaid rejected", 409, "correction window");
  await expectReject(staffService.updateSalaryById(rOld.id, { basicSalary: 1 }), "post-7d edit rejected", 409, "Paid");
  await expectReject(staffService.deleteSalary(rOld.id), "post-7d delete rejected", 409, "Paid");
  await expectReject(staffService.submitSalary(rOld.id), "post-7d submit rejected", 409, "Paid");
  await expectReject(staffService.paySalary(rOld.id, { paymentDate: "2026-01-30", paymentMode: "Cash" }), "post-7d re-pay rejected", 409);
  await expectReject(staffService.createSalary({ employeeId: old.id, month: "2026-01", basicSalary: 5 }), "create same emp+month rejected", 409);
  const row2 = (await pool.query("SELECT status, payment_ref, paid_at FROM salary_records WHERE id=$1", [rOld.id])).rows[0];
  ok(row2.payment_ref === refBefore && String(row2.paid_at) === paidAtBefore && row2.status === "Paid", "DB untouched after failed mutations");
}

console.log("\n=== 1E SALARY previous/closed payroll month ===");
{
  const e = await seedEmp("SD");
  const rec = await staffService.createSalary({ employeeId: e.id, month: "2025-12", basicSalary: 8000 });
  await staffService.paySalary(rec.id, { paymentDate: "2025-12-20", paymentMode: "Cash", paidBy: "acc" });
  await setPaidAt(rec.id, 40);
  const ref = (await pool.query("SELECT payment_ref FROM salary_records WHERE id=$1", [rec.id])).rows[0].payment_ref;
  await expectReject(staffService.submitSalary(rec.id), "closed month submit rejected", 409, "closed");
  await expectReject(staffService.updateSalaryStatus(rec.id), "closed month mark-unpaid rejected", 409, "closed");
  await expectReject(staffService.paySalary(rec.id, { paymentDate: "2025-12-20", paymentMode: "Cash" }), "closed month re-pay rejected", 409, "closed");
  await expectReject(staffService.updateSalaryById(rec.id, { basicSalary: 1 }), "closed month edit rejected", 409, "closed");
  await expectReject(staffService.deleteSalary(rec.id), "closed month delete rejected", 409, "closed");
  await expectReject(staffService.createSalary({ employeeId: e.id, month: "2025-12", basicSalary: 5 }), "closed month create rejected", 409, "closed");
  await expectReject(staffService.upsertSalary({ employeeId: e.id, month: "2025-12", basicSalary: 5 }), "closed month upsert rejected", 409);
  await expectReject(staffService.generateForMonth("2025-12"), "closed month regenerate rejected", 409, "closed");
  const row = (await pool.query("SELECT status, payment_ref, paid_at FROM salary_records WHERE id=$1", [rec.id])).rows[0];
  ok(row.status === "Paid" && row.payment_ref === ref, "closed month DB untouched");
}

console.log("\n=== 1F SALARY atomicity ===");
{
  const before = (await pool.query("SELECT COUNT(*)::int c FROM payments")).rows[0].c;
  const e = await seedEmp("SE");
  const rec = await staffService.createSalary({ employeeId: e.id, month: "2025-11", basicSalary: 0 });
  await expectReject(staffService.paySalary(rec.id, { paymentDate: "2025-11-15", paymentMode: "Cash" }), "zero-net pay rejected", 422);
  const after = (await pool.query("SELECT COUNT(*)::int c FROM payments")).rows[0].c;
  const row = (await pool.query("SELECT status, payment_ref, paid_at FROM salary_records WHERE id=$1", [rec.id])).rows[0];
  ok(after === before, "no payment created on failed pay");
  ok(row.status === "Pending" && row.payment_ref == null && row.paid_at == null, "salary row untouched on failed pay");
}

console.log("\n=== 2 DUTY previous (completed) week — every mutation endpoint ===");
{
  const e = await seedEmp("DP");
  // seed a real assignment in the past week via SQL (assigned before it closed)
  await pool.query(
    `INSERT INTO duty_assignments (employee_id, employee_name, department, role, duty_type, duty_date)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.id, e.name, "Operations", "Worker", "Delivery", addDays(pastMonday, 1)]
  );
  const pastWeek = await dutyPlannerService.getDutyWeek(pastMonday);
  ok(pastWeek.status === "Closed" && pastWeek.weekEnd === pastSunday, "past week GET reports Closed, Monday..Sunday");
  // 1. assign
  await expectReject(
    dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "Delivery", date: addDays(pastMonday, 2) }),
    "past week ASSIGN rejected",
    409
  );
  // 2. update
  const pastAssign = (await pool.query("SELECT id FROM duty_assignments WHERE employee_id=$1 AND duty_date=$2", [e.id, addDays(pastMonday, 1)])).rows[0];
  await expectReject(
    dutyPlannerService.upsertDuty({ id: pastAssign.id, employeeId: e.id, dutyType: "Repair", date: addDays(pastMonday, 1) }),
    "past week UPDATE rejected",
    409
  );
  // 3. delete
  await expectReject(dutyPlannerService.deleteDuty(pastAssign.id), "past week DELETE rejected", 409);
  // 4. auto-assign preview must not mutate
  const plan = await dutyPlannerService.autoAssignPreview(pastMonday);
  const cntAfterPreview = (await pool.query("SELECT COUNT(*)::int c FROM duty_assignments WHERE duty_date BETWEEN $1 AND $2", [pastMonday, pastSunday])).rows[0].c;
  ok(cntAfterPreview === 1, "auto-assign PREVIEW does not mutate a closed week");
  // 5. auto-assign apply
  await expectReject(dutyPlannerService.autoAssignApply(pastMonday), "past week AUTO-ASSIGN APPLY rejected", 409);
  // 6. submit
  await expectReject(dutyPlannerService.submitWeek(pastMonday), "past week SUBMIT rejected", 409, "closed");
  // stored row still Open (effective status computed)
  const dw = (await pool.query("SELECT status FROM duty_weeks WHERE week_start=$1", [pastMonday])).rows;
  ok(dw.length === 1 && dw[0].status === "Open", "stored week row remains Open (status computed)");
}

console.log("\n=== 3 Monday-Sunday boundary ===");
{
  ok(sundayOf(prevWeekMonday) === prevWeekSunday, "weekEnd is always the Sunday");
  ok(mondayOf(prevWeekSunday) === prevWeekMonday, "Sunday belongs to the week starting its prior Monday");
  ok(mondayOf(addDays(prevWeekSunday, 1)) === curMonday, "Monday after Sunday starts the new week");
  const st = await dutyPlannerService.getWeekStatus(prevWeekMonday);
  ok(st.status === "Closed", "Sunday's week (before midnight) is the previous/closed week");
  const e = await seedEmp("DPB");
  // duty dated on that past Sunday -> closed week
  await expectReject(
    dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "Delivery", date: prevWeekSunday }),
    "duty on past Sunday (prev week) rejected",
    409
  );
  // duty dated the Monday after -> new editable week
  const okRes = await dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "Delivery", date: nextMonday });
  ok(okRes.status !== "Closed", "duty on new Monday accepted into an editable week");
  const curSt = await dutyPlannerService.getWeekStatus(curMonday);
  ok(["Open", "Submitted"].includes(curSt.status), `current week business status (${curSt.status})`);
}

console.log("\n=== 4 DUTY current week editable + Saturday validation ===");
{
  // current week may be Open or already Submitted by earlier days; use an fresh future open week
  // for assign/update/remove:
  const e = await seedEmp("DPC");
  const up1 = await dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "OfficeDuty", date: addDays(nextMonday, 1) });
  ok(up1.weekStart === nextMonday && up1.status === "Open", "fresh week ASSIGN allowed");
  const a1 = (await pool.query("SELECT id FROM duty_assignments WHERE employee_id=$1 AND duty_date=$2", [e.id, addDays(nextMonday, 1)])).rows[0];
  const up2 = await dutyPlannerService.upsertDuty({ id: a1.id, employeeId: e.id, dutyType: "Repair", date: addDays(nextMonday, 1) });
  ok(up2.assignments.some((x) => x.id === a1.id && x.dutyType === "Repair"), "fresh week UPDATE allowed");
  const del = await dutyPlannerService.deleteDuty(a1.id);
  ok(del.status === "Open", "fresh week REMOVE allowed");
  // Saturday validation
  const sat = addDays(nextMonday, 5);
  await expectReject(
    dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "WeeklyOff", date: sat }),
    "Saturday WeeklyOff rejected",
    422,
    "Saturday is compulsory duty"
  );
  await expectReject(
    dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "Rest", date: sat }),
    "Saturday Rest rejected",
    422
  );
  const satOk = await dutyPlannerService.upsertDuty({ employeeId: e.id, dutyType: "Delivery", date: sat });
  ok(satOk.assignments.some((x) => x.date === sat && x.dutyType === "Delivery"), "Saturday Delivery allowed");
  // Auto Assign apply on a future week
  const e2 = await seedEmp("DPD");
  await dutyPlannerService.upsertDuty({ employeeId: e2.id, dutyType: "Delivery", date: addDays(addDays(curMonday, 14), 5) });
  const applied = await dutyPlannerService.autoAssignApply(addDays(curMonday, 14));
  ok(applied.status === "Open", "auto-assign APPLY works on an open non-completed week");
}

console.log(`\n===== RESULT: ${checks} checks, ${failures} failures =====`);
await testDb.close();
await pool.end();
process.exit(failures ? 1 : 0);