import pg from "pg";
const base = "http://localhost:4000";
async function j(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data };
}

const client = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await client.connect();

// Trip 1010 capacity: totalBirds=1000, dcWeight=1800.
// Reset delivery 1146 (Bismillah) back to a clean baseline: 300 birds / 500 kg.
await client.query(`UPDATE trip_deliveries SET birds = 300, weight = 500, rate = 100, amount = 50000 WHERE id = 1146`);
await client.query(`UPDATE trips SET total_birds_delivered = 300, total_delivered_weight = 500 WHERE id = 1010`);
// Clear any leftover capacity-race rows from a prior attempt.
await client.query(`DELETE FROM trip_deliveries WHERE sale_no IN ('GAP2-CAP-RACE-1','GAP2-CAP-RACE-2')`);

// Two fresh delivery rows, both starting at 0 birds / 0 kg. Remaining
// capacity after delivery 1146's 300 birds is 700 (out of 1000 total).
const d1 = await client.query(
  `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
   VALUES (1010, 'GAP2-CAP-RACE-1', 4, 'Royal Chicken Center', 0, 0, 0, 100, 0) RETURNING id`
);
const d2 = await client.query(
  `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
   VALUES (1010, 'GAP2-CAP-RACE-2', 8, 'Bulk Shop Balance Test', 0, 0, 0, 100, 0) RETURNING id`
);
const id1 = d1.rows[0].id;
const id2 = d2.rows[0].id;
console.log("race delivery ids:", id1, id2);
await client.end();

// Each request ALONE fits (300+500=800<=1000, 300+400=700<=1000) but
// TOGETHER they would total 300+500+400=1200 > 1000 if both succeeded.
// Exactly one must be accepted; the other must be rejected 422; the final
// summed total must never exceed capacity.
console.log("\n=== F. Two concurrent, individually-valid, jointly-over-capacity birds edits ===");
const [birdsA, birdsB] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${id1}`, { birds: 500 }),
  j("PUT", `/api/operations/shop-sales/${id2}`, { birds: 400 }),
]);
console.log(`edit(${id1} -> 500 birds):`, birdsA.status, birdsA.status === 200 ? `birds=${birdsA.body.birds}` : JSON.stringify(birdsA.body));
console.log(`edit(${id2} -> 400 birds):`, birdsB.status, birdsB.status === 200 ? `birds=${birdsB.body.birds}` : JSON.stringify(birdsB.body));

// Same pattern for weight: remaining 1300 kg after 500 kg used. Try 900 + 700
// (each alone fits: 500+900=1400<=1800, 500+700=1200<=1800) but together
// 500+900+700=2100 > 1800.
console.log("\n=== G. Two concurrent, individually-valid, jointly-over-capacity weight edits ===");
const [weightA, weightB] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${id1}`, { weight: 900 }),
  j("PUT", `/api/operations/shop-sales/${id2}`, { weight: 700 }),
]);
console.log(`edit(${id1} -> 900 kg):`, weightA.status, weightA.status === 200 ? `weight=${weightA.body.weight}` : JSON.stringify(weightA.body));
console.log(`edit(${id2} -> 700 kg):`, weightB.status, weightB.status === 200 ? `weight=${weightB.body.weight}` : JSON.stringify(weightB.body));

// Verify final DB state directly: sum must never exceed capacity.
const verify = new pg.Client({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
await verify.connect();
const final = await verify.query(
  `SELECT id, birds, weight FROM trip_deliveries WHERE trip_id = 1010 AND deleted = FALSE ORDER BY id`
);
console.log("\nFinal delivery rows on trip 1010:", JSON.stringify(final.rows));
const totals = final.rows.reduce((a, r) => ({ birds: a.birds + Number(r.birds), weight: a.weight + Number(r.weight) }), { birds: 0, weight: 0 });
console.log("Final totals:", JSON.stringify(totals), " capacity: 1000 birds / 1800 kg");
await verify.end();
