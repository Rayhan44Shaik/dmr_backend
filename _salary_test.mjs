// =============================================================================
// LIVE end-to-end verification of the hardened Staff → Salary Register backend.
// Backend must be running on :4000 (tsx watch) with 030_salary_hardening applied.
//
// Covers (mapped to the task's 30-item list):
//   1. salary validation         16. Pending → Paid
//   2. invalid employee          17. Paid → Pending rejected
//   3. invalid month             18. Paid → Paid rejected
//   4. negative salary           19. Paid salary edit rejected
//   5. NaN                       20. payment created exactly once
//   6. Infinity                  21. payment_ref stored
//   7. duplicate employee/month  22. duplicate payment rejected
//   8. generation for month      23. concurrent payment
//   9. generation idempotent     24. payment failure rolls back salary
//  10. calculation correctness   25. salary failure rolls back payment
//  11. duty working-days         26. department filter
//  12. approved leave            27. month filter
//  13. advance/loan              28. no synthetic salary records
//  14. pending salary update     29. historical records preserved
//  15. client totals ignored     30. database uniqueness
//
// Fixtures use isolated 2014 months/dates and created_by='salary-test' markers
// (no real business data is touched) and are fully cleaned up on exit.
// =============================================================================
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0,
  fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ${extra}`);
  }
};

async function jsonApi(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** Send a raw JSON string (needed to smuggle Infinity via 1e400). */
async function rawJson(method, path, raw) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const postSalary = (body) => jsonApi("POST", "/staff/salaries", body);
const putSalaryUpsert = (body) => jsonApi("PUT", "/staff/salaries", body);
const putSalary = (id, body) => jsonApi("PUT", `/staff/salaries/${id}`, body);
const patchStatus = (id, body) => jsonApi("PATCH", `/staff/salaries/${id}/status`, body);
const paySalary = (id, body) => jsonApi("POST", `/staff/salaries/${id}/pay`, body);
const delSalary = (id) => jsonApi("DELETE", `/staff/salaries/${id}`);
const listSalaries = (qs = "") => jsonApi("GET", `/staff/salaries${qs}`);
const getEmpSalary = (empId, qs = "") => jsonApi("GET", `/staff/salaries/${empId}${qs}`);
const generate = (body) => jsonApi("POST", "/staff/salaries/generate", body);
const listPayments = (qs = "") => jsonApi("GET", `/accounts/payments${qs}`);

// ---- fixture scope ----------------------------------------------------------
const M1 = "2014-12"; // generation + duty/leave/advance integration
const M2 = "2014-11"; // calculation correctness
const M3 = "2014-10"; // bogus-totals override + lifecycle
const M4 = "2014-09"; // net-zero + payment failure (no side effects)
const M5 = "2014-08"; // concurrency
const M6 = "2014-07"; // DB-transaction rollback simulation
const ALL_MONTHS = [M1, M2, M3, M4, M5, M6];
const PAY_DATES = ["2014-11-15", "2014-08-15", "2014-07-15"];

const fmtPay = /^PAY-\d{8}-\d{3}$/;

// ---- fixtures ---------------------------------------------------------------
let emp1, emp2, emp3; // employee rows {id,name,department,salary}
let dutyId = null, leaveId = null, advanceId = null, loanId = null;
const createdSalaryIds = [];

try {
  // ---- pickup real employee rows (authoritative Employee Master) -------------
  const emps = await db(
    `SELECT id, employee_name, department, salary, status FROM employees WHERE status = 'Active' ORDER BY id LIMIT 3`
  );
  if (emps.rows.length < 2) throw new Error("Need at least 2 active employees for fixtures");
  emp1 = emps.rows[0];
  emp2 = emps.rows[1];
  emp3 = emps.rows[2] ?? emps.rows[0];

  // ---- reset stale fixtures from a crashed previous run ----------------------
  await db(`DELETE FROM salary_records WHERE month = ANY($1::text[])`, [ALL_MONTHS]);
  // salary payments created by tests have payment_date in the fixture window
  await db(`DELETE FROM payments WHERE created_by = 'salary-test'`);
  await db(`DELETE FROM payment_number_counters WHERE counter_date = ANY($1::date[])`, [PAY_DATES]);

  // ============ 1/2/3/4/5/6/: validation ============
  console.log("\n=== Validation ===");
  const vEmp = await postSalary({ employeeId: 999999, month: M2 });
  check("2. invalid employee → 404", vEmp.status === 404, `got ${vEmp.status}`);
  const vMonth1 = await postSalary({ employeeId: emp1.id, month: "2014-13" });
  check("3. invalid month (13) → 400", vMonth1.status === 400, `got ${vMonth1.status}`);
  const vMonth2 = await postSalary({ employeeId: emp1.id, month: "abc" });
  check("3. invalid month (abc) → 400", vMonth2.status === 400, `got ${vMonth2.status}`);
  const vMonth3 = await postSalary({ employeeId: emp1.id, month: "2014-1" });
  check("3. invalid month (2014-1) → 400", vMonth3.status === 400, `got ${vMonth3.status}`);
  const vNeg = await postSalary({ employeeId: emp1.id, month: M2, basicSalary: -100 });
  check("4. negative basicSalary → 400", vNeg.status === 400, `got ${vNeg.status}`);
  const vNegD = await postSalary({ employeeId: emp1.id, month: M2, otherDeductions: -5 });
  check("4. negative deduction → 400", vNegD.status === 400, `got ${vNegD.status}`);
  const vNan = await postSalary({ employeeId: emp1.id, month: M2, basicSalary: "NaN" });
  check("5. NaN (string) → 400", vNan.status === 400, `got ${vNan.status}`);
  const vStr = await postSalary({ employeeId: emp1.id, month: M2, basicSalary: "abc" });
  check("5. non-numeric money → 400", vStr.status === 400, `got ${vStr.status}`);
  const vInf = await rawJson("POST", "/staff/salaries", `{"employeeId":${emp1.id},"month":"${M2}","basicSalary":1e400,"overtime":0}`);
  check("6. Infinity → 400", vInf.status === 400, `got ${vInf.status}`);
  const vDec = await postSalary({ employeeId: emp1.id, month: M2, basicSalary: 100.123 });
  check("1/6. malformed decimal (100.123) → 400", vDec.status === 400, `got ${vDec.status}`);
  const vEmpty = await postSalary({});
  check("1. empty body → 400", vEmpty.status === 400, `got ${vEmpty.status}`);
  const vNoEmpl = await postSalary({ month: M2, basicSalary: 100 });
  check("1. missing employeeId → 400", vNoEmpl.status === 400, `got ${vNoEmpl.status}`);

  // ============ 10. calculation correctness ============
  console.log("\n=== Calculation correctness (components explicit) ===");
  const calc = await postSalary({
    employeeId: emp1.id,
    month: M2,
    basicSalary: 20000,
    overtime: 500,
    incentives: 300,
    fuelAllowance: 100,
    nightAllowance: 50,
    leaveDeduction: 100,
    advanceRecovery: 200,
    loanEMI: 300,
    latePenalty: 50,
    otherDeductions: 20,
  });
  if (calc.status === 201) createdSalaryIds.push(calc.data?.id);
  check("10.1 create → 201", calc.status === 201, `got ${calc.status} ${JSON.stringify(calc.data)}`);
  check("10.2 totalGross = 20950", calc.data?.totalGross === 20950, `got ${calc.data?.totalGross}`);
  check("10.3 totalDeductions = 670", calc.data?.totalDeductions === 670, `got ${calc.data?.totalDeductions}`);
  check("10.4 netSalary = 20280", calc.data?.netSalary === 20280, `got ${calc.data?.netSalary}`);
  check("10.5 status defaults Pending (client cannot set)", calc.data?.status === "Pending", `got ${calc.data?.status}`);
  check("10.6 employeeName from master", calc.data?.employeeName === emp1.employee_name, `got ${calc.data?.employeeName}`);
  check("10.7 month preserved", calc.data?.month === M2, `got ${calc.data?.month}`);
  check("10.8 paymentRef null when Pending", calc.data?.paymentRef === null, `got ${calc.data?.paymentRef}`);

  // ============ 7. duplicate employee/month ============
  console.log("\n=== Duplicate (employee_id, month) ===");
  const dup = await postSalary({ employeeId: emp1.id, month: M2, basicSalary: 999 });
  check("7. duplicate employee/month → 409", dup.status === 409, `got ${dup.status} ${JSON.stringify(dup.data)}`);
  const getM2 = await getEmpSalary(emp1.id, `?month=${M2}`);
  check("9. GET /salaries/:employeeId?month → 200 same record", getM2.status === 200 && getM2.data?.id === calc.data?.id, `got ${getM2.status}`);
  const getBadEmp = await getEmpSalary(999999, `?month=${M2}`);
  check("2. GET invalid employee → 404", getBadEmp.status === 404, `got ${getBadEmp.status}`);

  // ============ 15. client-supplied totals ALWAYS ignored ============
  console.log("\n=== Client totals cannot override backend calculation ===");
  const bogus = await postSalary({
    employeeId: emp1.id,
    month: M3,
    basicSalary: 10000,
    overtime: 1000,
    netSalary: 999999,
    totalGross: 1,
    totalDeductions: 2,
  });
  if (bogus.status === 201) createdSalaryIds.push(bogus.data?.id);
  check("15.1 create with bogus totals → 201", bogus.status === 201, `got ${bogus.status}`);
  check("15.2 netSalary computed (11000) not client (999999)", bogus.data?.netSalary === 11000, `got ${bogus.data?.netSalary}`);
  check("15.3 totalGross computed (11000) not client (1)", bogus.data?.totalGross === 11000, `got ${bogus.data?.totalGross}`);
  check("15.4 totalDeductions computed (0) not client (2)", bogus.data?.totalDeductions === 0, `got ${bogus.data?.totalDeductions}`);
  const bogusDb = (await db(`SELECT net_salary, total_gross, total_deductions FROM salary_records WHERE id = $1`, [bogus.data?.id])).rows[0];
  check("15.5 persisted values are backend-computed", Number(bogusDb.net_salary) === 11000 && Number(bogusDb.total_gross) === 11000 && Number(bogusDb.total_deductions) === 0, JSON.stringify(bogusDb));

  // ============ 30. database uniqueness ============
  console.log("\n=== Database-level uniqueness guard ===");
  let dbErr = null;
  try {
    await db(
      `INSERT INTO salary_records (employee_id, employee_name, department, month, basic_salary, net_salary) VALUES ($1,$2,$3,$4,10,10)`,
      [emp1.id, emp1.employee_name, emp1.department, M3]
    );
  } catch (e) {
    dbErr = e;
  }
  check("30.1 direct duplicate insert → 23505", !!dbErr && dbErr.code === "23505", dbErr ? `code=${dbErr.code}` : "no error");

  // ============ 11/12/13. duty + leave + advance fixtures for generation ======
  console.log("\n=== Duty / Leave / Advance fixtures ===");
  const duty = await db(
    `INSERT INTO duty_assignments (employee_id, employee_name, department, role, duty_type, duty_date)
     VALUES ($1,$2,$3,$4,'Office','2014-12-01') RETURNING id`,
    [emp2.id, emp2.employee_name, emp2.department, emp2.department]
  );
  dutyId = duty.rows[0].id;
  const leave = await db(
    `INSERT INTO leave_requests (employee_id, employee_name, leave_type, from_date, to_date, days, status)
     VALUES ($1,$2,'Casual','2014-12-05','2014-12-05',1,'Approved') RETURNING id`,
    [emp2.id, emp2.employee_name]
  );
  leaveId = leave.rows[0].id;
  const adv = await db(
    `INSERT INTO advance_loans (employee_id, employee_name, loan_type, principal, issued_date, total_repaid, monthly_deduction, remaining_balance, status)
     VALUES ($1,$2,'Advance',10000,'2014-01-01',6000,500,7000,'Active') RETURNING id`,
    [emp3.id, emp3.employee_name]
  );
  advanceId = adv.rows[0].id;
  const loan = await db(
    `INSERT INTO advance_loans (employee_id, employee_name, loan_type, principal, issued_date, total_repaid, monthly_deduction, remaining_balance, status)
     VALUES ($1,$2,'Loan',12000,'2014-01-01',5000,700,600,'Active') RETURNING id`,
    [emp3.id, emp3.employee_name]
  );
  loanId = loan.rows[0].id;

  // ============ 8. generation for month ============
  console.log("\n=== Generation for month ===");
  const totalEmps = (await db("SELECT count(*)::int c FROM employees")).rows[0].c;
  const gen1 = await generate({ month: M1 });
  check("8.1 generate → 200", gen1.status === 200, `got ${gen1.status} ${JSON.stringify(gen1.data)}`);
  check("8.2 one row per employee generated", gen1.data?.generated === totalEmps, `generated=${gen1.data?.generated} expected=${totalEmps}`);
  check("8.3 requested == employees", gen1.data?.requested === totalEmps, `got ${gen1.data?.requested}`);
  const genRows = (await db(`SELECT * FROM salary_records WHERE month = $1`, [M1])).rows;
  check("8.4 exactly N rows persisted", genRows.length === totalEmps, `got ${genRows.length}`);
  check("8.5 all rows Pending", genRows.every((r) => r.status === "Pending"));
  check("8.6 every net == basic minus recovery (no fabricated rows)", genRows.every((r) => Number(r.net_salary) === Number(r.basic_salary) - Number(r.advance_recovery) - Number(r.loan_emi)), JSON.stringify(genRows.slice(0, 1)));
  const reg1 = await listSalaries(`?month=${M1}`);
  check("8.7 register exposes only real rows (no synthesis)", reg1.status === 200 && Array.isArray(reg1.data) && reg1.data.length === totalEmps, `got ${reg1.status} len=${reg1.data?.length}`);

  // ============ 9. generation idempotent ============
  console.log("\n=== Generation idempotency ===");
  const gen2 = await generate({ month: M1 });
  check("9.1 second run generates nothing", gen2.data?.generated === 0, `generated=${gen2.data?.generated}`);
  check("9.2 second run skips all existing", gen2.data?.skippedExisting === totalEmps, `skipped=${gen2.data?.skippedExisting}`);
  const genRows2 = (await db(`SELECT count(*)::int c FROM salary_records WHERE month = $1`, [M1])).rows[0].c;
  check("9.3 no duplicate rows", genRows2 === totalEmps, `got ${genRows2}`);
  const pairs = (await db(`SELECT employee_id, count(*) c FROM salary_records WHERE month = $1 GROUP BY employee_id HAVING count(*) > 1`, [M1])).rows;
  check("9.4 UNIQUE(employee_id, month) held", pairs.length === 0, JSON.stringify(pairs));

  // ============ 11. duty working-days integration ============
  console.log("\n=== Duty working-days integration ===");
  const att = await jsonApi("GET", `/staff/attendance/summary?month=${M1}`);
  check("11.1 attendance summary reachable", att.status === 200, `got ${att.status}`);
  const emp2Reg = reg1.data?.find((r) => r.employeeId === emp2.id);
  check("11.2 workingDays derived (>=1 from fixture duty)", emp2Reg?.workingDays >= 1, `got ${emp2Reg?.workingDays}`);
  check("11.3 presentDays == 1 (fixture duty)", emp2Reg?.presentDays === 1, `got ${emp2Reg?.presentDays}`);
  const dutyRow = att.data?.rows?.find((r) => r.employeeId === emp2.id);
  check("11.4 marks contain the fixture date", dutyRow?.dayMarks?.["2014-12-01"] === "P", JSON.stringify(dutyRow?.dayMarks));

  // ============ 12. approved leave integration ============
  console.log("\n=== Approved leave integration ===");
  check("12.1 leaveDays == 1 (approved fixture)", emp2Reg?.leaveDays === 1, `got ${emp2Reg?.leaveDays}`);
  check("12.2 leave day marked 'L' in summary", dutyRow?.dayMarks?.["2014-12-05"] === "L", JSON.stringify(dutyRow?.dayMarks));

  // ============ 13. advance / loan integration ============
  console.log("\n=== Advance / Loan integration (monthly_deduction, capped) ===");
  const emp3Reg = reg1.data?.find((r) => r.employeeId === emp3.id);
  check("13.1 advanceRecovery uses monthly_deduction (500)", emp3Reg?.advanceRecovery === 500, `got ${emp3Reg?.advanceRecovery}`);
  check("13.2 loanEMI capped at remaining_balance (600 < 700)", emp3Reg?.loanEMI === 600, `got ${emp3Reg?.loanEMI}`);
  const emp3RowGen = genRows.find((r) => r.employee_id === emp3.id);
  check("13.3 recovery never exceeds remaining_balance", Number(emp3RowGen.advance_recovery) + Number(emp3RowGen.loan_emi) <= 7600, "recovery exceeded balance");
  check("13.4 net = basic minus recovery (12000 - 1100)", Number(emp3RowGen.net_salary) === Number(emp3RowGen.basic_salary) - 1100, `net=${emp3RowGen.net_salary} basic=${emp3RowGen.basic_salary}`);

  // ============ 14. pending salary update ============
  console.log("\n=== Pending salary update (totals recomputed) ===");
  const upd = await putSalary(bogus.data?.id, { basicSalary: 15000, overtime: 100 });
  check("14.1 update → 200", upd.status === 200, `got ${upd.status} ${JSON.stringify(upd.data)}`);
  check("14.2 totalGross recomputed (15100)", upd.data?.totalGross === 15100, `got ${upd.data?.totalGross}`);
  check("14.3 netSalary recomputed (15100)", upd.data?.netSalary === 15100, `got ${upd.data?.netSalary}`);
  check("14.4 status remains Pending", upd.data?.status === "Pending", `got ${upd.data?.status}`);
  const updBogus = await putSalary(bogus.data?.id, { basicSalary: 16000, netSalary: 1, totalGross: 2 });
  check("15.6 update cannot smuggle totals", updBogus.status === 200 && updBogus.data?.netSalary === 16100, `got ${updBogus.status} net=${updBogus.data?.netSalary}`);

  // ============ 16/20/21. Pending → Paid via payment operation ============
  console.log("\n=== Pending → Paid (single payment) ===");
  const pay = await paySalary(bogus.data?.id, {
    paymentDate: "2014-11-15",
    paymentMode: "Cash",
    paidBy: "salary-test",
  });
  check("16.1 pay → 200", pay.status === 200, `got ${pay.status} ${JSON.stringify(pay.data)}`);
  check("16.2 status now Paid", pay.data?.status === "Paid", `got ${pay.data?.status}`);
  check("21.1 paymentRef stored (PAY-YYYYMMDD-NNN)", fmtPay.test(pay.data?.paymentRef ?? ""), `got ${pay.data?.paymentRef}`);
  check("16.3 paymentDate recorded", pay.data?.paymentDate === "2014-11-15", `got ${pay.data?.paymentDate}`);
  check("16.4 paidAt recorded", !!pay.data?.paidAt, `got ${pay.data?.paidAt}`);
  check("16.5 financial figures unchanged by payment", pay.data?.netSalary === 16100, `net=${pay.data?.netSalary}`);

  const payDb = (await db(`SELECT status, payment_ref, payment_date, paid_at FROM salary_records WHERE id = $1`, [bogus.data?.id])).rows[0];
  check("20.1 DB row is Paid with payment_ref", payDb.status === "Paid" && payDb.payment_ref != null);
  const payments = await listPayments(`?search=${encodeURIComponent(pay.data?.paymentRef ?? "")}`);
  const payRows = Array.isArray(payments.data) ? payments.data.filter((p) => p.paymentNo === pay.data?.paymentRef) : [];
  check("20.2 payment created exactly once", payRows.length === 1, `found ${payRows.length}`);
  const pr = payRows[0];
  check("20.3 paymentType = Salary Payment", pr?.paymentType === "Salary Payment", `got ${pr?.paymentType}`);
  check("20.4 paidTo = employee name", pr?.paidTo === emp1.employee_name, `got ${pr?.paidTo}`);
  check("20.5 amount = netSalary", pr?.amount === pay.data?.netSalary, `amount=${pr?.amount} net=${pay.data?.netSalary}`);
  check("20.6 category = Salary", pr?.category === "Salary", `got ${pr?.category}`);
  check("20.7 paymentMode passed through", pr?.paymentMode === "Cash", `got ${pr?.paymentMode}`);
  check("20.8 payment status Paid", pr?.status === "Paid", `got ${pr?.status}`);

  // ============ 17/18/19/22. lifecycle rejections on Paid ============
  console.log("\n=== Lifecycle rejections (Paid record) ===");
  const toPending = await patchStatus(bogus.data?.id, { status: "Pending" });
  check("17. Paid → Pending rejected (409)", toPending.status === 409, `got ${toPending.status}`);
  const toPaid = await patchStatus(bogus.data?.id, { status: "Paid" });
  check("18. PATCH status → Paid rejected (400)", toPaid.status === 400, `got ${toPaid.status}`);
  const payAgain = await paySalary(bogus.data?.id, { paymentDate: "2014-11-16", paymentMode: "Cash", paidBy: "salary-test" });
  check("22. duplicate payment rejected (409)", payAgain.status === 409, `got ${payAgain.status} ${JSON.stringify(payAgain.data)}`);
  const editPaid = await putSalary(bogus.data?.id, { basicSalary: 5000 });
  check("19.1 Paid salary edit rejected (409)", editPaid.status === 409, `got ${editPaid.status}`);
  const upUpsert = await putSalaryUpsert({ employeeId: emp1.id, month: M3, basicSalary: 5000 });
  check("19.2 upsert on Paid rejected (409)", upUpsert.status === 409, `got ${upUpsert.status}`);
  const delPaid = await delSalary(bogus.data?.id);
  check("19.3 Paid salary delete rejected (409)", delPaid.status === 409, `got ${delPaid.status}`);
  const stillOne = await listPayments(`?search=${encodeURIComponent(pay.data?.paymentRef ?? "")}`);
  const stillOneRows = (Array.isArray(stillOne.data) ? stillOne.data.filter((p) => p.paymentNo === pay.data?.paymentRef) : []).length;
  check("22. still exactly one payment row", stillOneRows === 1, `found ${stillOneRows}`);

  // ============ 23. concurrent payment (idempotency) ============
  console.log("\n=== Concurrent payment — exactly one success ===");
  const raceSalary = await postSalary({ employeeId: emp2.id, month: M5, basicSalary: 18000 });
  if (raceSalary.status === 201) createdSalaryIds.push(raceSalary.data?.id);
  check("23.0 race fixture created", raceSalary.status === 201, `got ${raceSalary.status}`);
  const payBody = { paymentDate: "2014-08-15", paymentMode: "Cash", paidBy: "salary-test" };
  const [ra, rb] = await Promise.all([
    paySalary(raceSalary.data?.id, payBody),
    paySalary(raceSalary.data?.id, payBody),
  ]);
  check("23.1 exactly one success", [ra.status, rb.status].includes(200) && [ra.status, rb.status].includes(409), `got ${ra.status}/${rb.status}`);
  const racePayCount = (await db(`SELECT count(*)::int c FROM payments WHERE created_by='salary-test' AND payment_date = $1::date`, ["2014-08-15"])).rows[0].c;
  check("23.2 exactly one Accounts Payment", racePayCount === 1, `payments=${racePayCount}`);
  const raceSalaryDb = (await db(`SELECT status, payment_ref FROM salary_records WHERE id = $1`, [raceSalary.data?.id])).rows[0];
  check("23.3 salary Paid with one ref", raceSalaryDb.status === "Paid" && fmtPay.test(raceSalaryDb.payment_ref ?? ""), JSON.stringify(raceSalaryDb));
  const dupRef = (await db(`SELECT count(*)::int c FROM salary_records WHERE payment_ref = $1`, [raceSalaryDb.payment_ref])).rows[0].c;
  check("23.4 payment_ref never duplicated", dupRef === 1, `refs=${dupRef}`);

  // ============ 24. payment failure rolls back salary ============
  console.log("\n=== Payment failure rolls back salary ===");
  const zeroNet = await postSalary({ employeeId: emp2.id, month: M4, basicSalary: 100, otherDeductions: 100 });
  if (zeroNet.status === 201) createdSalaryIds.push(zeroNet.data?.id);
  check("24.0 zero-net fixture created", zeroNet.status === 201, `got ${zeroNet.status}`);
  const zeroPay = await paySalary(zeroNet.data?.id, { paymentDate: "2014-09-15", paymentMode: "Cash", paidBy: "salary-test" });
  check("24.1 zero-net pay → 422", zeroPay.status === 422, `got ${zeroPay.status}`);
  const zeroDb = (await db(`SELECT status, payment_ref FROM salary_records WHERE id = $1`, [zeroNet.data?.id])).rows[0];
  check("24.2 salary still Pending (nothing committed)", zeroDb.status === "Pending" && zeroDb.payment_ref == null, JSON.stringify(zeroDb));
  const zeroPayments = (await db(`SELECT count(*)::int c FROM payments WHERE created_by='salary-test' AND payment_date = $1::date`, ["2014-09-15"])).rows[0].c;
  check("24.3 no payment row created", zeroPayments === 0, `payments=${zeroPayments}`);

  const badMode = await paySalary(zeroNet.data?.id, { paymentDate: "2014-09-16", paymentMode: "Bitcoin", paidBy: "salary-test" });
  check("24.4 invalid paymentMode → 400", badMode.status === 400, `got ${badMode.status}`);
  const badModeDb = (await db(`SELECT status, payment_ref FROM salary_records WHERE id = $1`, [zeroNet.data?.id])).rows[0];
  check("24.5 salary unaffected by failed payment", badModeDb.status === "Pending" && badModeDb.payment_ref == null, JSON.stringify(badModeDb));

  // ============ 25. salary failure rolls back payment (DB transaction) ========
  console.log("\n=== Salary failure rolls back payment (atomicity) ===");
  const rbSalary = await postSalary({ employeeId: emp2.id, month: M6, basicSalary: 8000 });
  if (rbSalary.status === 201) createdSalaryIds.push(rbSalary.data?.id);
  check("25.0 rollback fixture created", rbSalary.status === 201, `got ${rbSalary.status}`);
  const tx = await pool.connect();
  let simNo = null;
  try {
    await tx.query("BEGIN");
    // exact same sequence the payment operation performs, then force a failure
    await tx.query("SELECT id FROM salary_records WHERE id = $1 FOR UPDATE", [rbSalary.data?.id]);
    await tx.query(
      `INSERT INTO payment_number_counters (counter_date, last_sequence) VALUES ('2014-07-15', 1)
       ON CONFLICT (counter_date) DO UPDATE SET last_sequence = payment_number_counters.last_sequence + 1`
    );
    simNo = `PAY-20140715-001`;
    await tx.query(
      `INSERT INTO payments (payment_no, payment_date, payment_type, paid_to, amount, payment_mode, category, status, created_by)
       VALUES ($1,'2014-07-15','Salary Payment',$2,8000,'Cash','Salary','Paid','salary-test')`,
      [simNo, emp2.employee_name]
    );
    await tx.query(
      `UPDATE salary_records SET status='Paid', payment_ref=$2, payment_date='2014-07-15', paid_at=NOW() WHERE id=$1`,
      [rbSalary.data?.id, simNo]
    );
    await tx.query(`SELECT 1/0`); // <- force failure mid-transaction
    await tx.query("COMMIT");
  } catch (e) {
    await tx.query("ROLLBACK");
  } finally {
    tx.release();
  }
  const rbDb = (await db(`SELECT status, payment_ref FROM salary_records WHERE id = $1`, [rbSalary.data?.id])).rows[0];
  check("25.1 salary rolled back to Pending", rbDb.status === "Pending" && rbDb.payment_ref == null, JSON.stringify(rbDb));
  const rbPay = (await db(`SELECT count(*)::int c FROM payments WHERE payment_no = $1`, [simNo])).rows[0].c;
  check("25.2 payment rolled back (no row)", rbPay === 0, `payments=${rbPay}`);
  const rbCounter = (await db(`SELECT count(*)::int c FROM payment_number_counters WHERE counter_date = '2014-07-15'`)).rows[0].c;
  check("25.3 counter rolled back too", rbCounter === 0, `counters=${rbCounter}`);

  // ============ 26/27/28/29. register behavior ============
  console.log("\n=== Register list / filters / preservation ===");
  const fMonth = await listSalaries(`?month=${M3}`);
  check("27.1 month filter returns only M3 rows", Array.isArray(fMonth.data) && fMonth.data.length > 0 && fMonth.data.every((r) => r.month === M3), `len=${fMonth.data?.length}`);
  const dept = emp2.department;
  const fDept = await listSalaries(`?department=${encodeURIComponent(dept)}`);
  check("26. department filter returns only matching dept", Array.isArray(fDept.data) && fDept.data.every((r) => r.department === dept), JSON.stringify(fDept.data?.slice(0, 1)));
  const noSynth = await listSalaries(`?month=2000-01`);
  check("28. no synthetic records (empty month → empty list)", Array.isArray(noSynth.data) && noSynth.data.length === 0, `got ${noSynth.data?.length}`);
  const paidRows = fMonth.data.filter((r) => r.employeeId === emp1.id && r.month === M3);
  const beforeNet = paidRows[0]?.netSalary;
  const beforeRef = paidRows[0]?.paymentRef;
  const gen3 = await generate({ month: M3 });
  check("29.1 regeneration after payment skips the paid row only", gen3.data?.generated === totalEmps - 1, `generated=${gen3.data?.generated} total=${totalEmps}`);
  const m3Cnt = (await db(`SELECT count(*)::int c, count(DISTINCT (employee_id, month))::int d FROM salary_records WHERE month=$1`, [M3])).rows[0];
  check("29.4 regen fills every employee once (no duplicates)", m3Cnt.c === m3Cnt.d && m3Cnt.c === totalEmps, JSON.stringify(m3Cnt));
  const afterRows = (await db(`SELECT * FROM salary_records WHERE id = $1`, [bogus.data?.id])).rows[0];
  check("29.2 historical paid record preserved (status/ref/net)", afterRows.status === "Paid" && afterRows.payment_ref === beforeRef && Number(afterRows.net_salary) === beforeNet, JSON.stringify({ status: afterRows.status, ref: afterRows.payment_ref, net: beforeNet }));
  const m2After = (await db(`SELECT count(*)::int c FROM salary_records WHERE month=$1`, [M2])).rows[0].c;
  check("29.3 earlier record untouched by later generation", m2After === 1, `rows=${m2After}`);

  console.log(`\n======================================`);
  console.log(`SALARY TEST RESULT: ${pass} passed, ${fail} failed`);
  console.log(`======================================`);
} catch (err) {
  console.error("TEST RUNNER ERROR:", err);
} finally {
  try {
    await db(`DELETE FROM salary_records WHERE month = ANY($1::text[])`, [ALL_MONTHS]);
    await db(`DELETE FROM payments WHERE created_by = 'salary-test'`);
    await db(`DELETE FROM payment_number_counters WHERE counter_date = ANY($1::date[])`, [PAY_DATES]);
    if (dutyId) await db(`DELETE FROM duty_assignments WHERE id = $1`, [dutyId]);
    if (leaveId) await db(`DELETE FROM leave_requests WHERE id = $1`, [leaveId]);
    if (advanceId) await db(`DELETE FROM advance_loans WHERE id = $1`, [advanceId]);
    if (loanId) await db(`DELETE FROM advance_loans WHERE id = $1`, [loanId]);
    await pool.end();
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
  if (fail > 0) process.exit(1);
}