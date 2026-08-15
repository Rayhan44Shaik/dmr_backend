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

// Trip A: for the concurrent-lock test (GAP 2.A)
const tripA = await j("POST", "/api/operations/trips", {
  tripNo: "GAP2-LOCK-TRIP", tripDate: "2026-08-06", status: "Completed",
  startTime: "2026-08-06T05:30:00.000Z",
  vehicleId: 3, vehicleNo: "AP16AC5678", driverId: 6, driverName: "Rahim",
  supervisorId: 2, supervisorName: "Suresh Reddy Bandi",
  sourceFarmId: 3, sourceFarm: "Sri Lakshmi Poultry Farm",
  farmBirdTypeId: 2, farmBirdType: "Broiler",
  openingMeter: 33500, startStepSubmitted: true, farmStepSubmitted: true,
  pickupStepSubmitted: true, deliveryStepSubmitted: true, expensesStepSubmitted: true,
  totalKm: 50, totalBirds: 500, dcWeight: 900,
});
console.log("TRIP A:", JSON.stringify(tripA.body?.id ?? tripA));

// Trip B already created by a prior partial run (id 1010, TR-20260806-001) —
// reuse it instead of creating a duplicate.
const tripBId = 1010;
console.log("TRIP B (reused):", tripBId);

const tripAId = tripA.body.id;
await client.query(`UPDATE trips SET approved_at = NOW() WHERE id = ANY($1)`, [[tripAId, tripBId]]);

// Trip A: one shop delivery, no rate lock yet (for concurrent-lock test)
const delA = await client.query(
  `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
   VALUES ($1,$2,2,'New Hyderabad Chicken Center',200,350,0,0,0) RETURNING id`,
  [tripAId, `GAP2A-SEED`]
);
console.log("DELIVERY A:", delA.rows[0].id);

// Trip B: one shop delivery, rate-entry saved+locked immediately, for edit races
const delB = await client.query(
  `INSERT INTO trip_deliveries (trip_id, sale_no, shop_id, shop_name, birds, weight, mortality, rate, amount)
   VALUES ($1,$2,3,'Bismillah Chicken Shop',300,500,0,0,0) RETURNING id`,
  [tripBId, `GAP2B-SEED`]
);
console.log("DELIVERY B:", delB.rows[0].id);

await client.end();

console.log("---rate entry save+lock trip A---");
console.log(JSON.stringify(await j("POST", "/api/operations/rate-entry", { tripId: tripAId, rate: 100, deliveries: [{ id: delA.rows[0].id, rate: 100 }] })));
console.log("---rate entry save+lock trip B---");
console.log(JSON.stringify(await j("POST", "/api/operations/rate-entry", { tripId: tripBId, rate: 100, deliveries: [{ id: delB.rows[0].id, rate: 100 }] })));
console.log(JSON.stringify(await j("POST", `/api/operations/rate-entry/trip/${tripBId}/lock`, {})));

console.log("SUMMARY", JSON.stringify({ tripAId, tripBId, delA: delA.rows[0].id, delB: delB.rows[0].id }));
