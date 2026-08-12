import { tripsService } from "./src/services/tripsService.js";
import { pool } from "./src/config/db.js";

const tripRows = await pool.query(
  `SELECT id FROM trips WHERE trip_date = CURRENT_DATE ORDER BY id DESC LIMIT 1`
);
const targetId = Number(tripRows.rows[0]?.id ?? 72);

const payload = {
  tripDate: "2026-08-12",
  tripNo: "TR-20260812-001",
  status: "Draft",
  startTime: new Date().toLocaleString(),
  vehicleId: 3,
  vehicleNo: "AP16AC5678",
  driverId: 6,
  driverName: "Rahim",
  supervisorId: 2,
  supervisorName: "Suresh Reddy Bandi",
  openingMeter: 1100,
  advanceAmount: 600,
  helpers: ["Kareem"],
  loaders: ["Saleem"],
  remarks: "",
  startStepSubmitted: true,
  mode: "submit",
};

try {
  const result = await tripsService.submitStep(targetId, "start", payload);
  console.log("SUBMIT OK id:", result.id, "tripNo:", result.tripNo, "openingMeter:", result.openingMeter);
} catch (e) {
  console.log("FAILED:");
  console.log("  status:", e.status, "| code:", e.code, "| constraint:", e.constraint);
  console.log("  message:", e.message);
  console.log("  details:", JSON.stringify(e.details ?? null));
  console.log("  bare:", e.detail ?? e.details?.detail ?? "(none)");
}
await pool.end();
process.exit(0);