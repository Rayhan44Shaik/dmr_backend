// LIVE end-to-end verification of Fleet → Vehicle Analytics against real
// PostgreSQL. Backend must be running on :4000 (tsx watch). Creates its own
// unique fixtures (vehicles, completed/pending/deleted trips, fuel bills,
// approved/pending/deleted maintenance) and cleans everything up at the end.
//
// Covers the required 30 scenarios from the Analytics specification, with the
// authoritative math computed from the fixture values below.
import pg from "pg";

const API = "http://localhost:4000/api";
const pool = new pg.Pool({
  connectionString: "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries",
});
const db = (sql, params = []) => pool.query(sql, params);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

async function api(path, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) qs.set(k, String(v));
  const url = API + path + (qs.toString() ? `?${qs}` : "");
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

/** ISO week number (matches Postgres EXTRACT(WEEK) and date-fns getWeek). */
function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}
const sundayOf = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
};

const stamp = Date.now().toString().slice(-6);
const createdIds = { trips: [], fuel: [], maint: [], vehicles: [] };
const vehMap = {};

try {
  // ------------------------------------------------------------------
  //  FIXTURES — unique numbers via MAX+1; real schema columns only.
  // ------------------------------------------------------------------
  const mkVehicle = async (tag) => {
    const vMax = (await db(`SELECT COALESCE(MAX(vehicle_no),0)::int m FROM vehicles`)).rows[0].m;
    const veh = await db(
      `INSERT INTO vehicles (vehicle_no, vehicle_number, vehicle_type, status, no_of_boxes, bird_capacity, capacity_kg)
       VALUES ($1,$2,'Truck','Active',85,1000,5000) RETURNING id, vehicle_number`,
      [vMax + 1, `${tag}-${stamp}`]
    );
    createdIds.vehicles.push(veh.rows[0].id);
    return { id: veh.rows[0].id, number: veh.rows[0].vehicle_number };
  };

  const V1 = await mkVehicle("ANLXP-V1");
  const V2 = await mkVehicle("ANLXP-V2");
  const V3 = await mkVehicle("ANLXP-V3");
  vehMap.v1 = V1.id; vehMap.v2 = V2.id; vehMap.v3 = V3.id;

  const mkTrip = async (opts) => {
    const r = await db(
      `INSERT INTO trips (
         trip_no, trip_date, status, vehicle_id, vehicle_no,
         opening_meter, closing_meter, end_meter, total_km,
         pickup_tolls, delivery_tolls, destination_tolls,
         driver_bata, meals, meals_tiffin, loading, vehicle_maintenance,
         others_rc, others1_amt, others2_amt, others3_amt, others4_amt, others5_amt,
         fuel, expense, total_trip_expense, deleted
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       RETURNING id, total_km`,
      [
        opts.tripNo, opts.date, opts.status, opts.vehicleId, opts.vehicleNo,
        opts.opening ?? 0, opts.closing ?? 0, opts.closing ?? 0, opts.totalKm,
        opts.pickupTolls ?? 0, opts.deliveryTolls ?? 0, opts.destinationTolls ?? 0,
        opts.driverBata ?? 0, opts.meals ?? 0, opts.mealsTiffin ?? 0, opts.loading ?? 0,
        opts.vehicleMaintenance ?? 0,
        opts.othersRC ?? 0, opts.others1 ?? 0, opts.others2 ?? 0, opts.others3 ?? 0,
        opts.others4 ?? 0, opts.others5 ?? 0,
        opts.fuelField ?? 0, opts.expenseField ?? 0, opts.totalTripExpense ?? 0,
        opts.deleted ?? false,
      ]
    );
    createdIds.trips.push(r.rows[0].id);
    return r.rows[0].id;
  };

  // ---- Completed trips (business dates in range 2026-06-01 → 2026-06-08)
  const tripA = await mkTrip({
    tripNo: `ANLX-TA-${stamp}`, date: "2026-06-01", status: "Completed",
    vehicleId: V1.id, vehicleNo: V1.number,
    opening: 100, closing: 500, totalKm: 400,
    pickupTolls: 100, deliveryTolls: 50, destinationTolls: 25,
    driverBata: 200, meals: 150, mealsTiffin: 50, loading: 100,
    vehicleMaintenance: 80, othersRC: 20, others1: 5, others2: 5, others3: 5, others4: 5, others5: 5,
    // fields that MUST NOT feed analytics (double-counting guards)
    fuelField: 5000, expenseField: 5000, totalTripExpense: 999999,
  });
  const tripB = await mkTrip({
    tripNo: `ANLX-TB-${stamp}`, date: "2026-06-08", status: "Completed",
    vehicleId: V1.id, vehicleNo: V1.number,
    opening: 500, closing: 900, totalKm: 400,
    driverBata: 100,
    fuelField: 3000, totalTripExpense: 999999,
  });
  const tripC = await mkTrip({
    tripNo: `ANLX-TC-${stamp}`, date: "2026-06-02", status: "Completed",
    vehicleId: V2.id, vehicleNo: V2.number,
    opening: 1000, closing: 1200, totalKm: 200,
    pickupTolls: 10, deliveryTolls: 10, destinationTolls: 10,
    meals: 60,
  });

  // ---- Non-eligible trips (must be excluded)
  const tripPending = await mkTrip({
    tripNo: `ANLX-TP-${stamp}`, date: "2026-06-03", status: "Pending",
    vehicleId: V1.id, vehicleNo: V1.number, opening: 1, closing: 10000, totalKm: 9999,
  });
  const tripDeleted = await mkTrip({
    tripNo: `ANLX-TD-${stamp}`, date: "2026-06-04", status: "Completed",
    vehicleId: V1.id, vehicleNo: V1.number, opening: 1, closing: 8889, totalKm: 8888,
    deleted: true,
  });
  const tripDraft = await mkTrip({
    tripNo: `ANLX-TR-${stamp}`, date: "2026-06-05", status: "Draft",
    vehicleId: V1.id, vehicleNo: V1.number, opening: 1, closing: 9999, totalKm: 9998,
  });
  createdIds.trips.push(tripPending, tripDeleted, tripDraft);

  const mkFuel = async (opts) => {
    const r = await db(
      `INSERT INTO fuel_expenses (
         bill_no, expense_date, vehicle_id, vehicle_no, trip_id, source_type,
         meter_reading, amount, rate, litres, petrol_bunk, status, ops_status,
         trip_fuel_entry_index
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        opts.billNo, opts.date, opts.vehicleId, opts.vehicleNo, opts.tripId ?? null,
        opts.sourceType ?? "MANUAL",
        opts.meter ?? 0, opts.amount, opts.rate, opts.litres, "",
        opts.status ?? "Approved", opts.opsStatus ?? "Approved",
        opts.tripFuelIndex ?? null,
      ]
    );
    createdIds.fuel.push(r.rows[0].id);
  };

  const F1 = await mkFuel({ billNo: `ANLX-F1-${stamp}`, date: "2026-06-01", vehicleId: V1.id, vehicleNo: V1.number, litres: 100, amount: 9000, rate: 90 });
  const F2_TRIP = await mkFuel({ billNo: `ANLX-F2-${stamp}`, date: "2026-06-08", vehicleId: V1.id, vehicleNo: V1.number, tripId: tripB, sourceType: "TRIP", tripFuelIndex: 1, litres: 50, amount: 4600, rate: 92 });
  const F3 = await mkFuel({ billNo: `ANLX-F3-${stamp}`, date: "2026-06-02", vehicleId: V2.id, vehicleNo: V2.number, litres: 80, amount: 7200, rate: 90 });
  // Rejected MANUAL fuel — the verified frontend fuel rule counts every
  // non-deleted bill (its fuel list never filters by approval status).
  const F4_REJECTED = await mkFuel({ billNo: `ANLX-F4-${stamp}`, date: "2026-06-01", vehicleId: V1.id, vehicleNo: V1.number, litres: 30, amount: 2700, rate: 90, status: "Approved", opsStatus: "Rejected" });
  // Trip fuel behind a NON-completed trip → hidden by the fuel list gate.
  const F5_HIDDEN_TRIP = await mkFuel({ billNo: `ANLX-F5-${stamp}`, date: "2026-06-03", vehicleId: V1.id, vehicleNo: V1.number, tripId: tripPending, sourceType: "TRIP", tripFuelIndex: 1, litres: 200, amount: 18000, rate: 90 });

  const mkMaint = async (opts) => {
    const r = await db(
      `INSERT INTO fleet_maintenance (
         bill_no, maintenance_date, vehicle_id, vehicle_no, total_cost, status, deleted
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [opts.billNo, opts.date, opts.vehicleId, opts.vehicleNo, opts.cost, opts.status, opts.deleted ?? false]
    );
    createdIds.maint.push(r.rows[0].id);
  };

  const M1 = await mkMaint({ billNo: `ANLX-M1-${stamp}`, date: "2026-06-01", vehicleId: V1.id, vehicleNo: V1.number, cost: 5000, status: "Approved" });
  const M2 = await mkMaint({ billNo: `ANLX-M2-${stamp}`, date: "2026-06-02", vehicleId: V2.id, vehicleNo: V2.number, cost: 3000, status: "Approved" });
  const M3_PENDING = await mkMaint({ billNo: `ANLX-M3-${stamp}`, date: "2026-06-03", vehicleId: V1.id, vehicleNo: V1.number, cost: 99999, status: "Pending Approval" });
  const M4_DELETED = await mkMaint({ billNo: `ANLX-M4-${stamp}`, date: "2026-06-04", vehicleId: V1.id, vehicleNo: V1.number, cost: 99999, status: "Approved", deleted: true });

  // ------------------------------------------------------------------
  //  EXPECTED MATH (all-vehicle, 2026-06-01 → 2026-06-08)
  // ------------------------------------------------------------------
  const isoW1 = `W${isoWeek(sundayOf("2026-06-01"))}`; // bucket for 07-19..07-25
  const isoW2 = `W${isoWeek(sundayOf("2026-06-08"))}`; // bucket for 07-26..08-01

  const exp = {
    distance: 1000,          // TA 400 + TB 400 + TC 200
    litres: 260,             // F1 100 + F2 50 + F3 80 + F4 30
    fuelCost: 23500,         // 9000 + 4600 + 7200 + 2700
    maintCost: 8000,         // M1 5000 + M2 3000
    tollCost: 205,           // tripped tolls only
    otherCost: 785,          // trip cash, non-toll, non-diesel
    totalExpense: 32490,     // 23500 + 8000 + 205 + 785
    avgMileage: round2(1000 / 260),
    costPerKm: round2(32490 / 1000),
  };

  console.log("\n=== 1. All vehicles + date range ===");
  const all = await api("/fleet/analytics", { fromDate: "2026-06-01", toDate: "2026-06-08" });
  check("1.1 200", all.status === 200, `got ${all.status}`);
  check("1.2 echoes range", all.data?.fromDate === "2026-06-01" && all.data?.toDate === "2026-06-08");
  check("1.3 safe flag", all.data?.safe === true);

  console.log("\n=== 9. Total distance ===");
  check("9.1 completed trips only distance", all.data?.kpis?.totalDistance === exp.distance, `got ${all.data?.kpis?.totalDistance}`);

  console.log("\n=== 10/11. Fuel litres + mileage ===");
  check("10.1 total fuel litres", all.data?.kpis?.totalFuelLitres === exp.litres, `got ${all.data?.kpis?.totalFuelLitres}`);
  check("11.1 average mileage", approx(all.data?.kpis?.averageMileage, exp.avgMileage), `got ${all.data?.kpis?.averageMileage}`);

  console.log("\n=== 12/13. Total expense + cost per KM ===");
  check("12.1 total expense", all.data?.kpis?.totalExpense === exp.totalExpense, `got ${all.data?.kpis?.totalExpense}`);
  check("13.1 cost per km", approx(all.data?.kpis?.costPerKm, exp.costPerKm), `got ${all.data?.kpis?.costPerKm}`);

  console.log("\n=== 14/15. Cost-center split + percentages ===");
  const cc = (name) => all.data?.costCenters?.find((c) => c.name === name);
  check("14.1 fuel center", cc("Fuel")?.amount === exp.fuelCost, `got ${cc("Fuel")?.amount}`);
  check("14.2 maintenance center", cc("Maintenance")?.amount === exp.maintCost, `got ${cc("Maintenance")?.amount}`);
  check("14.3 toll center", cc("Toll")?.amount === exp.tollCost, `got ${cc("Toll")?.amount}`);
  check("14.4 other center", cc("Other")?.amount === exp.otherCost, `got ${cc("Other")?.amount}`);
  const ccTotal = (cc("Fuel")?.amount || 0) + (cc("Maintenance")?.amount || 0) + (cc("Toll")?.amount || 0) + (cc("Other")?.amount || 0);
  check("14.5 centers sum equals total expense", ccTotal === exp.totalExpense, `got ${ccTotal}`);
  const pctSum = ["Fuel", "Maintenance", "Toll", "Other"].reduce((s, n) => s + (cc(n)?.percentage || 0), 0);
  check("15.1 percentages sum to 100", approx(pctSum, 100, 0.05), `got ${pctSum}`);
  check("15.2 fuel pct", approx(cc("Fuel")?.percentage, round2((23500 / 32490) * 100)), `got ${cc("Fuel")?.percentage}`);
  check("15.3 each center has amount+percentage", ["Fuel", "Maintenance", "Toll", "Other"].every((n) => typeof cc(n)?.amount === "number" && typeof cc(n)?.percentage === "number"));

  console.log("\n=== 16/17. Weekly fuel + weekly mileage ===");
  check("16.1 two weekly buckets", all.data?.weeklyFuelConsumption?.length === 2, `got ${all.data?.weeklyFuelConsumption?.length}`);
  const wf = all.data?.weeklyFuelConsumption || [];
  check("16.2 week labels W{ISO}", wf[0]?.week === isoW1 && wf[1]?.week === isoW2, `got ${wf.map((w) => w.week).join(",")} expected ${isoW1},${isoW2}`);
  check("16.3 weekly litres", wf[0]?.litres === 210 && wf[1]?.litres === 50, `got ${wf.map((w) => w.litres).join(",")}`);
  const wm = all.data?.weeklyMileage || [];
  check("17.1 weekly distance", wm[0]?.distance === 600 && wm[1]?.distance === 400, `got ${wm.map((w) => w.distance).join(",")}`);
  check("17.2 weekly mileage value", approx(wm[0]?.mileage, 600 / 210) && approx(wm[1]?.mileage, 8), `got ${wm.map((w) => w.mileage).join(",")}`);
  check("17.3 weekly totals match KPIs", wf.reduce((s, w) => s + w.litres, 0) === exp.litres && wm.reduce((s, w) => s + w.distance, 0) === exp.distance);
  check("17.4 weekLabel present", wm.every((w) => w.week === w.weekLabel));

  console.log("\n=== 18. Top performers ===");
  const tp = all.data?.topPerformers || [];
  check("18.1 returns ranked vehicles", tp.length >= 3 && tp.length <= 5, `got ${tp.length}`);
  check("18.2 V1 ranked first by mileage", tp[0]?.vehicleId === V1.id && tp[0]?.mileage > tp[1]?.mileage, `got ${tp.map((p) => `${p.vehicleNumber}:${p.mileage}`).join(",")}`);
  check("18.3 mileage = V1 800/180", approx(tp[0]?.mileage, 800 / 180), `got ${tp[0]?.mileage}`);
  check("18.4 fields present", tp.every((p) => p.vehicleId && p.vehicleNo && typeof p.distance === "number" && typeof p.fuelLitres === "number"));

  console.log("\n=== 19. Highest expense ===");
  const he = all.data?.highestExpense || [];
  check("19.1 returns ranked vehicles", he.length >= 3 && he.length <= 5, `got ${he.length}`);
  check("19.2 V1 ranked first by total cost", he[0]?.vehicleId === V1.id && he[0]?.totalCost > he[1]?.totalCost, `got ${he.map((h) => `${h.vehicleNumber}:${h.totalCost}`).join(",")}`);
  check("19.3 V1 total cost", he[0]?.totalCost === 22200, `got ${he[0]?.totalCost}`);
  check("19.4 fuelCost not litres", he[0]?.fuelCost === 16300, `got ${he[0]?.fuelCost} (litres would be ${180})`);
  check("19.5 maintenanceCost", he[0]?.maintenanceCost === 5000, `got ${he[0]?.maintenanceCost}`);

  console.log("\n=== 20/21/22. Trip status/deleted filtering ===");
  check("20.1 distance excludes non-completed", all.data?.kpis?.totalDistance === exp.distance, `distance would include 9999/8888/9998 if leaked`);
  check("21.1 pending trip excluded", all.data?.kpis?.totalDistance === 1000, `got ${all.data?.kpis?.totalDistance}`);
  check("22.1 deleted trip excluded", all.data?.kpis?.totalDistance === 1000);
  check("22.2 deleted trip toll not counted", all.data?.kpis?.tollCost === 205);

  console.log("\n=== 23/24. Maintenance approval/deleted filtering ===");
  check("23.1 pending maintenance excluded", all.data?.kpis?.maintenanceCost === 8000, `got ${all.data?.kpis?.maintenanceCost}`);
  check("24.1 deleted maintenance excluded", all.data?.kpis?.maintenanceCost === 8000);

  console.log("\n=== 25/26/27. Double counting protection ===");
  check("25.1 trip.fuel field not counted", all.data?.kpis?.fuelCost === 23500, `got ${all.data?.kpis?.fuelCost}`);
  check("25.2 trip.total_trip_expense field not counted", all.data?.kpis?.totalExpense === 32490, `got ${all.data?.kpis?.totalExpense}`);
  check("25.3 trip fuel (TRIP source) counted exactly once", all.data?.kpis?.fuelCost === 23500);
  check("25.4 twice-counted trip fuel (F5 hidden behind pending trip)", all.data?.kpis?.totalFuelLitres === 260, `got ${all.data?.kpis?.totalFuelLitres}`);
  check("26.1 maintenance counted once", all.data?.kpis?.maintenanceCost === 8000);
  check("27.1 toll counted once (trip tolls only, no FASTag dup)", all.data?.kpis?.tollCost === 205, `got ${all.data?.kpis?.tollCost}`);
  check("27.2 toll not also inside other", all.data?.kpis?.otherCost === 785, `got ${all.data?.kpis?.otherCost}`);

  console.log("\n=== 2. One vehicle + date range ===");
  const v1 = await api("/fleet/analytics", { fromDate: "2026-06-01", toDate: "2026-06-08", vehicleId: V1.id });
  check("2.1 200", v1.status === 200, `got ${v1.status}`);
  check("2.2 KPI distance V1", v1.data?.kpis?.totalDistance === 800, `got ${v1.data?.kpis?.totalDistance}`);
  check("2.3 fuel litres V1", v1.data?.kpis?.totalFuelLitres === 180, `got ${v1.data?.kpis?.totalFuelLitres}`);
  check("2.4 fuel cost V1", v1.data?.kpis?.fuelCost === 16300, `got ${v1.data?.kpis?.fuelCost}`);
  check("2.5 maint cost V1", v1.data?.kpis?.maintenanceCost === 5000);
  check("2.6 toll cost V1", v1.data?.kpis?.tollCost === 175);
  check("2.7 other cost V1", v1.data?.kpis?.otherCost === 725, `got ${v1.data?.kpis?.otherCost}`);
  check("2.8 total expense V1", v1.data?.kpis?.totalExpense === 22200, `got ${v1.data?.kpis?.totalExpense}`);
  check("2.9 top performers only V1", v1.data?.topPerformers?.length === 1 && v1.data?.topPerformers?.[0]?.vehicleId === V1.id);
  check("2.10 highest expense only V1", v1.data?.highestExpense?.length === 1 && v1.data?.highestExpense?.[0]?.vehicleId === V1.id);
  check("2.11 vehicle echo", v1.data?.vehicleId === V1.id);
  check("2.12 weekly buckets only V1 data", v1.data?.weeklyFuelConsumption?.reduce((s, w) => s + w.litres, 0) === 180);
  check("2.13 donut restricted", v1.data?.costCenters?.reduce((s, c) => s + c.amount, 0) === 22200);

  console.log("\n=== 3. Different date range (single day, only V2) ===");
  const day2 = await api("/fleet/analytics", { fromDate: "2026-06-02", toDate: "2026-06-02" });
  check("3.1 distance", day2.data?.kpis?.totalDistance === 200, `got ${day2.data?.kpis?.totalDistance}`);
  check("3.2 fuel litres", day2.data?.kpis?.totalFuelLitres === 80, `got ${day2.data?.kpis?.totalFuelLitres}`);
  check("3.3 total expense", day2.data?.kpis?.totalExpense === 10290, `got ${day2.data?.kpis?.totalExpense}`);
  check("3.4 cost per km", approx(day2.data?.kpis?.costPerKm, 10290 / 200), `got ${day2.data?.kpis?.costPerKm}`);
  check("3.5 week label matches single bucket", day2.data?.weeklyFuelConsumption?.length === 1 && day2.data?.weeklyFuelConsumption?.[0]?.litres === 80);
  check("3.6 V2 top performer", day2.data?.topPerformers?.[0]?.vehicleId === V2.id);

  console.log("\n=== 4. Vehicle with no data ===");
  const v3 = await api("/fleet/analytics", { fromDate: "2026-06-01", toDate: "2026-06-08", vehicleId: V3.id });
  check("4.1 zero distance", v3.data?.kpis?.totalDistance === 0);
  check("4.2 zero litres", v3.data?.kpis?.totalFuelLitres === 0);
  check("4.3 zero expense", v3.data?.kpis?.totalExpense === 0);
  check("4.4 top performer V3 present with 0", v3.data?.topPerformers?.length === 1 && v3.data?.topPerformers?.[0]?.mileage === 0);
  check("4.5 highest expense V3 present with 0", v3.data?.highestExpense?.length === 1 && v3.data?.highestExpense?.[0]?.totalCost === 0);

  console.log("\n=== 5. Date range with no data ===");
  const empty = await api("/fleet/analytics", { fromDate: "2020-01-01", toDate: "2020-01-31" });
  check("5.1 all KPIs zero", empty.data?.kpis?.totalDistance === 0 && empty.data?.kpis?.totalFuelLitres === 0 && empty.data?.kpis?.totalExpense === 0 && empty.data?.kpis?.costPerKm === 0 && empty.data?.kpis?.averageMileage === 0);
  check("5.2 zero cost centres", empty.data?.costCenters?.every((c) => c.amount === 0 && c.percentage === 0));
  check("5.3 weekly buckets still emitted (weeks in range)", empty.data?.weeklyFuelConsumption?.length >= 4 && empty.data?.weeklyFuelConsumption?.every((w) => w.litres === 0));

  console.log("\n=== 28/29/30. Zero-safe math ===");
  check("28.1 zero distance costPerKm not Infinity", empty.data?.kpis?.costPerKm === 0 && Number.isFinite(empty.data?.kpis?.costPerKm));
  check("28.2 zero distance avgMileage 0", empty.data?.kpis?.averageMileage === 0);
  check("29.1 zero fuel weekly mileage not NaN", empty.data?.weeklyMileage?.every((w) => w.mileage === 0 && !Number.isNaN(w.mileage)));
  check("29.2 zero fuel top performer mileage 0", v3.data?.topPerformers?.[0]?.mileage === 0 && !Number.isNaN(v3.data?.topPerformers?.[0]?.mileage));
  check("30.1 zero expense percentage 0", empty.data?.costCenters?.every((c) => c.percentage === 0));
  check("30.2 donut value aliases 0", empty.data?.costCenters?.every((c) => c.value === 0));
  check("30.3 safe flag under zero data", empty.data?.safe === true);

  console.log("\n=== 6. Invalid vehicle ===");
  const badVeh = await api("/fleet/analytics", { fromDate: "2026-06-01", toDate: "2026-06-08", vehicleId: 4258251 });
  check("6.1 422 vehicle not found", badVeh.status === 422, `got ${badVeh.status}`);

  console.log("\n=== 7. Invalid date ===");
  const badDate1 = await api("/fleet/analytics", { fromDate: "abc", toDate: "2026-06-08" });
  const badDate2 = await api("/fleet/analytics", { fromDate: "2026-02-30", toDate: "2026-06-08" });
  check("7.1 non-date rejected", badDate1.status === 400, `got ${badDate1.status}`);
  check("7.2 calendar-impossible date rejected", badDate2.status === 400, `got ${badDate2.status}`);

  console.log("\n=== 8. fromDate > toDate ===");
  const swapped = await api("/fleet/analytics", { fromDate: "2026-06-08", toDate: "2026-06-01" });
  check("8.1 400", swapped.status === 400, `got ${swapped.status}`);

  console.log("\n=== Default range (current month) works ===");
  const def = await api("/fleet/analytics");
  check("DEF.1 200 and valid weeks", def.status === 200 && typeof def.data?.kpis?.totalDistance === "number");

  // ------------------------------------------------------------------
  //  CLEANUP — delete every fixture row (fuel/maint first, then trips,
  //  then vehicles). Child tables cascade; verify nothing is left behind.
  // ------------------------------------------------------------------
  console.log("\n=== Cleanup ===");
  if (createdIds.fuel.length) await db(`DELETE FROM fuel_expenses WHERE id = ANY($1::uuid[])`, [createdIds.fuel]);
  if (createdIds.maint.length) await db(`DELETE FROM fleet_maintenance WHERE id = ANY($1::int[])`, [createdIds.maint]);
  if (createdIds.trips.length) await db(`DELETE FROM trips WHERE id = ANY($1::int[])`, [createdIds.trips]);
  if (createdIds.vehicles.length) await db(`DELETE FROM vehicles WHERE id = ANY($1::int[])`, [createdIds.vehicles]);
  const leftovers = await db(
    `SELECT
       (SELECT COUNT(*) FROM trips WHERE trip_no LIKE 'ANLX-%')::int AS trips,
       (SELECT COUNT(*) FROM fuel_expenses WHERE bill_no LIKE 'ANLX-F%' )::int AS fuel,
       (SELECT COUNT(*) FROM fleet_maintenance WHERE bill_no LIKE 'ANLX-M%')::int AS maint,
       (SELECT COUNT(*) FROM vehicles WHERE vehicle_number LIKE 'ANLXP-%')::int AS vehicles`
  );
  console.log(`  leftover fixtures = ${JSON.stringify(leftovers.rows[0] ?? {})}`);
} catch (e) {
  console.error("TEST ERROR:", e.message);
  fail++;
  // Best-effort cleanup
  try {
    await db(`DELETE FROM vehicles WHERE vehicle_number LIKE 'ANLXP-%'`);
    await db(`DELETE FROM trips WHERE trip_no LIKE 'ANLX-%'`);
    await db(`DELETE FROM fuel_expenses WHERE bill_no LIKE 'ANLX-F%'`);
    await db(`DELETE FROM fleet_maintenance WHERE bill_no LIKE 'ANLX-M%'`);
  } catch (_) { /* ignore */ }
} finally {
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
