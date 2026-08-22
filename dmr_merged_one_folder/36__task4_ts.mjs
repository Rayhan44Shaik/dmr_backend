// TASK 4 — focused timestamp test: does Step 5 store the client's submittedAt
// exactly (ms precision) and keep it immutable on retry? Reads DB directly with
// node-postgres (full timestamptz precision) to avoid API isoOrNull truncation.
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
const createdTripIds = [], createdEmpIds = [], createdVehIds = [];

const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
const eMax = (await db(`SELECT COALESCE(MAX(employee_no),0)::int m FROM employees`)).rows[0].m;
let vehCounter = 0, empCounter = 0;
async function mkVehicle(tag) {
  const r = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES ($1,$2,'Truck','Active') RETURNING id`,
    [vMax + (++vehCounter), `T4TS-VH-${tag}-${stamp}`]);
  createdVehIds.push(r.rows[0].id);
  return { id: r.rows[0].id, no: `T4TS-VH-${tag}-${stamp}` };
}
async function mkEmp(name, dept) {
  const r = await db(`INSERT INTO employees (employee_no, employee_name, department, role, phone_number, email, status)
                      VALUES ($1,$2,$3,$3,$4,$5,'Active') RETURNING id`,
    [eMax + (++empCounter), name, dept, `9199${String(stamp)}${Math.floor(1000 + Math.random() * 9000)}`, `${name.toLowerCase().replace(/\W+/g, "")}@fix.local`]);
  createdEmpIds.push(r.rows[0].id);
  return r.rows[0].id;
}

try {
  const v = await mkVehicle("T");
  const dN = `T4TSDrv${stamp}`, sN = `T4TSSup${stamp}`, hN = `T4TSHlp${stamp}`, lN = `T4TSLod${stamp}`;
  const d = await mkEmp(dN, "Driver"), s = await mkEmp(sN, "Supervisor");
  await mkEmp(hN, "Helper"); await mkEmp(lN, "Loader");

  const start = {
    tripDate: SNAP_DATE, tripNo: "", status: "Draft", startTime: new Date().toISOString(),
    vehicleId: v.id, vehicleNo: v.no, driverId: d, driverName: dN,
    supervisorId: s, supervisorName: sN, openingMeter: 1000, advanceAmount: 500,
    helpers: [hN], loaders: [lN], remarks: `t4ts-${stamp}`, startStepSubmitted: true,
  };
  const c = await api("POST", "/trips/steps/start", start);
  const tripId = c.data.id; createdTripIds.push(tripId);

  await api("POST", `/trips/${tripId}/steps/farm`, { sourceFarmId: 1, destMeter: 1500, mode: "submit" });
  await api("POST", `/trips/${tripId}/steps/pickup`, { dcWeight: 4000, totalBirds: 3000, boxes: 50, boxDetails: [{ boxNo: 1, birds: 300, weight: 500 }], dcPhotoKey: `t4ts-${stamp}` , mode: "submit"});
  await api("POST", `/trips/${tripId}/steps/deliveries`, { deliveries: [{ shopId: 1, birds: 1000, weight: 1500, rate: 100, amount: 150000, remarks: "t4ts" }], mode: "submit" });

  // First submit with a distinctive ms-precision timestamp
  const SUB_A = "2026-08-13T06:00:00.500Z";
  const s5 = await api("POST", `/trips/${tripId}/steps/expenses`, {
    closingMeter: 2500, endMeter: 2500, endTime: new Date().toISOString(),
    submittedAt: SUB_A, mode: "submit",
  });
  check("TS first Step 5 submit 200", s5.status === 200, `got ${s5.status}`);
  check("TS trip -> Pending", s5.data?.status === "Pending", `got ${s5.data?.status}`);

  const r1 = await db(`SELECT submitted_at, expenses_step_submitted_at FROM trips WHERE id=$1`, [tripId]);
  const dbSubA = new Date(r1.rows[0].submitted_at).toISOString();
  const dbExpA = new Date(r1.rows[0].expenses_step_submitted_at).toISOString();
  console.log(`  db submitted_at after first submit: ${dbSubA}`);
  check("TS client submittedAt stored EXACTLY (ms preserved)", dbSubA === SUB_A, `db=${dbSubA} client=${SUB_A}`);
  check("TS expenses_step_submitted_at set on first submit", r1.rows[0].expenses_step_submitted_at != null);

  // Retry/edit Step 5 with a DIFFERENT timestamp — must NOT overwrite
  const SUB_B = "2026-08-13T07:30:45.750Z";
  const s6 = await api("POST", `/trips/${tripId}/steps/expenses`, {
    closingMeter: 2600, endMeter: 2600, endTime: new Date().toISOString(),
    submittedAt: SUB_B, mode: "submit",
  });
  check("TS retry Step 5 200", s6.status === 200, `got ${s6.status}`);
  const r2 = await db(`SELECT submitted_at, expenses_step_submitted_at FROM trips WHERE id=$1`, [tripId]);
  const dbSubAfter = new Date(r2.rows[0].submitted_at).toISOString();
  const dbExpAfter = new Date(r2.rows[0].expenses_step_submitted_at).toISOString();
  check("TS submitted_at IMMUTABLE on retry (exact ms)", dbSubAfter === SUB_A, `db=${dbSubAfter} first=${SUB_A}`);
  check("TS expenses_step_submitted_at IMMUTABLE on retry", dbExpAfter === dbExpA, `first=${dbExpA} now=${dbExpAfter}`);
} finally {
  const ids = [...new Set(createdTripIds)].filter(Boolean);
  const vehs = [...new Set(createdVehIds)].filter(Boolean);
  const emps = [...new Set(createdEmpIds)].filter(Boolean);
  if (ids.length) {
    await db(`DELETE FROM trip_crew WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_boxes WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_media WHERE trip_id = ANY($1)`, [ids]);
    await db(`DELETE FROM trip_diesel_entries WHERE trip_id = ANY($1)`, [ids]);
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
  console.log("\ncleanup done");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
await pool.end();
process.exit(fail ? 1 : 0);