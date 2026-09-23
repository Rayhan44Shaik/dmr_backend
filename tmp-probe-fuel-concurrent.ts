import { randomUUID } from "node:crypto";
import { applySchema, startTestDb } from "./tests/helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("./src/config/db.js");
const { mastersService } = await import("./src/services/mastersService.js");
const { tripsService } = await import("./src/services/tripsService.js");

const t = Date.now().toString().slice(-6);
const v: any = await mastersService.upsertVehicle({
  vehicleNumber: `FP-${t}`,
  vehicleType: "Lorry",
  noOfBoxes: 40,
  birdCapacity: 2000,
  capacityKg: 3000,
  engineNumber: `EN-${t}`,
  chassisNumber: `CH-${t}`,
  status: "Active",
});
const tripNo = `TRP-P1-${t}`;
const tr = await pool.query(
  `INSERT INTO trips (trip_no, trip_date, vehicle_id, vehicle_no, opening_meter, closing_meter,
      status, start_step_submitted, farm_step_submitted, pickup_step_submitted,
      delivery_step_submitted, expenses_step_submitted,
      start_step_submitted_at, expenses_step_submitted_at)
   VALUES ($1, CURRENT_DATE, $2, $3, $4::numeric, $4::numeric + 500,
      'Pending', TRUE, TRUE, TRUE, TRUE, TRUE,
      NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
   RETURNING id`,
  [tripNo, Number(v.id), `FPV-${tripNo}`, 90000]
);
const tripId = Number(tr.rows[0].id);
const IMG = `data:image/png;base64,${"C".repeat(80)}`;

const results = await Promise.all(
  [1, 2, 3, 4, 5].map((i) =>
    (tripsService as any).upsertDieselEntry(tripId, {
      litres: 10,
      rate: 90,
      meter: 90000 + i * 10,
      bunkName: "Probe Bunk",
      gpsLat: 12.98,
      gpsLon: 77.6,
      imageData: `${IMG}-r${i}`,
      rowIndex: i,
      clientKey: randomUUID(),
    }).then(() => ({ ok: true as const, i }), (e: any) => ({ ok: false as const, i, msg: String(e?.message) }))
  )
);
console.log("RESULTS", JSON.stringify(results));
const counter = await pool.query(`SELECT * FROM trip_fuel_bill_counters WHERE trip_id = $1`, [tripId]);
console.log("COUNTER", JSON.stringify(counter.rows));
const fuel = await pool.query(
  `SELECT trip_fuel_entry_index, bill_no FROM fuel_expenses WHERE trip_id = $1 ORDER BY trip_fuel_entry_index`,
  [tripId]
);
console.log("FUEL", JSON.stringify(fuel.rows));
await pool.end();
await testDb.close();
