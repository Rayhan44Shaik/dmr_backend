import { config } from 'dotenv';
config();
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`
  SELECT id, trip_no, trip_date, status, source_farm, supervisor_name,
         total_birds, farm_bird_count, dc_weight, farm_load_weight,
         total_birds_delivered, total_delivered_weight,
         total_mortality_count, total_mortality_weight, total_mortality,
         weight_loss, survival_rate, total_shops
  FROM trips ORDER BY trip_date DESC, id DESC LIMIT 10
`);
console.log(JSON.stringify(r.rows, null, 2));
// distinct farms/supervisors among completed
const f = await pool.query(`SELECT DISTINCT source_farm, supervisor_name FROM trips WHERE status='Completed' AND deleted=FALSE`);
console.log('--- completed farms/supervisors ---');
console.log(JSON.stringify(f.rows));
await pool.end();
