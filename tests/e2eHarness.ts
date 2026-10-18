/**
 * Isolated PGlite + production server on :4100 for Batch C2 / trip-workflow browser runs.
 * Never connects to the operational database.
 */
import { startApp } from "./helpers/app.js";
import { applySchema, startTestDb } from "./helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

const vehicle = await mastersService.upsertVehicle({
  vehicleNumber: "E2E-TRUCK-01",
  vehicleType: "Truck",
  noOfBoxes: 40,
  birdCapacity: 2000,
  capacityKg: 3000,
  engineNumber: "E2E-ENG-01",
  chassisNumber: "E2E-CHS-01",
  status: "Active",
});
const fullVehicle = await mastersService.upsertVehicle({
  vehicleNumber: "E2E-TRUCK-03",
  vehicleType: "Truck",
  noOfBoxes: 40,
  birdCapacity: 2000,
  capacityKg: 3000,
  engineNumber: "E2E-ENG-03",
  chassisNumber: "E2E-CHS-03",
  status: "Active",
});
const rentalVehicle = await mastersService.upsertVehicle({
  vehicleNumber: "E2E-RENTAL-01",
  vehicleType: "Truck",
  noOfBoxes: 20,
  birdCapacity: 1000,
  capacityKg: 1500,
  status: "Active",
  isRented: true,
});

const driver = await mastersService.upsertEmployee({
  employeeName: "E2E Driver One",
  department: "Operations",
  role: "Driver",
  phoneNumber: "9700000101",
  licenseNumber: "E2E-DL-01",
  salary: 18000,
  status: "Active",
});
const supervisor = await mastersService.upsertEmployee({
  employeeName: "E2E Supervisor One",
  department: "Operations",
  role: "Supervisor",
  phoneNumber: "9700000102",
  salary: 24000,
  status: "Active",
});
const helper = await mastersService.upsertEmployee({
  employeeName: "E2E Helper One",
  department: "Operations",
  role: "Helper",
  phoneNumber: "9700000103",
  salary: 12000,
  status: "Active",
});
const loader = await mastersService.upsertEmployee({
  employeeName: "E2E Loader One",
  department: "Operations",
  role: "Loader",
  phoneNumber: "9700000104",
  salary: 12000,
  status: "Active",
});
const fullDriver = await mastersService.upsertEmployee({
  employeeName: "E2E Driver Two",
  department: "Operations",
  role: "Driver",
  phoneNumber: "9700000111",
  licenseNumber: "E2E-DL-02",
  salary: 18000,
  status: "Active",
});
const fullSupervisor = await mastersService.upsertEmployee({
  employeeName: "E2E Supervisor Two",
  department: "Operations",
  role: "Supervisor",
  phoneNumber: "9700000112",
  salary: 24000,
  status: "Active",
});
const fullHelper = await mastersService.upsertEmployee({
  employeeName: "E2E Helper Two",
  department: "Operations",
  role: "Helper",
  phoneNumber: "9700000113",
  salary: 12000,
  status: "Active",
});
const fullLoader = await mastersService.upsertEmployee({
  employeeName: "E2E Loader Two",
  department: "Operations",
  role: "Loader",
  phoneNumber: "9700000114",
  salary: 12000,
  status: "Active",
});

const farm = await mastersService.upsertFarm({
  farmName: "E2E Source Farm",
  ownerName: "E2E Owner",
  supervisorName: "E2E Supervisor",
  phoneNumber: "9700000120",
  village: "E2E Village",
  address: "E2E Farm Road",
  capacity: 10000,
  status: "Active",
});
const birdType = await mastersService.upsertBirdType({
  birdType: "E2E Broiler",
  averageWeight: 2,
  description: "E2E",
  status: "Active",
});

const shopNames = [
  "E2E Shop Alpha",
  "E2E Shop Bravo",
  "E2E Shop Charlie",
  "E2E Shop Delta",
  "E2E Shop Echo",
];
const shops = [];
for (let i = 0; i < shopNames.length; i += 1) {
  shops.push(
    await mastersService.upsertShop({
      shopName: shopNames[i],
      ownerName: "E2E Owner",
      phoneNumber: `97000002${String(i).padStart(2, "0")}`,
      village: "E2E Village",
      status: "Active",
    }),
  );
}

// Disposable Step-4-ready trip for Batch C2 persistence (API+browser).
const c2Trip = await tripsService.save(null, {
  tripDate: new Date().toISOString().slice(0, 10),
  status: "Draft",
  vehicleId: vehicle.id,
  vehicleNo: vehicle.vehicleNumber,
  driverId: driver.id,
  driverName: driver.employeeName,
  supervisorId: supervisor.id,
  supervisorName: supervisor.employeeName,
  helpers: [helper.employeeName],
  loaders: [loader.employeeName],
  sourceFarmId: farm.id,
  sourceFarm: farm.farmName,
  farmBirdTypeId: birdType.id,
  farmBirdType: birdType.birdType,
  openingMeter: 50000,
  destMeter: 50100,
  startStepSubmitted: true,
  farmStepSubmitted: true,
  pickupStepSubmitted: true,
  boxDetails: [
    { boxNo: 1, birds: 40, weight: 80 },
    { boxNo: 2, birds: 40, weight: 80 },
    { boxNo: 3, birds: 40, weight: 80 },
    { boxNo: 4, birds: 40, weight: 80 },
  ],
} as Record<string, unknown>);

// Vite :5199 proxies /api here; browsers send Origin. Pin CORS to the FE origin
// so SameSite session cookies work through the proxy without CORS crashes.
const app = await startApp(
  { DATABASE_URL: testDb.url, CORS_ORIGIN: "http://127.0.0.1:5199" },
  4100,
);

const meta = {
  baseUrl: "http://127.0.0.1:4100",
  login: { username: "test-owner-4100", password: "Test-only-password-123!" },
  c2TripId: c2Trip.id,
  c2TripNo: c2Trip.tripNo,
  shops: shops.map((s) => ({ id: s.id, name: s.shopName })),
  vehicleId: vehicle.id,
  fullVehicleId: fullVehicle.id,
  rentalVehicleId: (rentalVehicle as { id: number }).id,
  birdTypeId: birdType.id,
  birdType: birdType.birdType,
};
console.log("E2E harness ready on http://127.0.0.1:4100");
console.log(JSON.stringify(meta));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await pool.end();
  await testDb.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
await new Promise(() => undefined);
