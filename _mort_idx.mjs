import { config } from 'dotenv';
config();
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='trips' ORDER BY indexname`);
console.log(r.rows.map(x=>x.indexdef).join('\n'));
await pool.end();
