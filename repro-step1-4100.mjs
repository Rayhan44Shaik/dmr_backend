const BASE = "http://localhost:4100/api";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`\n>>> POST ${path}`);
  console.log("    status:", res.status);
  console.log("    body:", JSON.stringify(data, null, 2).slice(0, 1500));
  return { status: res.status, data };
}

// Reproduce the exact frontend Step-1 payload for a NEW trip.
// New trip uses vehicleId 3 / driver 6 / supervisor 2 / helper Kareem / loader Saleem,
// which do NOT collide with Draft trip 52 (veh 2, drv 6, sup 7, Anil, Babu).
const payload = {
  tripDate: "2026-08-11",
  tripNo: "",
  status: "Draft",
  startStepSubmitted: true,
  startTime: "8/12/2026, 4:10:00 PM",
  vehicleId: 3,
  vehicleNo: "AP16AC5678",
  driverId: 6,
  driverName: "Rahim",
  supervisorId: 2,
  supervisorName: "Suresh Reddy Bandi",
  openingMeter: 1000,
  advanceAmount: 500,
  helpers: ["Kareem"],
  loaders: ["Saleem"],
  remarks: "",
};

await post("/trips/steps/start", payload);
