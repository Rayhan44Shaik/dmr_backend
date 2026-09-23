// FE-cert seed + cert-user setup (real PG). Creates an OWNER login and a
// completed trip with trip-synced fuel plus a manual fuel bill, all FECERT-.
// Run: node -r ./tests/helpers/osUserInfoShim.cjs --import tsx fuel-cert-fe-setup.ts
import { randomUUID } from "node:crypto";

const { pool } = await import("./src/config/db.js");
const { hashPassword } = await import("./src/utils/passwordHash.js");
const { mastersService } = await import("./src/services/mastersService.js");
const { tripsService } = await import("./src/services/tripsService.js");
const { fuelExpensesService } = await import("./src/services/fuelExpensesService.js");

const TS = Date.now().toString().slice(-6);
const username = `fecert-owner-${TS}`;
const password = `FeCert-${TS}-pw!`;
await pool.query(
  `INSERT INTO application_users (username, display_name, password_hash, role) VALUES ($1, 'FE Cert', $2, 'OWNER')`,
  [username, await hashPassword(password)]
);

const v: any = await mastersService.upsertVehicle({
  vehicleNumber: `FV-${TS}-FE`,
  vehicleType: "Lorry",
  noOfBoxes: 40,
  birdCapacity: 2000,
  capacityKg: 3000,
  engineNumber: `EN-${TS}-FE`,
  chassisNumber: `CH-${TS}-FE`,
  status: "Active",
});
const vehicleId = Number(v.id);
const tripNo = `FECERT-${TS}-001`;
const tr = await pool.query(
  `INSERT INTO trips (trip_no, trip_date, vehicle_id, vehicle_no, opening_meter, closing_meter,
      status, start_step_submitted, farm_step_submitted, pickup_step_submitted,
      delivery_step_submitted, expenses_step_submitted,
      start_step_submitted_at, expenses_step_submitted_at)
   VALUES ($1, CURRENT_DATE - 1::int, $2, $3, $4::numeric, $4::numeric + 500,
      'Pending', TRUE, TRUE, TRUE, TRUE, TRUE,
      NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
   RETURNING id`,
  [tripNo, vehicleId, `FVV-${tripNo}`, 80000]
);
const tripId = Number(tr.rows[0].id);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMG = `data:image/png;base64,${PNG.toString("base64")}${"F".repeat(80)}`;
await (tripsService as any).upsertDieselEntry(tripId, {
  litres: 10, rate: 90, meter: 80100, bunkName: "FE Bunk",
  gpsLat: 12.98, gpsLon: 77.6, imageData: `${IMG}-fe1`,
  rowIndex: 1, clientKey: randomUUID(),
});
await (tripsService as any).updateStatus(tripId, { status: "Completed", approvedBy: "fe-cert" });
const bill = await pool.query(
  `SELECT bill_no FROM fuel_expenses WHERE trip_id = $1 AND trip_fuel_entry_index = 1 AND source_type = 'TRIP' AND COALESCE(deleted,FALSE)=FALSE`,
  [tripId]
);
const date = await pool.query(`SELECT CURRENT_DATE::text d`).then((r) => String(r.rows[0].d));
const mf: any = await fuelExpensesService.create({
  billDate: date, vehicleId, currentMeter: 80600, litres: 20, fuelRate: 95, pumpName: `FEPump-${TS}`,
});
console.log(JSON.stringify({ username, password, vehicleId, tripId, tripBill: String(bill.rows[0].bill_no), manualId: String(mf.id) }));
await pool.end();
