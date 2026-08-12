import { pool } from "./src/config/db.js";

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // mimic generateTripNo for 2026-08-11
    const g = await c.query(
      `SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int),0)::text AS m
       FROM trips WHERE trip_date='2026-08-11' AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`
    );
    const seq = ("000" + (Number(g.rows[0].m) + 1)).slice(-3);
    const tripNo = `TR-20260811-${seq}`;
    console.log("generated tripNo:", tripNo);

    const ins = await c.query(
      `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,'2026-08-11','Draft') RETURNING id`,
      [tripNo]
    );
    const tripId = ins.rows[0].id;
    console.log("inserted trip id:", tripId, "trip_no:", tripNo);

    // mimic replaceCrew
    await c.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [tripId]);
    const helper = await c.query(
      `SELECT id FROM employees WHERE employee_name='Anil' AND status='Active' LIMIT 1`
    );
    const loader = await c.query(
      `SELECT id FROM employees WHERE employee_name='Babu' AND status='Active' LIMIT 1`
    );
    console.log("helpers found:", helper.rowCount, "loaders found:", loader.rowCount);

    await c.query(
      `INSERT INTO trip_crew (trip_id, employee_id, employee_name, role) VALUES ($1,$2,$3,'helper')`,
      [tripId, helper.rows[0]?.id ?? null, "Anil"]
    );
    await c.query(
      `INSERT INTO trip_crew (trip_id, employee_id, employee_name, role) VALUES ($1,$2,$3,'loader')`,
      [tripId, loader.rows[0]?.id ?? null, "Babu"]
    );
    console.log("crew inserted OK");

    // crew occupied check (bug3): who else uses these resources in active trips
    const occ = await c.query(
      `SELECT id, trip_no, status FROM trips
        WHERE deleted=FALSE AND status IN ('Draft','Pending')
        AND (vehicle_id IN (2,NULL) OR driver_id IN (6) OR supervisor_id IN (7) OR id IN (SELECT trip_id FROM trip_crew WHERE employee_name IN ('Anil','Babu')))`
    );
    console.table(occ.rows);

    await c.query("ROLLBACK");
    console.log("ROLLED BACK - no data changed");
  } catch (e: any) {
    await c.query("ROLLBACK");
    console.log("RAW SQL error:", e.code, "|", e.message, "| constraint:", e.constraint);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });