/**
 * seed-demo-data.ts
 * -----------------------------------------------------------------------------
 * DEVELOPMENT-ONLY seeding script for the DMR Poultries ERP Trip Entry workflow.
 *
 * This script MUST NEVER run automatically or in production.
 * It is intended to be run manually by a developer only:
 *
 *   npm run seed:demo
 *
 * What it does
 *  1. Verifies required Master data (Employees, Vehicles, Farms, Shops, Banks,
 *     Bird Types). Reuses any existing master; creates only missing ones.
 *  2. Generates realistic poultry-business Trips at every draft stage:
 *       - 31-Jul-2026  Draft  · resumes at Step 4 (Diesel & Expenses)
 *       - 01-Aug-2026  Draft  · resumes at Step 3 (Shop Delivery)
 *       - 02-Aug-2026  Draft  · resumes at Step 2 (Farm Loading)
 *       - 03-Aug-2026  Draft  · resumes at Step 1 (Trip Header)
 *       - 04-Aug-2026  Pending (wizard complete)
 *       - 05-Aug-2026  Completed (approved)
 *       - 06-Aug-2026  Deleted (soft deleted)
 *  3. Populates every child record (trip_crew, trip_boxes, trip_deliveries,
 *     trip_delivery_boxes, trip_delivery_per_box, trip_diesel_entries,
 *     trip_media, fuel_expenses) against the same Trip ID.
 *
 * Idempotency
 *  - Masters are matched by unique business key (name / number / type).
 *  - Trips are matched by unique trip_no; existing trips are reused untouched.
 *  - Fuel expenses are matched by unique bill_no.
 *  - Running this script repeatedly NEVER creates duplicates and NEVER
 *    overwrites user-entered production data.
 * -----------------------------------------------------------------------------
 */
import { pool, query } from "../config/db.js";
import { mastersService } from "../services/mastersService.js";
import { tripsService } from "../services/tripsService.js";
import { fuelExpensesService } from "../services/fuelExpensesService.js";
import type {
  Bank,
  BirdType,
  BoxDetail,
  Employee,
  Farm,
  Shop,
  ShopDelivery,
  Trip,
  TripStatus,
  Vehicle,
} from "../types/models.js";

// Tiny 1x1 transparent PNG — used as a realistic placeholder for DC photo blobs.
const DC_PHOTO_PLACEHOLDER =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Master data helpers — verify, reuse, create-if-missing (never duplicate)
// ---------------------------------------------------------------------------

async function findOrCreateEmployee(input: {
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  salary: number;
  licenseNumber?: string | null;
  joiningDate?: string | null;
}): Promise<Employee> {
  const existing = (await mastersService.listEmployees()).find(
    (e) => e.employeeName.trim().toLowerCase() === input.employeeName.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse employee : ${existing.employeeName} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertEmployee({
    ...input,
    status: "Active",
  });
  console.log(`Create employee: ${created.employeeName} (id=${created.id})`);
  return created;
}

async function findOrCreateVehicle(input: {
  vehicleNumber: string;
  vehicleType: string;
  noOfBoxes: number;
  birdCapacity: number;
  capacityKg: number;
  engineNumber: string;
  chassisNumber: string;
}): Promise<Vehicle> {
  const existing = (await mastersService.listVehicles()).find(
    (v) =>
      v.vehicleNumber.trim().toLowerCase() === input.vehicleNumber.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse vehicle  : ${existing.vehicleNumber} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertVehicle({
    ...input,
    status: "Active",
  });
  console.log(`Create vehicle : ${created.vehicleNumber} (id=${created.id})`);
  return created;
}

async function findOrCreateFarm(input: {
  farmName: string;
  ownerName: string;
  supervisorName: string;
  phoneNumber: string;
  village: string;
  address: string;
  capacity: number;
}): Promise<Farm> {
  const existing = (await mastersService.listFarms()).find(
    (f) => f.farmName.trim().toLowerCase() === input.farmName.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse farm     : ${existing.farmName} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertFarm({
    ...input,
    status: "Active",
  });
  console.log(`Create farm    : ${created.farmName} (id=${created.id})`);
  return created;
}

async function findOrCreateShop(input: {
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  village: string;
}): Promise<Shop> {
  const existing = (await mastersService.listShops()).find(
    (s) => s.shopName.trim().toLowerCase() === input.shopName.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse shop     : ${existing.shopName} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertShop({
    ...input,
    status: "Active",
  });
  console.log(`Create shop    : ${created.shopName} (id=${created.id})`);
  return created;
}

async function findOrCreateBank(input: {
  bankName: string;
  branch: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
}): Promise<Bank> {
  const existing = (await mastersService.listBanks()).find(
    (b) =>
      b.bankName.trim().toLowerCase() === input.bankName.trim().toLowerCase() &&
      b.branch.trim().toLowerCase() === input.branch.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse bank     : ${existing.bankName} / ${existing.branch} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertBank({
    ...input,
    status: "Active",
  });
  console.log(`Create bank    : ${created.bankName} / ${created.branch} (id=${created.id})`);
  return created;
}

async function findOrCreateBirdType(input: {
  birdType: string;
  averageWeight: number;
  description: string;
}): Promise<BirdType> {
  const existing = (await mastersService.listBirdTypes()).find(
    (b) => b.birdType.trim().toLowerCase() === input.birdType.trim().toLowerCase()
  );
  if (existing) {
    console.log(`Reuse bird type: ${existing.birdType} (id=${existing.id})`);
    return existing;
  }
  const created = await mastersService.upsertBirdType({
    ...input,
    status: "Active",
  });
  console.log(`Create bird type: ${created.birdType} (id=${created.id})`);
  return created;
}

// ---------------------------------------------------------------------------
// Trip data builders
// ---------------------------------------------------------------------------

async function tripExists(tripNo: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT id FROM trips WHERE trip_no = $1`,
    [tripNo]
  );
  return result.rowCount ? Number(result.rows[0].id) : null;
}

/** Generate a full set of pickup boxes for a bird count, e.g. 70 boxes @ 4200 birds. */
function buildBoxes(birdCount: number, boxCount: number, avgWeight: number): BoxDetail[] {
  const perBox = Math.floor(birdCount / boxCount);
  const remainder = birdCount % boxCount;
  const boxes: BoxDetail[] = [];
  for (let i = 1; i <= boxCount; i++) {
    const birds = perBox + (i <= remainder ? 1 : 0);
    boxes.push({
      boxNo: i,
      birds,
      weight: round3(birds * avgWeight),
    });
  }
  return boxes;
}

/**
 * Split loaded boxes across three shops, applying realistic mortality.
 * Populates trip_deliveries (shop name, birds, weight, mortality, rate, amount),
 * trip_delivery_boxes (selectedBoxIds) and trip_delivery_per_box (perBoxData).
 */
function buildDeliveries(opts: {
  boxes: BoxDetail[];
  shops: { id: number; shopName: string }[];
  birdTypeId: number;
  birdType: string;
  rate: number;
  tripDate: string;
  boxSplit: [number, number, number];
  mortality: [number, number, number];
}): ShopDelivery[] {
  const { boxes, shops, birdTypeId, birdType, rate, tripDate, boxSplit, mortality } = opts;
  let cursor = 0;
  return shops.map((shop, idx) => {
    const count = boxSplit[idx];
    const shopBoxes = boxes.slice(cursor, cursor + count);
    cursor += count;

    const birdsLoaded = shopBoxes.reduce((sum, b) => sum + b.birds, 0);
    const weightLoaded = round3(shopBoxes.reduce((sum, b) => sum + b.weight, 0));
    const dead = mortality[idx];
    const mortKg = round3(dead * 2.0); // ~2 kg per dead bird
    const birds = birdsLoaded - dead;
    const weight = round3(weightLoaded - mortKg);
    const amount = Math.round(weight * rate);

    return {
      id: 0,
      serialNo: idx + 1,
      shopId: shop.id,
      shopName: shop.shopName,
      birdTypeId,
      birdType,
      birds,
      weight,
      mortality: dead,
      mortKg,
      rate,
      amount,
      remarks: "",
      deliveryMode: "box",
      selectedBoxIds: shopBoxes.map((b) => b.boxNo),
      farmBirds: birdsLoaded,
      farmWeight: weightLoaded,
      perBoxData: shopBoxes.map((b) => ({ boxNo: b.boxNo, birds: b.birds, weight: b.weight })),
      autoCaptureTime: `${tripDate}T${String(9 + idx).padStart(2, "0")}:20:00.000Z`,
    };
  });
}

/** Compute trip-level KPIs from boxes + deliveries. */
function computeKpis(opts: {
  boxes: BoxDetail[];
  deliveries: ShopDelivery[];
  farmBirdCount: number;
  farmLoadWeight: number;
}) {
  const { boxes, deliveries, farmBirdCount, farmLoadWeight } = opts;
  const totalWeight = round3(boxes.reduce((sum, b) => sum + b.weight, 0));
  const totalDeliveredWeight = round3(
    deliveries.reduce((sum, d) => sum + d.weight, 0)
  );
  const totalBirdsDelivered = deliveries.reduce((sum, d) => sum + d.birds, 0);
  const totalMortalityCount = deliveries.reduce((sum, d) => sum + d.mortality, 0);
  const totalMortalityWeight = round3(
    deliveries.reduce((sum, d) => sum + (d.mortKg ?? 0), 0)
  );
  const weightLoss = round3(
    farmLoadWeight - totalDeliveredWeight - totalMortalityWeight
  );
  const survivalRate =
    farmBirdCount > 0 ? round4(totalBirdsDelivered / farmBirdCount) : 0;

  return {
    totalWeight,
    totalDeliveredWeight,
    totalBirdsDelivered,
    totalMortalityCount,
    totalMortalityWeight,
    weightLoss,
    survivalRate,
  };
}

function tripHeader(opts: {
  tripDate: string;
  vehicle: Vehicle;
  driver: Employee;
  supervisor: Employee;
  helper: Employee;
  loader: Employee;
  openingMeter: number;
  advanceAmount: number;
  remarks: string;
}) {
  const { tripDate, vehicle, driver, supervisor, helper, loader } = opts;
  return {
    tripDate,
    startTime: `${tripDate}T05:30:00.000Z`,
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    helpers: [helper.employeeName],
    loaders: [loader.employeeName],
    openingMeter: opts.openingMeter,
    advanceAmount: opts.advanceAmount,
    remarks: opts.remarks,
  };
}

/**
 * Idempotent trip creator. Reuses the existing trip when trip_no already exists,
 * otherwise creates it via tripsService.save (the production wizard autosave path).
 *
 * Returns `{ id, created }` so callers can decide whether to apply status
 * transitions (e.g. Completed / Deleted) only on first creation — never on a
 * re-run, preserving user-entered status changes.
 */
async function createTrip(
  tripNo: string,
  tripDate: string,
  data: Partial<Trip> & Record<string, unknown>,
  options: { status?: TripStatus } = {}
): Promise<{ id: number; created: boolean }> {
  const existingId = await tripExists(tripNo);
  if (existingId != null) {
    console.log(`Reuse trip     : ${tripNo} (id=${existingId})`);
    return { id: existingId, created: false };
  }
  const trip = await tripsService.save(null, {
    tripNo,
    tripDate,
    status: options.status ?? "Draft",
    ...data,
  });
  console.log(`Created trip   : ${trip.tripNo} (id=${trip.id}, status=${trip.status})`);
  return { id: trip.id, created: true };
}

async function findOrCreateFuelExpense(opts: {
  billNo: string;
  billDate: string;
  tripId: number;
  vehicle: Vehicle;
  driver: Employee;
  supervisor: Employee;
  liters: number;
  fuelRate: number;
  currentMeter: number;
  pumpName: string;
  status: "Approved" | "Pending Approval";
}): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM fuel_expenses WHERE bill_no = $1`,
    [opts.billNo]
  );
  if (existing.rowCount) {
    console.log(`Reuse fuel     : ${opts.billNo} (id=${existing.rows[0].id})`);
    return existing.rows[0].id;
  }

  const expense = await fuelExpensesService.create({
    billNo: opts.billNo,
    billDate: opts.billDate,
    vehicleId: opts.vehicle.id,
    vehicleNo: opts.vehicle.vehicleNumber,
    driverId: opts.driver.id,
    driverName: opts.driver.employeeName,
    supervisorId: opts.supervisor.id,
    supervisorName: opts.supervisor.employeeName,
    tripId: opts.tripId,
    currentMeter: opts.currentMeter,
    fuelRate: opts.fuelRate,
    liters: opts.liters,
    amount: Math.round(opts.liters * opts.fuelRate),
    pumpName: opts.pumpName,
    remarks: null,
    createdBy: "seed:demo",
  });

  if (opts.status === "Approved") {
    await fuelExpensesService.approve(expense.id, { approvedBy: "DMR Management" });
  }

  console.log(`Created fuel   : ${opts.billNo} (id=${expense.id}, status=${opts.status})`);
  return expense.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("==============================================================");
  console.log("DMR Poultries — seed-demo-data");
  console.log("Reusing existing masters/trips; creating only what is missing.");
  console.log("==============================================================");

  // ------------------------- MASTER DATA -------------------------
  console.log("\n--- Master data ---");

  const rahim = await findOrCreateEmployee({
    employeeName: "Rahim",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9000000011",
    licenseNumber: "AP09-2017-0000013",
    salary: 18000,
    joiningDate: "2022-03-15",
  });
  const ruhulla = await findOrCreateEmployee({
    employeeName: "Ruhulla",
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: "9000000012",
    salary: 24000,
    joiningDate: "2021-06-01",
  });
  const kareem = await findOrCreateEmployee({
    employeeName: "Kareem",
    department: "Helper",
    role: "Helper",
    phoneNumber: "9000000013",
    salary: 13000,
    joiningDate: "2023-01-10",
  });
  const saleem = await findOrCreateEmployee({
    employeeName: "Saleem",
    department: "Loader",
    role: "Loader",
    phoneNumber: "9000000014",
    salary: 13000,
    joiningDate: "2023-02-20",
  });

  const ap16 = await findOrCreateVehicle({
    vehicleNumber: "AP16AB1234",
    vehicleType: "Heavy Truck",
    noOfBoxes: 85,
    birdCapacity: 4500,
    capacityKg: 10500,
    engineNumber: "ENG160001",
    chassisNumber: "CHS160001",
  });
  const tata407 = await findOrCreateVehicle({
    vehicleNumber: "AP16AC5678",
    vehicleType: "Tata 407",
    noOfBoxes: 50,
    birdCapacity: 2300,
    capacityKg: 5000,
    engineNumber: "ENG160002",
    chassisNumber: "CHS160002",
  });

  const lakshmiFarm = await findOrCreateFarm({
    farmName: "Sri Lakshmi Poultry Farm",
    ownerName: "Lakshmi Narayana",
    supervisorName: "Venkatesh",
    phoneNumber: "9652000011",
    village: "Kankipadu",
    address: "Kankipadu, Krishna District, Andhra Pradesh",
    capacity: 30000,
  });

  const shopA = await findOrCreateShop({
    shopName: "New Hyderabad Chicken Center",
    ownerName: "Mohammed Irfan",
    phoneNumber: "9885000011",
    village: "Vijayawada",
  });
  const shopB = await findOrCreateShop({
    shopName: "Bismillah Chicken Shop",
    ownerName: "Bismillah Traders",
    phoneNumber: "9885000012",
    village: "Gunadala",
  });
  const shopC = await findOrCreateShop({
    shopName: "Royal Chicken Center",
    ownerName: "Srinivas",
    phoneNumber: "9885000013",
    village: "Patamata",
  });

  const bank = await findOrCreateBank({
    bankName: "SBI",
    branch: "Main Branch",
    accountNumber: "38765432109",
    ifscCode: "SBIN0001234",
    upiId: "dmrpoultries@sbi",
  });

  const broiler = await findOrCreateBirdType({
    birdType: "Broiler",
    averageWeight: 2.35,
    description: "Commercial broiler chicken",
  });

  console.log("\n--- Trip data ---");

  // ------------------------------------------------------------------
  // TRIP 1 — 31-Jul-2026 · Draft · resumes at Step 4 (Diesel & Expenses)
  // Steps 1–4 saved; diesel & expenses entered; Review not submitted.
  // ------------------------------------------------------------------
  const trip1Boxes = buildBoxes(4200, 70, 2.35); // 70 x 60 birds = 4200 birds, 9870 kg
  const trip1Deliveries = buildDeliveries({
    boxes: trip1Boxes,
    shops: [shopA, shopB, shopC],
    birdTypeId: broiler.id,
    birdType: broiler.birdType,
    rate: 118,
    tripDate: "2026-07-31",
    boxSplit: [25, 23, 22],
    mortality: [8, 6, 5],
  });
  const trip1Kpis = computeKpis({
    boxes: trip1Boxes,
    deliveries: trip1Deliveries,
    farmBirdCount: 4200,
    farmLoadWeight: 9870,
  });
  const trip1 = await createTrip("TRIP-20260731-001", "2026-07-31", {
    ...tripHeader({
      tripDate: "2026-07-31",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 31200,
      advanceAmount: 2000,
      remarks: "Draft — diesel & expenses entered; Review not submitted.",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-07-31T07:05:00.000Z",
    destMeter: 31395,
    pickupTolls: 150,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.35,
    farmRemarks: "Batch healthy — 4200 birds loaded in 70 boxes.",
    farmStepSubmitted: true,

    boxDetails: trip1Boxes,
    totalBirds: 4200,
    dcWeight: 9870,
    boxes: 70,
    avgWeight: 2.35,
    pickupLoadTime: "2026-07-31T07:55:00.000Z",
    dcPhotoKey: "dc-photo-trip-20260731",
    dcPhotoData: DC_PHOTO_PLACEHOLDER,
    dcPhotoMime: "image/png",
    pickupStepSubmitted: true,

    farmBirdTypeId: broiler.id,
    farmBirdType: broiler.birdType,
    farmBirdCount: 4200,
    farmLoadWeight: 9870,
    farmRate: 118,
    farmAmount: Math.round(9870 * 118),

    deliveries: trip1Deliveries,
    deliveryStepSubmitted: true,

    closingMeter: 31690,
    endMeter: 31690,
    endTime: "2026-07-31T16:40:00.000Z",
    deliveryTolls: 120,
    destinationTolls: 120,
    meals: 450,
    loading: 850,
    mealsTiffin: 200,
    vehicleMaintenance: 0,
    othersRC: 250,
    dieselEntries: [
      { rowIndex: 1, litres: 42, rate: 97, meter: 32100, bunkName: "HP Petrol Bunk" },
    ],
    fuel: 4074,
    expense: 0,
    driverBata: 500,
    helperBata: 400,

    totalKm: 490,
    totalShops: 3,
    ...trip1Kpis,
    lastShop: shopC.shopName,

    endStepSubmitted: false,
    expensesStepSubmitted: false,
  });

  // ------------------------------------------------------------------
  // TRIP 2 — 01-Aug-2026 · Draft · resumes at Step 3 (Shop Delivery)
  // Steps 1 & 2 submitted; shop deliveries autosaved but not submitted.
  // ------------------------------------------------------------------
  const trip2Boxes = buildBoxes(4100, 68, 2.3); // 68 boxes, 9430 kg
  const trip2Deliveries = buildDeliveries({
    boxes: trip2Boxes,
    shops: [shopA, shopB, shopC],
    birdTypeId: broiler.id,
    birdType: broiler.birdType,
    rate: 116,
    tripDate: "2026-08-01",
    boxSplit: [24, 22, 22],
    mortality: [6, 5, 4],
  });
  const trip2Kpis = computeKpis({
    boxes: trip2Boxes,
    deliveries: trip2Deliveries,
    farmBirdCount: 4100,
    farmLoadWeight: 9430,
  });
  const trip2 = await createTrip("TRIP-20260801-001", "2026-08-01", {
    ...tripHeader({
      tripDate: "2026-08-01",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 31350,
      advanceAmount: 2000,
      remarks: "Draft — shop deliveries entered; diesel & expenses not started.",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-08-01T07:10:00.000Z",
    destMeter: 31540,
    pickupTolls: 180,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.3,
    farmRemarks: "4100 birds loaded in 68 boxes.",
    farmStepSubmitted: true,

    boxDetails: trip2Boxes,
    totalBirds: 4100,
    dcWeight: 9430,
    boxes: 68,
    avgWeight: 2.3,
    pickupLoadTime: "2026-08-01T08:05:00.000Z",
    dcPhotoKey: "dc-photo-trip-20260801",
    dcPhotoData: DC_PHOTO_PLACEHOLDER,
    dcPhotoMime: "image/png",
    pickupStepSubmitted: true,

    farmBirdTypeId: broiler.id,
    farmBirdType: broiler.birdType,
    farmBirdCount: 4100,
    farmLoadWeight: 9430,
    farmRate: 116,
    farmAmount: Math.round(9430 * 116),

    deliveries: trip2Deliveries,
    deliveryStepSubmitted: false,

    totalKm: 0,
    totalShops: 3,
    ...trip2Kpis,
    lastShop: shopC.shopName,
  });

  // ------------------------------------------------------------------
  // TRIP 3 — 02-Aug-2026 · Draft · resumes at Step 2 (Farm Loading)
  // Step 1 submitted; farm loading autosaved but not submitted.
  // ------------------------------------------------------------------
  const trip3 = await createTrip("TRIP-20260802-001", "2026-08-02", {
    ...tripHeader({
      tripDate: "2026-08-02",
      vehicle: tata407,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 18900,
      advanceAmount: 1500,
      remarks: "Draft — farm loading in progress; 2100 bird batch on Tata 407.",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-08-02T07:20:00.000Z",
    destMeter: 19110,
    pickupTolls: 200,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.35,
    farmRemarks: "Loading in progress — 2100 birds batched.",
    farmStepSubmitted: false,
  });

  // ------------------------------------------------------------------
  // TRIP 4 — 03-Aug-2026 · Draft · resumes at Step 1 (Trip Header)
  // Only the Trip Header is saved; everything else empty.
  // ------------------------------------------------------------------
  const trip4 = await createTrip("TRIP-20260803-001", "2026-08-03", {
    ...tripHeader({
      tripDate: "2026-08-03",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 32850,
      advanceAmount: 2000,
      remarks: "New draft — only Trip Header saved.",
    }),
    startStepSubmitted: false,
  });

  // ------------------------------------------------------------------
  // TRIP 5 — 04-Aug-2026 · Pending · completed wizard
  // ------------------------------------------------------------------
  const trip5Boxes = buildBoxes(4300, 72, 2.37); // 10191 kg
  const trip5Deliveries = buildDeliveries({
    boxes: trip5Boxes,
    shops: [shopA, shopB, shopC],
    birdTypeId: broiler.id,
    birdType: broiler.birdType,
    rate: 120,
    tripDate: "2026-08-04",
    boxSplit: [26, 24, 22],
    mortality: [9, 7, 6],
  });
  const trip5Kpis = computeKpis({
    boxes: trip5Boxes,
    deliveries: trip5Deliveries,
    farmBirdCount: 4300,
    farmLoadWeight: 10191,
  });
  const trip5 = await createTrip("TRIP-20260804-001", "2026-08-04", {
    ...tripHeader({
      tripDate: "2026-08-04",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 31800,
      advanceAmount: 2500,
      remarks: "Wizard completed — awaiting approval.",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-08-04T07:00:00.000Z",
    destMeter: 32010,
    pickupTolls: 200,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.37,
    farmRemarks: "Full load — 4300 birds in 72 boxes.",
    farmStepSubmitted: true,

    boxDetails: trip5Boxes,
    totalBirds: 4300,
    dcWeight: 10191,
    boxes: 72,
    avgWeight: 2.37,
    pickupLoadTime: "2026-08-04T07:50:00.000Z",
    dcPhotoKey: "dc-photo-trip-20260804",
    dcPhotoData: DC_PHOTO_PLACEHOLDER,
    dcPhotoMime: "image/png",
    pickupStepSubmitted: true,

    farmBirdTypeId: broiler.id,
    farmBirdType: broiler.birdType,
    farmBirdCount: 4300,
    farmLoadWeight: 10191,
    farmRate: 120,
    farmAmount: Math.round(10191 * 120),

    deliveries: trip5Deliveries,
    deliveryStepSubmitted: true,

    closingMeter: 32260,
    endMeter: 32260,
    endTime: "2026-08-04T17:00:00.000Z",
    deliveryTolls: 140,
    destinationTolls: 140,
    meals: 500,
    loading: 900,
    mealsTiffin: 200,
    vehicleMaintenance: 0,
    othersRC: 250,
    dieselEntries: [
      { rowIndex: 1, litres: 42, rate: 97, meter: 32650, bunkName: "Indian Oil Bunk" },
    ],
    fuel: 4074,
    expense: 0,
    driverBata: 500,
    helperBata: 400,

    totalKm: 460,
    totalShops: 3,
    ...trip5Kpis,
    lastShop: shopC.shopName,

    submittedAt: "2026-08-04T17:00:00.000Z",
    endStepSubmitted: true,
    expensesStepSubmitted: true,
  }, { status: "Pending" });

  // ------------------------------------------------------------------
  // TRIP 6 — 05-Aug-2026 · Completed (approved)
  // ------------------------------------------------------------------
  const trip6Boxes = buildBoxes(4150, 70, 2.35); // 9753 kg
  const trip6Deliveries = buildDeliveries({
    boxes: trip6Boxes,
    shops: [shopA, shopB, shopC],
    birdTypeId: broiler.id,
    birdType: broiler.birdType,
    rate: 119,
    tripDate: "2026-08-05",
    boxSplit: [25, 23, 22],
    mortality: [7, 5, 4],
  });
  const trip6Kpis = computeKpis({
    boxes: trip6Boxes,
    deliveries: trip6Deliveries,
    farmBirdCount: 4150,
    farmLoadWeight: 9753,
  });
  const trip6 = await createTrip("TRIP-20260805-001", "2026-08-05", {
    ...tripHeader({
      tripDate: "2026-08-05",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 32850,
      advanceAmount: 2000,
      remarks: "Completed — approved and settled.",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-08-05T07:15:00.000Z",
    destMeter: 33045,
    pickupTolls: 160,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.35,
    farmRemarks: "Full load — 4150 birds in 70 boxes.",
    farmStepSubmitted: true,

    boxDetails: trip6Boxes,
    totalBirds: 4150,
    dcWeight: 9753,
    boxes: 70,
    avgWeight: 2.35,
    pickupLoadTime: "2026-08-05T08:00:00.000Z",
    dcPhotoKey: "dc-photo-trip-20260805",
    dcPhotoData: DC_PHOTO_PLACEHOLDER,
    dcPhotoMime: "image/png",
    pickupStepSubmitted: true,

    farmBirdTypeId: broiler.id,
    farmBirdType: broiler.birdType,
    farmBirdCount: 4150,
    farmLoadWeight: 9753,
    farmRate: 119,
    farmAmount: Math.round(9753 * 119),

    deliveries: trip6Deliveries,
    deliveryStepSubmitted: true,

    closingMeter: 33305,
    endMeter: 33305,
    endTime: "2026-08-05T16:55:00.000Z",
    deliveryTolls: 130,
    destinationTolls: 130,
    meals: 450,
    loading: 850,
    mealsTiffin: 200,
    vehicleMaintenance: 0,
    othersRC: 250,
    dieselEntries: [
      { rowIndex: 1, litres: 40, rate: 96.5, meter: 33750, bunkName: "HP Petrol Bunk" },
    ],
    fuel: 3860,
    expense: 0,
    driverBata: 500,
    helperBata: 400,

    totalKm: 455,
    totalShops: 3,
    ...trip6Kpis,
    lastShop: shopC.shopName,

    submittedAt: "2026-08-05T16:55:00.000Z",
    endStepSubmitted: true,
    expensesStepSubmitted: true,
  });

  // Mark Trip 6 as Completed via the existing approval workflow — only on first creation.
  if (trip6.created) {
    await tripsService.updateStatus(trip6.id, {
      status: "Completed",
      approvedBy: "DMR Management",
    });
    console.log(`Trip status   : TRIP-20260805-001 -> Completed (approved)`);
  }

  // ------------------------------------------------------------------
  // TRIP 7 — 06-Aug-2026 · Deleted (soft deleted)
  // ------------------------------------------------------------------
  const trip7Boxes = buildBoxes(4000, 67, 2.345); // 9380 kg
  const trip7Deliveries = buildDeliveries({
    boxes: trip7Boxes,
    shops: [shopA, shopB, shopC],
    birdTypeId: broiler.id,
    birdType: broiler.birdType,
    rate: 115,
    tripDate: "2026-08-06",
    boxSplit: [24, 22, 21],
    mortality: [10, 8, 6],
  });
  const trip7Kpis = computeKpis({
    boxes: trip7Boxes,
    deliveries: trip7Deliveries,
    farmBirdCount: 4000,
    farmLoadWeight: 9380,
  });
  const trip7 = await createTrip("TRIP-20260806-001", "2026-08-06", {
    ...tripHeader({
      tripDate: "2026-08-06",
      vehicle: ap16,
      driver: rahim,
      supervisor: ruhulla,
      helper: kareem,
      loader: saleem,
      openingMeter: 33600,
      advanceAmount: 1000,
      remarks: "Deleted — load rejected at farm (high mortality detected).",
    }),
    startStepSubmitted: true,

    sourceFarmId: lakshmiFarm.id,
    sourceFarm: lakshmiFarm.farmName,
    reachedTime: "2026-08-06T07:30:00.000Z",
    destMeter: 33780,
    pickupTolls: 100,
    farmAddress: lakshmiFarm.address,
    avgBirdWeight: 2.345,
    farmRemarks: "Rejected — batch mortality above acceptable threshold.",
    farmStepSubmitted: true,

    boxDetails: trip7Boxes,
    totalBirds: 4000,
    dcWeight: 9380,
    boxes: 67,
    avgWeight: 2.345,
    pickupLoadTime: "2026-08-06T08:30:00.000Z",
    dcPhotoKey: "dc-photo-trip-20260806",
    dcPhotoData: DC_PHOTO_PLACEHOLDER,
    dcPhotoMime: "image/png",
    pickupStepSubmitted: true,

    farmBirdTypeId: broiler.id,
    farmBirdType: broiler.birdType,
    farmBirdCount: 4000,
    farmLoadWeight: 9380,
    farmRate: 115,
    farmAmount: Math.round(9380 * 115),

    deliveries: trip7Deliveries,
    deliveryStepSubmitted: true,

    closingMeter: 33820,
    endMeter: 33820,
    endTime: "2026-08-06T09:10:00.000Z",
    deliveryTolls: 0,
    destinationTolls: 0,
    meals: 0,
    loading: 0,
    mealsTiffin: 0,
    vehicleMaintenance: 0,
    othersRC: 0,
    dieselEntries: [
      { rowIndex: 1, litres: 38, rate: 97, meter: 34220, bunkName: "Reliance Bunk" },
    ],
    fuel: 3686,
    expense: 0,
    driverBata: 500,
    helperBata: 400,

    totalKm: 220,
    totalShops: 3,
    ...trip7Kpis,
    lastShop: shopC.shopName,

    endStepSubmitted: true,
    expensesStepSubmitted: true,
  });

  // Soft-delete Trip 7 via the existing soft-delete path — only on first creation.
  if (trip7.created) {
    await tripsService.softDelete(
      trip7.id,
      "Load rejected at farm — high mortality detected."
    );
    console.log(`Trip status   : TRIP-20260806-001 -> Deleted (soft deleted)`);
  }

  // ------------------------- FUEL EXPENSES -------------------------
  console.log("\n--- Fuel expenses ---");

  await findOrCreateFuelExpense({
    billNo: "FUEL-20260731-001",
    billDate: "2026-07-31",
    tripId: trip1.id,
    vehicle: ap16,
    driver: rahim,
    supervisor: ruhulla,
    liters: 42,
    fuelRate: 97,
    currentMeter: 32100,
    pumpName: "HP Petrol Bunk",
    status: "Pending Approval",
  });

  await findOrCreateFuelExpense({
    billNo: "FUEL-20260804-001",
    billDate: "2026-08-04",
    tripId: trip5.id,
    vehicle: ap16,
    driver: rahim,
    supervisor: ruhulla,
    liters: 42,
    fuelRate: 97,
    currentMeter: 32650,
    pumpName: "Indian Oil Bunk",
    status: "Pending Approval",
  });

  await findOrCreateFuelExpense({
    billNo: "FUEL-20260805-001",
    billDate: "2026-08-05",
    tripId: trip6.id,
    vehicle: ap16,
    driver: rahim,
    supervisor: ruhulla,
    liters: 40,
    fuelRate: 96.5,
    currentMeter: 33750,
    pumpName: "HP Petrol Bunk",
    status: "Approved",
  });

  await findOrCreateFuelExpense({
    billNo: "FUEL-20260806-001",
    billDate: "2026-08-06",
    tripId: trip7.id,
    vehicle: ap16,
    driver: rahim,
    supervisor: ruhulla,
    liters: 38,
    fuelRate: 97,
    currentMeter: 34220,
    pumpName: "Reliance Bunk",
    status: "Pending Approval",
  });

  // ------------------------- SUMMARY -------------------------
  console.log("\n==============================================================");
  console.log("Seed summary");
  console.log("==============================================================");
  console.log("Masters:");
  console.log(`  Employees   : ${rahim.employeeName}, ${ruhulla.employeeName}, ${kareem.employeeName}, ${saleem.employeeName}`);
  console.log(`  Vehicles    : ${ap16.vehicleNumber}, ${tata407.vehicleNumber} (${tata407.vehicleType})`);
  console.log(`  Farm        : ${lakshmiFarm.farmName}`);
  console.log(`  Shops       : ${shopA.shopName}, ${shopB.shopName}, ${shopC.shopName}`);
  console.log(`  Bank        : ${bank.bankName} / ${bank.branch}`);
  console.log(`  Bird type   : ${broiler.birdType}`);
  console.log("Trips:");
  console.log(`  TRIP-20260731-001 (id=${trip1.id}) Draft  — resume Step 4 (Diesel & Expenses)`);
  console.log(`  TRIP-20260801-001 (id=${trip2.id}) Draft  — resume Step 3 (Shop Delivery)`);
  console.log(`  TRIP-20260802-001 (id=${trip3.id}) Draft  — resume Step 2 (Farm Loading)`);
  console.log(`  TRIP-20260803-001 (id=${trip4.id}) Draft  — resume Step 1 (Trip Header)`);
  console.log(`  TRIP-20260804-001 (id=${trip5.id}) Pending — wizard complete`);
  console.log(`  TRIP-20260805-001 (id=${trip6.id}) Completed (approved)`);
  console.log(`  TRIP-20260806-001 (id=${trip7.id}) Deleted (soft deleted)`);
  console.log("All child records (crew, boxes, deliveries, delivery boxes, per-box,");
  console.log("diesel, media, fuel expenses) reference the same Trip ID.");
  console.log("Idempotent: re-running `npm run seed:demo` reuses existing data.");
  console.log("==============================================================");
}

main()
  .catch((err) => {
    console.error("seed-demo-data failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });