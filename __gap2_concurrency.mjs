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

const tripAId = 1011; // unlocked rate_entry, single delivery 1145
const delB = 1146;    // locked, trip 1010, birds=300 weight=500 rate=100

console.log("\n=== A. Two simultaneous Rate Entry lock requests on trip", tripAId, "===");
const [lockR1, lockR2] = await Promise.all([
  j("POST", `/api/operations/rate-entry/trip/${tripAId}/lock`, { lockedBy: "userA" }),
  j("POST", `/api/operations/rate-entry/trip/${tripAId}/lock`, { lockedBy: "userB" }),
]);
console.log("lock1:", lockR1.status, JSON.stringify(lockR1.body));
console.log("lock2:", lockR2.status, JSON.stringify(lockR2.body));

console.log("\n=== B/C. Two concurrent edits: birds vs weight on the same Shop Sale (delivery", delB, ") ===");
const [birdsEdit, weightEdit] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${delB}`, { birds: 320 }),
  j("PUT", `/api/operations/shop-sales/${delB}`, { weight: 550 }),
]);
console.log("birdsEdit:", birdsEdit.status, JSON.stringify(birdsEdit.body));
console.log("weightEdit:", weightEdit.status, JSON.stringify(weightEdit.body));

console.log("\n=== D/E. Two concurrent rate edits on the same Shop Sale (delivery", delB, ") ===");
const [rateEdit1, rateEdit2] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${delB}`, { rate: 150 }),
  j("PUT", `/api/operations/shop-sales/${delB}`, { rate: 200 }),
]);
console.log("rateEdit1(->150):", rateEdit1.status, JSON.stringify(rateEdit1.body));
console.log("rateEdit2(->200):", rateEdit2.status, JSON.stringify(rateEdit2.body));

console.log("\n=== F/G. Two concurrent requests each trying to push birds/weight over capacity ===");
// trip 1010 has capacityBirds=1000, capacityWeight=1800 (from earlier __gap2_setup fixture? verify below)
const [overBirds1, overBirds2] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${delB}`, { birds: 900 }),
  j("PUT", `/api/operations/shop-sales/${delB}`, { birds: 950 }),
]);
console.log("overBirds1(->900):", overBirds1.status, JSON.stringify(overBirds1.body));
console.log("overBirds2(->950):", overBirds2.status, JSON.stringify(overBirds2.body));

const [overWeight1, overWeight2] = await Promise.all([
  j("PUT", `/api/operations/shop-sales/${delB}`, { weight: 1700 }),
  j("PUT", `/api/operations/shop-sales/${delB}`, { weight: 1750 }),
]);
console.log("overWeight1(->1700):", overWeight1.status, JSON.stringify(overWeight1.body));
console.log("overWeight2(->1750):", overWeight2.status, JSON.stringify(overWeight2.body));

console.log("\n=== H. Two simultaneous identical Shop Sale creation attempts ===");
const createBody = { tripId: tripAId, shopId: 4, birds: 50, weight: 90, rate: 100 };
const [create1, create2] = await Promise.all([
  j("POST", "/api/operations/shop-sales", createBody),
  j("POST", "/api/operations/shop-sales", createBody),
]);
console.log("create1:", create1.status, JSON.stringify(create1.body));
console.log("create2:", create2.status, JSON.stringify(create2.body));
