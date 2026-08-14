import { pool } from "./src/config/db.js";
import { rateEntryService } from "./src/services/rateEntryService.js";

const trip = await pool.query(`SELECT id, trip_no, status, deleted FROM trips WHERE trip_no = 'TR-20260811-003'`);
console.log("trip row:", trip.rows);

const list = await rateEntryService.list({});
console.log("rate-entry list count:", list.length);
console.log("contains TR-20260811-003?", list.some((t) => t.tripNo === "TR-20260811-003"));
console.log(JSON.stringify(list.find((t) => t.tripNo === "TR-20260811-003"), null, 2));

await pool.end();
