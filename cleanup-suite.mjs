import pg from "pg";
const p = new pg.Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
(async () => {
  const ids = (await p.query("SELECT id FROM trips WHERE trip_date='2026-08-12'")).rows.map((r) => r.id);
  console.log("test trips to remove on 08-12:", ids);
  if (ids.length) {
    await p.query("DELETE FROM trip_crew WHERE trip_id=ANY($1)", [ids]);
    await p.query("DELETE FROM trip_boxes WHERE trip_id=ANY($1)", [ids]);
    await p.query("DELETE FROM trip_media WHERE trip_id=ANY($1)", [ids]);
    await p.query("DELETE FROM trip_diesel_entries WHERE trip_id=ANY($1)", [ids]);
    await p.query("UPDATE fuel_expenses SET trip_id=NULL WHERE trip_id=ANY($1)", [ids]);
    await p.query("DELETE FROM trip_deliveries WHERE trip_id=ANY($1)", [ids]);
    const tr = await p.query("DELETE FROM trips WHERE id=ANY($1)", [ids]);
    console.log("removed trips:", tr.rowCount);
  }
  const emp = await p.query("DELETE FROM employees WHERE employee_name ILIKE '%TripTest%'");
  const veh = await p.query("DELETE FROM vehicles WHERE vehicle_number ILIKE '%TEST%'");
  console.log("removed employees:", emp.rowCount, "vehicles:", veh.rowCount);
  await p.end();
})().catch((e) => { console.error(e.message); process.exit(1); });