import pg from "pg";
import { tripsService } from "./src/services/tripsService.js";
import { pool } from "./src/config/db.js";

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

// 1) Create trip #1 (fresh number)
const t1 = await tripsService.save(null, { ...base, tripNo: "" });
console.log("first create OK ->", t1.id, t1.tripNo);

// 2) Attempt create re-sending THE SAME tripNo (exactly what a stale/new frontend
//    state with a reused tripNo would send) while trip #1 exists and is active.
try {
  const t2 = await tripsService.save(null, { ...base, tripNo: t1.tripNo });
  console.log("SECOND create with same tripNo UNEXPECTEDLY OK ->", t2.id, t2.tripNo);
  await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [t2.id]);
  await pool.query(`DELETE FROM trips WHERE id=$1`, [t2.id]);
} catch (e) {
  console.log("SECOND create with same tripNo FAILED:");
  console.log("  status:", e.status, "code:", e.code, "constraint:", e.constraint);
  console.log("  message:", e.message);
}

await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [t1.id]);
await pool.query(`DELETE FROM trips WHERE id=$1`, [t1.id]);
console.log("cleaned up");
await pool.end();
process.exit(0);