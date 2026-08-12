import { pool } from "./src/config/db.js";
import { tripsService } from "./src/services/tripsService.js";

async function main() {
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
    remarks: "",
    startStepSubmitted: true,
    startTime: new Date().toISOString(),
  };
  try {
    const saved = await tripsService.save(null, payload);
    console.log("SAVE OK trip_no:", saved?.tripNo, "id:", saved?.id);
  } catch (e: any) {
    console.log("save() failed ->", e?.message, "| status:", e?.status, "| code:", e?.code, "| constraint:", e?.constraint, "| details:", JSON.stringify(e?.details));
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });