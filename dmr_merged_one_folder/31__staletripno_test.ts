import pg from "pg";
import { tripsService } from "./src/services/tripsService.js";
import { pool } from "./src/config/db.js";

// Cleanup leftovers created during THIS session's testing (all are test data).
const cleanupIds = [72, 73, 74];
for (const id of cleanupIds) {
  const row = await pool.query(`SELECT trip_no FROM trips WHERE id=$1`, [id]);
  if (row.rowCount === 0) continue;
  const tripNo = row.rows[0].trip_no;
  const isOurs = tripNo && tripNo.startsWith("TR-2026");
  if (!isOurs) continue;
  await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [id]);
  await pool.query(`DELETE FROM trip_boxes WHERE trip_id=$1`, [id]);
  await pool.query(`DELETE FROM trip_media WHERE trip_id=$1`, [id]);
  await pool.query(`UPDATE fuel_expenses SET trip_id=NULL WHERE trip_id=$1`, [id]);
  await pool.query(`DELETE FROM trips WHERE id=$1`, [id]);
  console.log(`cleaned test trip #${id} (${tripNo})`);
}

// Scenario A: create with a STALE, existing tripNo in the payload (= what a
// stale frontend trip object would send) -> expect 23505 -> HTTP 409 + "Duplicate record"
async function tryCreate(label, payload) {
  try {
    const saved = await tripsService.save(null, payload);
    console.log(`[${label}] OK id=${saved.id} tripNo=${JSON.stringify(saved.tripNo)} tripDate=${saved.tripDate}`);
    await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [saved.id]);
    await pool.query(`DELETE FROM trips WHERE id=$1`, [saved.id]);
    return true;
  } catch (e) {
    console.log(`[${label}] ERR status=${e.status} code=${e.code} constraint=${e.constraint}`);
    console.log(`        message=${e.message}`);
    return false;
  }
}

const base = {
  tripDate: "2026-08-12",
  status: "Draft",
  startStepSubmitted: true,
  startTime: new Date().toISOString(),
  vehicleId: 3,
  vehicleNo: "AP16AC5678",
  driverId: 6,
  driverName: "Rahim",
  supervisorId: 2,
  supervisorName: "Suresh Reddy Bandi",
  openingMeter: 1000,
  advanceAmount: 500,
  helpers: ["Kareem"],
  loaders: ["Saleem"],
  remarks: "",
};

console.log("A) payload with STALE tripNo already used by trip 72 (TR-20260812-001):");
await tryCreate("stale-tripNo", { ...base, tripNo: "TR-20260812-001" });

console.log("B) payload with tripNo undefined (frontend omits key):");
await tryCreate("no-tripNo", { ...base, tripNo: undefined });

console.log("C) payload with tripNo '' (normal new-trip):");
await tryCreate("empty-tripNo", { ...base, tripNo: "" });

await pool.end();
process.exit(0);