import { pool } from "./src/config/db.js";
async function main() {
  const r = await pool.query(`SELECT id, trip_no, trip_date, status, deleted FROM trips ORDER BY id`);
  console.table(r.rows);
  await pool.end();
}
main().catch((e)=>{console.error(e);process.exit(1);});