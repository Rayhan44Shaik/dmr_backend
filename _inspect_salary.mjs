import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries", connectionTimeoutMillis: 5000 });
const c = await p.connect();
try {
  const cols = await c.query(
    "SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_name='salary_records' ORDER BY ordinal_position"
  );
  console.log("COLUMNS");
  for (const x of cols.rows) console.log(`  ${x.column_name}:${x.data_type}:null=${x.is_nullable}:def=${x.column_default || ""}`);
  const s = await c.query(
    "SELECT count(*)::int c, count(*) FILTER (WHERE status='Paid')::int paid, count(*) FILTER (WHERE payment_date IS NOT NULL)::int have_pdate FROM salary_records"
  );
  console.log("SAL", JSON.stringify(s.rows[0]));
  const n = await c.query(
    "SELECT count(*)::int c FROM salary_records WHERE basic_salary<0 OR overtime<0 OR incentives<0 OR fuel_allowance<0 OR night_allowance<0 OR leave_deduction<0 OR advance_recovery<0 OR loan_emi<0 OR late_penalty<0 OR other_deductions<0 OR net_salary<0 OR total_gross<0 OR total_deductions<0"
  );
  console.log("neg money rows:", n.rows[0].c);
  const e = await c.query("SELECT count(*)::int c FROM employees");
  console.log("employees:", e.rows[0].c);
  const emp = await c.query("SELECT id, employee_no, employee_name, department, role, status FROM employees ORDER BY id LIMIT 30");
  console.log("EMPLOYEES");
  for (const x of emp.rows) console.log(`  ${x.id} | ${x.employee_no} | ${x.employee_name} | ${x.department} | ${x.role} | ${x.status}`);
  const adv = await c.query("SELECT count(*)::int c FROM advance_loans WHERE status='Active'");
  console.log("active advances:", adv.rows[0].c);
  const lv = await c.query("SELECT count(*)::int c FROM leave_requests WHERE status='Approved'");
  console.log("approved leaves:", lv.rows[0].c);
} finally {
  c.release();
  await p.end();
}