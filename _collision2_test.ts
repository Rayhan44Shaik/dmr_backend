import pg from "pg";
import { tripsService } from "./src/services/tripsService.js";
import { pool } from "./src/config/db.js";

// Resource set X: vehicle 3 / Rahim / Suresh / Kareem / Saleem
const setX = {
  tripDate: "2026-08-12",
  status: "Draft",
  startStepSubmitted: true,
  startTime: new Date().toISOString(),
  vehicleId: 3, vehicleNo: "AP16AC5678",
  driverId: 6, driverName: "Rahim",
  supervisorId: 2, supervisorName: "Suresh Reddy Bandi",
  openingMeter: 1000, advanceAmount: 500,
  helpers: ["Kareem"], loaders: ["Saleem"],
  remarks: "",
};

// Resource set Y: DIFFERENT vehicle — vehicle 1 / Ruhulla / ... (does not conflict with X)
const setY = {
  tripDate: "2026-08-12",
  status: "Draft",
  startStepSubmitted: true,
  startTime: new Date().toISOString(),
  vehicleId: 1, vehicleNo: "AP 39 AB 1234",
  driverId: 7, driverName: "Ruhulla",
  supervisorId: 6, supervisorName: "Rahim",
  openingMeter: 2000, advanceAmount: 300,
  helpers: ["Anil"], loaders: ["Babu"],
  remarks: "",
};

// 1) Create trip with set X -> gets a fresh number (TR-20260812-00X)
const t1 = await tripsService.save(null, { ...setX, tripNo: "" });
console.log("T1 created:", t1.id, t1.tripNo, "(occupies set X)");

// 2) Create with set Y (different vehicle — resource check passes) but RE-SEND
//    T1's tripNo => pure trip_no unique violation => 23505 => "Duplicate record"
try {
  const t2 = await tripsService.save(null, { ...setY, tripNo: t1.tripNo });
  console.log("T2 UNEXPECTEDLY created:", t2.id, t2.tripNo);
  await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [t2.id]);
  await pool.query(`DELETE FROM trips WHERE id=$1`, [t2.id]);
} catch (e) {
  console.log("T2 (same tripNo, different vehicle) FAILED:");
  console.log("  status:", e.status, "code:", e.code, "constraint:", e.constraint);
  console.log("  HTTP message faced by the UI:", JSON.stringify(e.message));
}

await pool.query(`DELETE FROM trip_crew WHERE trip_id=$1`, [t1.id]);
await pool.query(`DELETE FROM trips WHERE id=$1`, [t1.id]);
console.log("cleaned up");
await pool.end();
process.exit(0);