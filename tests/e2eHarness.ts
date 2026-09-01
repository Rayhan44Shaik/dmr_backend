/**
 * Deterministic E2E backend harness.
 *
 * Boots an isolated in-memory PostgreSQL (PGlite behind pg-gateway), applies
 * the real schema, seeds a fixed set of master data, then spawns the REAL
 * production server (tests/helpers/runTestServer.ts -> src/index.ts) on a
 * fixed port so Playwright can drive the actual app end to end without ever
 * touching a real database.
 *
 * Run by Playwright's `webServer[0]`. Stays alive until SIGTERM/SIGINT.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDb, applySchema, shutdownTestEnv, type TestDb } from "./helpers/testDb.js";

// Pin the whole harness (and the server it spawns, which inherits env) to UTC
// so "today" is ONE well-defined value across the browser (see the spec's
// test.use timezoneId), this Node process, and PGlite's CURRENT_DATE. Set
// before startTestDb() / the first Date is constructed below.
process.env.TZ = "UTC";

const PORT = Number(process.env.E2E_BACKEND_PORT ?? 4100);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Fixed identities the specs select by name — never randomised. */
export const E2E_SEED = {
  vehicleNo: "E2E-TRUCK-01",
  vehicleNo2: "E2E-TRUCK-02",
  /** Vehicle for the full real-UI Step 1→5 flow spec (own dedicated crew so
   *  available-resources never subtracts it from the pool the other specs
   *  pick Step 1 crew from). */
  vehicleNo3: "E2E-TRUCK-03",
  driver: "E2E Driver One",
  supervisor: "E2E Supervisor One",
  helper: "E2E Helper One",
  loader: "E2E Loader One",
  /** Dedicated crew for the full-flow spec. */
  driver2: "E2E Driver Two",
  supervisor2: "E2E Supervisor Two",
  helper2: "E2E Helper Two",
  loader2: "E2E Loader Two",
  farm: "E2E Source Farm",
  birdType: "E2E Broiler",
  shops: [
    "E2E Shop Alpha",
    "E2E Shop Bravo",
    "E2E Shop Charlie",
    "E2E Shop Delta",
    "E2E Shop Echo",
  ],
  /** A trip pre-seeded straight to a fully-completed PENDING state. */
  pendingTripNo: "TR-20260101-999",
} as const;

const db: TestDb = await startTestDb();
process.env.DATABASE_URL = db.url;
await applySchema();

const { mastersService } = await import("../src/services/mastersService.js");

await mastersService.upsertVehicle({
  vehicleNumber: E2E_SEED.vehicleNo,
  vehicleType: "Lorry",
  noOfBoxes: 60,
  birdCapacity: 3000,
  capacityKg: 6000,
  engineNumber: "E2E-ENG-01",
  chassisNumber: "E2E-CHS-01",
  status: "Active",
});
await mastersService.upsertVehicle({
  vehicleNumber: E2E_SEED.vehicleNo2,
  vehicleType: "Lorry",
  noOfBoxes: 60,
  birdCapacity: 3000,
  capacityKg: 6000,
  engineNumber: "E2E-ENG-02",
  chassisNumber: "E2E-CHS-02",
  status: "Active",
});
await mastersService.upsertVehicle({
  vehicleNumber: E2E_SEED.vehicleNo3,
  vehicleType: "Lorry",
  noOfBoxes: 60,
  birdCapacity: 3000,
  capacityKg: 6000,
  engineNumber: "E2E-ENG-03",
  chassisNumber: "E2E-CHS-03",
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.driver,
  department: "Driver",
  role: "Driver",
  phoneNumber: "9000000001",
  licenseNumber: "E2E-DL-01",
  salary: 20000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.supervisor,
  department: "Supervisor",
  role: "Supervisor",
  phoneNumber: "9000000002",
  salary: 25000,
  status: "Active",
});
// Dedicated crew for the full real-UI Step 1→5 flow spec, so its resources are
// never subtracted from the pool the other specs pick Step 1 crew from
// (available-resources excludes crew on a Draft + started trip).
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.driver2,
  department: "Driver",
  role: "Driver",
  phoneNumber: "9000000021",
  licenseNumber: "E2E-DL-02",
  salary: 20000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.supervisor2,
  department: "Supervisor",
  role: "Supervisor",
  phoneNumber: "9000000022",
  salary: 25000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.helper2,
  department: "Helper",
  role: "Helper",
  phoneNumber: "9000000023",
  salary: 12000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.loader2,
  department: "Loader",
  role: "Loader",
  phoneNumber: "9000000024",
  salary: 12000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.helper,
  department: "Helper",
  role: "Helper",
  phoneNumber: "9000000003",
  salary: 12000,
  status: "Active",
});
await mastersService.upsertEmployee({
  employeeName: E2E_SEED.loader,
  department: "Loader",
  role: "Loader",
  phoneNumber: "9000000004",
  salary: 12000,
  status: "Active",
});
await mastersService.upsertFarm({
  farmName: E2E_SEED.farm,
  ownerName: "Farm Owner",
  supervisorName: "Farm Super",
  phoneNumber: "9000000005",
  village: "E2E Village",
  address: "E2E Farm Address",
  capacity: 50000,
  status: "Active",
});
await mastersService.upsertBirdType({
  birdType: E2E_SEED.birdType,
  averageWeight: 2.4,
  description: "E2E broiler",
  status: "Active",
});
for (let i = 0; i < E2E_SEED.shops.length; i += 1) {
  await mastersService.upsertShop({
    shopName: E2E_SEED.shops[i],
    ownerName: `Shop Owner ${i + 1}`,
    phoneNumber: `90100000${String(i + 1).padStart(2, "0")}`,
    email: `e2e-shop-${i + 1}@example.com`,
    associationType: "Ass Vij",
    city: "E2E City",
    address: `E2E Shop Address ${i + 1}`,
    status: "Active",
  });
}

// The E2E Vite app runs on :5199 (see playwright.config.ts). A specific origin
// is required because the server also sends Access-Control-Allow-Credentials.
const E2E_FRONTEND_ORIGINS =
  process.env.E2E_FRONTEND_ORIGINS ?? "http://localhost:5199,http://127.0.0.1:5199";

// ── Pre-seed a fully-completed PENDING trip so the lifecycle/edit E2E tests
//    have deterministic state without replaying the photo/balance-gated wizard.
const { pool } = await import("../src/config/db.js");
const veh = await pool.query<{ id: number }>(`SELECT id FROM vehicles WHERE vehicle_number = $1`, [E2E_SEED.vehicleNo2]);
const drv = await pool.query<{ id: number }>(`SELECT id FROM employees WHERE employee_name = $1`, [E2E_SEED.driver]);
const sup = await pool.query<{ id: number }>(`SELECT id FROM employees WHERE employee_name = $1`, [E2E_SEED.supervisor]);
const farmRow = await pool.query<{ id: number }>(`SELECT id FROM farms WHERE farm_name = $1`, [E2E_SEED.farm]);
const btRow = await pool.query<{ id: number }>(`SELECT id FROM bird_types WHERE bird_type = $1`, [E2E_SEED.birdType]);
const pendingNo = E2E_SEED.pendingTripNo;
await pool.query(
  `INSERT INTO trips
     (trip_no, trip_date, status, vehicle_id, vehicle_no, driver_id, driver_name,
      supervisor_id, supervisor_name, opening_meter, source_farm_id, source_farm,
      farm_bird_type_id, farm_bird_type, farm_address, dest_meter, avg_bird_weight,
      closing_meter, end_meter,
      start_step_submitted, farm_step_submitted, pickup_step_submitted,
      delivery_step_submitted, end_step_submitted, expenses_step_submitted,
      start_step_submitted_at, farm_step_submitted_at, pickup_step_submitted_at,
      deliveries_step_submitted_at, expenses_step_submitted_at, submitted_at, created_at)
   VALUES ($1,$2,'Pending',$3,$4,$5,$6,$7,$8,90000,$9,$10,$11,$12,'Seed Farm Address',90120,2.4,
      90600,90600,
      TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,
      NOW(),NOW(),NOW(),NOW(),NOW(),NOW(),NOW())`,
  [
    pendingNo, "2026-01-01",
    veh.rows[0].id, E2E_SEED.vehicleNo2,
    drv.rows[0].id, E2E_SEED.driver,
    sup.rows[0].id, E2E_SEED.supervisor,
    farmRow.rows[0].id, E2E_SEED.farm,
    btRow.rows[0].id, E2E_SEED.birdType,
  ]
);
// eslint-disable-next-line no-console
console.log(`[e2e-harness] pre-seeded PENDING trip ${pendingNo}`);

// The full real-UI Step 1→5 flow spec creates its own trip on E2E-TRUCK-03
// entirely through the browser — no trip is pre-seeded here for it.

const child: ChildProcess = spawn(
  process.execPath,
  ["--import", "tsx", "tests/helpers/runTestServer.ts"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      CORS_ORIGIN: E2E_FRONTEND_ORIGINS,
      DATABASE_URL: db.url,
    },
    stdio: "inherit",
  }
);

let stopping = false;
async function stop(code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  try {
    const { pool } = await import("../src/config/db.js");
    await shutdownTestEnv({ testDb: db, pool });
  } catch {
    /* best effort */
  }
  process.exit(code);
}
process.on("SIGTERM", () => void stop(0));
process.on("SIGINT", () => void stop(0));
child.on("exit", (code) => void stop(code ?? 0));

// eslint-disable-next-line no-console
console.log(`[e2e-harness] backend on http://127.0.0.1:${PORT}  (isolated PGlite, seeded)`);
