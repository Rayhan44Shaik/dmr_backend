import { config } from 'dotenv';
config();
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = `
SELECT COUNT(*) AS trips,
  SUM(total_birds) AS farm_birds,
  SUM(CASE WHEN farm_load_weight > 0 THEN farm_load_weight ELSE dc_weight END) AS farm_weight,
  SUM(total_shops) AS shops,
  SUM(total_birds_delivered) AS delivered_birds,
  SUM(total_delivered_weight) AS delivered_weight,
  SUM(total_mortality_count) AS mort,
  SUM(total_mortality_weight) AS mort_wt,
  SUM(weight_loss) AS loss
FROM trips WHERE status='Completed' AND deleted=FALSE`;
const r = await pool.query(q);
console.log('AGG:', JSON.stringify(r.rows[0], null, 2));
const rows = await pool.query(`SELECT id,trip_no,trip_date,status,total_birds,dc_weight,total_shops,total_birds_delivered,total_delivered_weight,total_mortality_count,total_mortality_weight,weight_loss,survival_rate FROM trips WHERE status='Completed' AND deleted=FALSE ORDER BY trip_date DESC, id DESC`);
console.log('ROWS:', JSON.stringify(rows.rows));
// date filter sanity: local date text
const d = await pool.query(`SELECT id, trip_no, trip_date, trip_date::text AS as_text FROM trips ORDER BY id`);
console.log('DATES:', JSON.stringify(d.rows.map(x=>({id:x.id,no:x.trip_no,txt:x.as_text}))));
await pool.end();
