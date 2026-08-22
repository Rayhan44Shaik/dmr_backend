const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
(async () => {
  try {
    const r = await pool.query("SELECT count(*)::int AS trips, count(*) FILTER (WHERE status='Completed' AND deleted=FALSE) AS completed FROM trips");
    console.log('trips', JSON.stringify(r.rows[0]));
    const f = await pool.query("SELECT count(*)::int AS n, sum(litres) AS l, sum(amount) AS a, count(*) FILTER (WHERE source_type='TRIP') AS trip_src, count(*) FILTER (WHERE source_type='MANUAL') AS manual_src, count(*) FILTER (WHERE ops_status='Rejected') AS rejected, count(*) FILTER (WHERE ops_status='Approved') AS approved FROM fuel_expenses WHERE COALESCE(deleted,FALSE)=FALSE");
    console.log('fuel', JSON.stringify(f.rows[0]));
    const m = await pool.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE status='Approved' AND deleted=FALSE) AS approved, count(*) FILTER (WHERE status='Pending Approval' AND deleted=FALSE) AS pending FROM fleet_maintenance");
    console.log('maint', JSON.stringify(m.rows[0]));
    const v = await pool.query("SELECT count(*)::int AS n FROM vehicles");
    console.log('vehicles', JSON.stringify(v.rows[0]));
    const t126 = await pool.query("SELECT id, trip_no, trip_date, status, opening_meter, closing_meter, end_meter, total_km, vehicle_id, vehicle_no FROM trips WHERE id IN (52,126)");
    console.log('trip52/126', JSON.stringify(t126.rows));
    const weeks = await pool.query(`SELECT EXTRACT(DOY FROM trip_date)::int AS doy, EXTRACT(WEEK FROM trip_date)::int AS iso_week, trip_date FROM trips WHERE status='Completed' AND deleted=FALSE ORDER BY trip_date LIMIT 3`);
    console.log('sample weeks', JSON.stringify(weeks.rows));
    await pool.end();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
