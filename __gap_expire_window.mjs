import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();
// Push the trip's edit-window anchor 11 days into the past -> window closed.
await client.query(
  `UPDATE trips SET approved_at = NOW() - INTERVAL '11 days' WHERE id = 1008`
);
const r = await client.query(`SELECT id, trip_no, approved_at FROM trips WHERE id = 1008`);
console.log(JSON.stringify(r.rows[0]));
await client.end();
