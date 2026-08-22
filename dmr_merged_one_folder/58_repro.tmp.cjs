const BASE = "http://localhost:4000/api";
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // ---- Step 1 exactly as submitStep1() does -----
  const v = { vehicleId: 2, vehicleNo: "AP16AB1234", driverId: 6, driverName: "Rahim",
    supervisorId: 2, supervisorName: "Suresh Reddy Bandi", openingMeter: 1000, advanceAmount: 2000,
    helpers: ["Test Helper"], loaders: ["Test Loader"], remarks: "repro", tripDate: "2030-06-01", tripNo: "" };
  const s1 = await req("POST", "/trips/steps/start", {
    tripDate: v.tripDate, tripNo: "", status: "Draft", startTime: new Date().toLocaleString(),
    vehicleId: v.vehicleId, vehicleNo: v.vehicleNo, driverId: v.driverId, driverName: v.driverName,
    supervisorId: v.supervisorId, supervisorName: v.supervisorName, openingMeter: 1000,
    advanceAmount: 2000, helpers: v.helpers, loaders: v.loaders, remarks: v.remarks,
    startStepSubmitted: true,
  });
  console.log("STEP1", s1.status, s1.data && (s1.data.tripNo || s1.data.id || ""));
  if (s1.status >= 400) return;
  const trip = s1.data;
  console.log("STEP1 returned tripNo:", trip.tripNo, "id:", trip.id, "updatedAt:", trip.updatedAt);

  // ---- Step 2 farm: frontend sends ENTIRE trip object + farmStepSubmitted: true + mode submit ----
  const s2 = await req("POST", `/trips/${trip.id}/steps/farm`, {
    ...trip,
    farmStepSubmitted: true,
    reachedTime: new Date().toLocaleString(),
    sourceFarmId: 1, sourceFarm: "Sri Venkateswara Farm",
    destMeter: 1050, pickupTolls: 3, farmAddress: "test", avgBirdWeight: 2.1,
    remarks: "repro farm", mode: "submit",
  });
  console.log("STEP2", s2.status, s2.data && (s2.data.error || s2.data.status || Object.keys(s2.data).slice(0,6).join(",")));
  if (s2.status >= 400) { console.log("STEP2 ERROR BODY:", JSON.stringify(s2.data).slice(0, 500)); return; }

  // ---- Step 3 pickup: full trip object ----
  const s3 = await req("POST", `/trips/${trip.id}/steps/pickup`, {
    ...s2.data,
    pickupStepSubmitted: true,
    dcWeight: 5000, totalBirds: 2500, boxes: 2,
    boxDetails: [{ boxNo: 1, birds: 1300, weight: 2600 }, { boxNo: 2, birds: 1200, weight: 2400 }],
    mode: "submit",
  });
  console.log("STEP3", s3.status, s3.data && (s3.data.error || s3.data.status || "ok"));
  if (s3.status >= 400) { console.log("STEP3 ERROR BODY:", JSON.stringify(s3.data).slice(0, 500)); return; }

  // ---- Step 4 deliveries: full trip object ----
  const s4 = await req("POST", `/trips/${trip.id}/steps/deliveries`, {
    ...s3.data,
    deliveryStepSubmitted: true,
    deliveries: [
      { shopId: 1, shopName: "City Broiler DMR", birdTypeId: 1, birdType: "Boiler", birds: 1500, weight: 3000, mortality: 0, rate: 120, amount: 360000, remarks: "" },
      { shopId: 1, shopName: "City Broiler DMR", birdTypeId: 1, birdType: "Boiler", birds: 1000, weight: 2000, mortality: 0, rate: 120, amount: 240000, remarks: "" },
    ],
    mode: "submit",
  });
  console.log("STEP4", s4.status, s4.data && (s4.data.error || s4.data.status || "ok"));
  if (s4.status >= 400) { console.log("STEP4 ERROR BODY:", JSON.stringify(s4.data).slice(0, 500)); return; }

  // ---- Step 5 expenses: full trip object ----
  const s5 = await req("POST", `/trips/${trip.id}/steps/expenses`, {
    ...s4.data,
    expensesStepSubmitted: true,
    endStepSubmitted: true,
    status: "Pending",
    endTime: new Date().toLocaleString(),
    closingMeter: 1200,
    dieselEntries: [{ rowIndex: 1, litres: 40, rate: 92.5, meter: 1100, bunkName: "Bunk" }],
    mode: "submit",
  });
  console.log("STEP5", s5.status, s5.data && (s5.data.error || s5.data.status || "ok"));
  if (s5.status >= 400) { console.log("STEP5 ERROR BODY:", JSON.stringify(s5.data).slice(0, 1000)); return; }

  // Cleanup: hard-delete test data
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries" });
  await pool.query("DELETE FROM trip_delivery_boxes WHERE delivery_id IN (SELECT id FROM trip_deliveries WHERE trip_id=$1)", [trip.id]);
  await pool.query("DELETE FROM trip_delivery_per_box WHERE delivery_id IN (SELECT id FROM trip_deliveries WHERE trip_id=$1)", [trip.id]);
  await pool.query("DELETE FROM trip_deliveries WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM trip_boxes WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM trip_diesel_entries WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM trip_crew WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM trip_media WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM fuel_expenses WHERE trip_id=$1", [trip.id]);
  await pool.query("DELETE FROM trips WHERE id=$1", [trip.id]);
  await pool.end();
  console.log("CLEANED", trip.id);
}

main().catch((e) => { console.error(e); process.exit(1); });