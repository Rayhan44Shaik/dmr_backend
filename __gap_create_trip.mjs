const base = "http://localhost:4000";

async function j(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data };
}

// Create a Completed trip tagged GAP-TEST, using real active masters.
const trip = await j("POST", "/api/operations/trips", {
  tripNo: "GAP-TEST-TRIP-1",
  tripDate: "2026-08-05",
  status: "Completed",
  startTime: "2026-08-05T05:30:00.000Z",
  vehicleId: 2, // AP16AB1234
  vehicleNo: "AP16AB1234",
  driverId: 6, // Rahim
  driverName: "Rahim",
  supervisorId: 2, // Suresh Reddy Bandi
  supervisorName: "Suresh Reddy Bandi",
  sourceFarmId: 1,
  sourceFarm: "Sri Venkateswara Farm",
  farmBirdTypeId: 2,
  farmBirdType: "Broiler",
  openingMeter: 34000,
  startStepSubmitted: true,
  farmStepSubmitted: true,
  pickupStepSubmitted: true,
  deliveryStepSubmitted: true,
  expensesStepSubmitted: true,
  totalKm: 100,
  totalBirds: 1000,
  dcWeight: 1800,
});
console.log("TRIP CREATE:", JSON.stringify(trip));
