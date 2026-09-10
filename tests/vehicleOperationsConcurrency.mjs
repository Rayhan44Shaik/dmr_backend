import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const db = (sql, params = []) => pool.query(sql, params);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]);
let vehicleId;
let maintenanceId;
let emiId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function json(method, path, body) {
  const response = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

async function maintenance(key) {
  const form = new FormData();
  form.append("date", today);
  form.append("vehicleId", String(vehicleId));
  form.append("currentKM", "1000");
  form.append("maintenanceType", JSON.stringify(["Routine Service"]));
  form.append("serviceType", "Routine Service");
  form.append("parts", JSON.stringify([{ name: "Oil", quantity: 1, rate: 100, amount: 100 }]));
  form.append("idempotencyKey", key);
  form.append("documents", new Blob([png], { type: "image/png" }), "bill.png");
  const response = await fetch(`${API}/fleet/maintenance`, { method: "POST", body: form });
  return { status: response.status, body: await response.json() };
}

try {
  const suffix = Date.now().toString().slice(-8);
  const max = Number((await db("SELECT COALESCE(MAX(vehicle_no), 0) n FROM vehicles")).rows[0].n);
  vehicleId = (await db(
    `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status, no_of_boxes, bird_capacity, capacity_kg, emi_day)
     VALUES ($1,$2,'Truck','Active',85,1000,5000,15) RETURNING id`,
    [max + 1, `CONC-${suffix}`]
  )).rows[0].id;

  const maintenanceKey = crypto.randomUUID();
  const creates = await Promise.all(Array.from({ length: 20 }, () => maintenance(maintenanceKey)));
  if (!creates.every((result) => result.status === 201)) {
    console.log(creates.map((result) => ({ status: result.status, body: result.body })));
  }
  assert(creates.every((result) => result.status === 201), "20 concurrent maintenance retries return success");
  maintenanceId = creates[0].body.id;
  assert(creates.every((result) => result.body.id === maintenanceId), "maintenance retries return one logical record");
  const maintenanceCount = Number((await db("SELECT COUNT(*) n FROM fleet_maintenance WHERE request_id=$1", [maintenanceKey])).rows[0].n);
  assert(maintenanceCount === 1, "database contains exactly one maintenance record for the retry key");
  const documentCount = Number((await db("SELECT COUNT(*) n FROM fleet_maintenance_documents WHERE maintenance_id=$1", [maintenanceId])).rows[0].n);
  assert(documentCount === 1, "idempotent maintenance retry does not duplicate documents");

  const created = await json("POST", "/fleet/emis", { vehicleId, financeCompany: "Concurrency Bank", loanAmount: 1200, totalEMIs: 12, startDate: today });
  assert(created.status === 201, "EMI fixture created");
  emiId = created.body.id;
  const paymentKey = crypto.randomUUID();
  const payments = await Promise.all(Array.from({ length: 20 }, () => json("POST", `/fleet/emis/${emiId}/pay`, { idempotencyKey: paymentKey })));
  assert(payments.every((result) => result.status === 200), "20 concurrent EMI payment retries return success");
  const paid = Number((await db("SELECT COUNT(*) n FROM vehicle_emi_installments WHERE vehicle_emi_id=$1 AND status='paid'", [emiId])).rows[0].n);
  assert(paid === 1, "concurrent payment retries pay exactly one installment");
  const keys = Number((await db("SELECT COUNT(*) n FROM vehicle_emi_payment_requests WHERE vehicle_emi_id=$1", [emiId])).rows[0].n);
  assert(keys === 1, "concurrent payment retries persist exactly one request identity");
} finally {
  if (vehicleId) await db("DELETE FROM vehicles WHERE id=$1", [vehicleId]);
  await pool.end();
}
