// Race stress: 5 CONCURRENT new Step-1 creates, same date, fully disjoint
// resources -> every create must succeed with a DISTINCT server-generated
// tripNo. Any advisory-lock flaw here would surface as 23505 -> "Duplicate record".
import pg from "pg";
const API = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const db = (sql, p = []) => pool.query(sql, p);
async function api(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

let pass = 0, fail = 0;
const check = (n, c, e = "") => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  ${e}`));
const stamp = Date.now().toString().slice(-5);
const created = [];
try {
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
  let vc = 0, ec = 0;
  const mkVeh = async (idx) => (await db(`INSERT INTO vehicles (vehicle_no,vehicle_number,vehicle_type,status) VALUES ($1,$2,'Truck','Active') RETURNING id`, [vMax + (++vc), `RACEV${idx}-${stamp}`])).rows[0].id;
  const mkEmp = async (n, d) => (await db(`INSERT INTO employees (employee_no,employee_name,department,role,phone_number,email,status) VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`, [eMax + (++ec), n, d, `91${stamp}${Math.floor(1000+Math.random()*9000)}`, `${n}@race.local`])).rows[0].id;

  const jobs = [];
  for (let i = 0; i < 5; i++) {
    jobs.push(async () => {
      const v = await mkVeh(i); const d = await mkEmp(`RD${i}${stamp}`, "Driver");
      const s = await mkEmp(`RS${i}${stamp}`, "Supervisor"); const h = await mkEmp(`RH${i}${stamp}`, "Helper"); const l = await mkEmp(`RL${i}${stamp}`, "Loader");
      const res = await api("/trips/steps/start", {
        tripDate: "2026-08-12", status: "Draft", tripNo: "", startTime: new Date().toISOString(),
        vehicleId: v, vehicleNo: `RACEV${i}-${stamp}`, driverId: d, driverName: `RD${i}${stamp}`,
        supervisorId: s, supervisorName: `RS${i}${stamp}`, openingMeter: 1000 + i, advanceAmount: 100,
        helpers: [`RH${i}${stamp}`], loaders: [`RL${i}${stamp}`], remarks: `race-${i}`,
      });
      if (res.status === 201) created.push(res.data.id);
      return res;
    });
  }
  const results = await Promise.all(jobs.map((f) => f()));
  results.forEach((r, i) => console.log(`  job${i} -> ${r.status} ${JSON.stringify(r.data?.error ?? r.data?.tripNo)}`));
  const ok = results.filter((r) => r.status === 201);
  const errors = results.filter((r) => r.status !== 201);
  check("ALL 5 concurrent creates succeed (201)", ok.length === 5, `ok=${ok.length}`);
  check("NO 'Duplicate record' anywhere", !errors.some((r) => String(r.data?.error ?? "").startsWith("Duplicate record")), JSON.stringify(errors.map((e) => e.data?.error)));
  const nos = ok.map((r) => String(r.data.tripNo));
  check("ALL numbers distinct", new Set(nos).size === 5, JSON.stringify(nos));
  check("ALL numbers well-formed", nos.every((n) => /^TR-\d{8}-\d{3}$/.test(n)));
  const dbRows = await db(`SELECT COUNT(*)::int c FROM trips WHERE id = ANY($1)`, [created]);
  check("exactly 5 rows in DB (one per request)", dbRows.rows[0].c === 5, `c=${dbRows.rows[0].c}`);
} finally {
  if (created.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id = ANY($1)`, [created]);
    await db(`DELETE FROM trips WHERE id = ANY($1)`, [created]);
  }
  const vehHits = (await db(`SELECT id FROM vehicles WHERE vehicle_number LIKE 'RACEV%'`)).rows.map((x) => x.id);
  if (vehHits.length) { await db(`DELETE FROM vehicles WHERE id = ANY($1)`, [vehHits]); }
  const empHits = (await db(`SELECT id FROM employees WHERE employee_name ~ '^R[DSHL][0-9]'`)).rows.map((x) => x.id);
  if (empHits.length) { await db(`DELETE FROM employees WHERE id = ANY($1)`, [empHits]); }
  console.log(`\ncleanup: ${created.length} race trips removed`);
}
console.log(`\nRACE RESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);