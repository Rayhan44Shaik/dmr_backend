import pg from "pg";
const API = "http://localhost:4000/api";
const pool = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
const db = (sql, params = []) => pool.query(sql, params);
const PNG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,0xde]);
const stamp = Date.now().toString().slice(-6);
(async () => {
  const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
  const veh = await db(`INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status) VALUES ($1,$2,'Truck','Active') RETURNING id`, [vMax + 1, `RACE-${stamp}`]);
  const vehId = veh.rows[0].id;
  const post = async () => {
    const form = new FormData();
    form.append("date", "2026-08-13");
    form.append("vehicleId", String(vehId));
    form.append("currentKM", "12345");
    form.append("maintenanceType", JSON.stringify(["Engine Oil Change"]));
    form.append("serviceType", "Oil Change");
    form.append("parts", JSON.stringify([{ name: "Oil", quantity: 1, rate: 100 }]));
    form.append("createdBy", "race-test");
    form.append("documents", new Blob([PNG], { type: "image/png" }), "b.png");
    const res = await fetch(API + "/fleet/maintenance", { method: "POST", body: form });
    return { status: res.status, data: await res.json() };
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => post()));
  const created = results.filter(r => r.status === 201);
  const nos = created.map(r => r.data.billNo);
  console.log("created:", created.length, "/ 8");
  console.log("numbers:", JSON.stringify(nos));
  console.log("distinct:", new Set(nos).size === created.length);
  const allBad = results.filter(r => r.status >= 400);
  console.log("non-201:", allBad.map(r => `${r.status} ${JSON.stringify(r.data?.error)}`));
  // cleanup
  const ids = created.map(r => r.data.id);
  if (ids.length) {
    await db(`DELETE FROM fleet_maintenance_documents WHERE maintenance_id = ANY($1::int[])`, [ids]);
    await db(`DELETE FROM fleet_maintenance WHERE id = ANY($1::int[])`, [ids]);
  }
  await db(`DELETE FROM vehicles WHERE id = $1`, [vehId]);
  await pool.end();
  if (created.length !== 8 || new Set(nos).size !== created.length) process.exit(1);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
