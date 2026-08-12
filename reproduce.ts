import { pool } from "./src/config/db.js";
import { tripsService } from "./src/services/tripsService.js";

async function main() {
  // 1. Prove the '' duplicate fires 23505 on trips_trip_no_key
  try {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1, $2, 'Draft')`,
      ["", "2026-08-11"]
    );
    await c.query("ROLLBACK");
    console.log("NOTE: blank trip_no inserted (unexpected)");
    c.release();
  } catch (e: any) {
    console.log("Reproduce 23505 broadcast:", e.code, "|", e.message);
    if (e.code === "23505") console.log("  constraint:", e.constraint);
  }

  // 2. Simulate a real Step-1 create inside a transaction, then ROLLBACK.
  const payload = {
    tripDate: "2026-08-11",
    tripNo: "",
    status: "Draft",
    vehicleId: 2,
    vehicleNo: "AP16AB1234",
    driverId: 6,
    driverName: "Rahim",
    supervisorId: 7,
    supervisorName: "Ruhulla",
    openingMeter: 0,
    advanceAmount: 0,
    helpers: ["Anil"],
    loaders: ["Babu"],
    startStepSubmitted: true,
  };
  try {
    const saved = await tripsService.save(null, payload);
    console.log("save(null) generated trip_no:", JSON.stringify(saved?.tripNo));
  } catch (e: any) {
    console.log("save(null) error:", e.code, "|", e.message, "|", e.constraint);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });