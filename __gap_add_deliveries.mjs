import pg from "pg";
const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();

const tripId = 1008;
// Anchor the 10-day edit window to "now" so the live walkthrough has a full,
// unambiguous window (mirrors real production behaviour where approved_at is
// stamped by the Approve/Complete action).
await client.query(`UPDATE trips SET approved_at = NOW() WHERE id = $1`, [tripId]);

const shops = [
  { id: 2, name: "New Hyderabad Chicken Center", birds: 300, weight: 500 },
  { id: 3, name: "Bismillah Chicken Shop", birds: 250, weight: 450 },
  { id: 4, name: "Royal Chicken Center", birds: 200, weight: 350 },
];

for (const s of shops) {
  const r = await client.query(
    `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0) RETURNING id`,
    [tripId, `GAP-SEED-${s.id}`, s.id, s.name, s.birds, s.weight]
  );
  console.log("delivery", s.name, "->", r.rows[0].id);
}
// mortality on the trip: 20 birds, matches Scenario 1 (1000 loaded, 750 delivered, 20 mortality, 230 remaining)
await client.query(`UPDATE trip_deliveries SET mortality = 20 WHERE trip_id = $1 AND shop_id = 2`, [tripId]);

await client.end();
