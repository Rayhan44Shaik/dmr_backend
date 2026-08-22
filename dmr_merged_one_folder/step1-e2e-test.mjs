/**
 * Step 1 final contract: no draft endpoints; one permanent POST.
 */
const base = process.env.API_BASE || "http://localhost:4000/api";
const tripDate = new Date().toISOString().slice(0, 10);

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

const payload = {
  tripDate,
  vehicleId: 1,
  vehicleNo: "AP39AB1234",
  driverId: 1,
  driverName: "Ravi Kumar",
  supervisorId: 2,
  supervisorName: "Suresh Reddy",
  helpers: ["Anil"],
  loaders: ["Babu"],
  openingMeter: 99000,
  advanceAmount: 250,
  remarks: "Final Step 1 submit",
};

const createDraft = await request("POST", "/trips", {});
assert(createDraft.status === 404, "POST /trips draft creation disabled");

const updateDraft = await request("PUT", "/trips/1", { openingMeter: 1 });
assert(updateDraft.status === 404, "PUT /trips/:id draft update disabled");

const missing = await request("POST", "/trips/steps/start", {
  ...payload,
  loaders: [],
});
assert(missing.status === 400, "final submit validates Loader");

const submitted = await request("POST", "/trips/steps/start", payload);
assert(submitted.status === 201, "final submit returns 201");
assert(submitted.body.id > 0, "returns Trip ID");
assert(submitted.body.tripNo, "returns Trip Number");
assert(submitted.body.startStepSubmitted === true, "Step 1 permanently submitted");

console.log("\nStep 1 final-submit API contract: PASS");
