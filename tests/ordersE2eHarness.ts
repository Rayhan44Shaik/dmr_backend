import { startApp } from "./helpers/app.js";
import { applySchema, startTestDb } from "./helpers/testDb.js";

const testDb = await startTestDb();
process.env.DATABASE_URL = testDb.url;
await applySchema();

const { pool } = await import("../src/config/db.js");
const { mastersService } = await import("../src/services/mastersService.js");
const { tripsService } = await import("../src/services/tripsService.js");

const vehicle = await mastersService.upsertVehicle({
  vehicleNumber: "ORD-E2E-TRUCK-01", vehicleType: "Lorry", noOfBoxes: 80,
  birdCapacity: 5000, capacityKg: 6000, engineNumber: "ORD-E2E-ENG-01",
  chassisNumber: "ORD-E2E-CHS-01", status: "Active",
});
const driver = await mastersService.upsertEmployee({
  employeeName: "Orders E2E Driver", department: "Operations", role: "Driver",
  phoneNumber: "9700000201", licenseNumber: "ORD-E2E-DL", salary: 18000, status: "Active",
});
const supervisor = await mastersService.upsertEmployee({
  employeeName: "Orders E2E Supervisor", department: "Operations", role: "Supervisor",
  phoneNumber: "9700000202", salary: 24000, status: "Active",
});
const farm = await mastersService.upsertFarm({
  farmName: "Orders E2E Farm", ownerName: "Orders Owner", supervisorName: "Orders Supervisor",
  phoneNumber: "9700000203", village: "Orders Village", address: "Orders Farm Road",
  capacity: 10000, status: "Active",
});
const birdType = await mastersService.upsertBirdType({
  birdType: "Orders E2E Broiler", averageWeight: 2, description: "Orders E2E", status: "Active",
});
for (let i = 1; i <= 5; i += 1) {
  await mastersService.upsertShop({
    shopName: `Orders E2E Shop ${i}`, ownerName: "Orders Owner",
    phoneNumber: `97000003${String(i).padStart(2, "0")}`,
    village: "Orders Village", status: "Active",
  });
}

const day = new Date().toISOString().slice(0, 10);
await tripsService.save(null, {
  tripDate: day, status: "Draft", vehicleId: vehicle.id, vehicleNo: vehicle.vehicleNumber,
  driverId: driver.id, driverName: driver.employeeName,
  supervisorId: supervisor.id, supervisorName: supervisor.employeeName,
  sourceFarmId: farm.id, sourceFarm: farm.farmName, birdTypeId: birdType.id,
  birdType: birdType.birdType, openingMeter: 1000, startStepSubmitted: true,
  farmStepSubmitted: true, pickupStepSubmitted: true, totalBirds: 300,
  dcWeight: 600, farmBirdCount: 300, farmLoadWeight: 600, boxes: 30,
  boxDetails: Array.from({ length: 30 }, (_, index) => ({
    boxNo: index + 1, birds: 10, weight: 20,
  })),
});

const app = await startApp({ DATABASE_URL: testDb.url }, 4100);
console.log("Orders E2E harness ready on http://127.0.0.1:4100");
console.log("Login: test-owner-4100 / Test-only-password-123!");

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
