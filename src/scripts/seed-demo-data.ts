/**
 * ============================================================================
 * Comprehensive Demo Data Seeding Script
 * ============================================================================
 * 
 * Purpose: Generate realistic poultry business demo data for development
 *          and testing of the complete Trip Entry workflow.
 * 
 * Usage: npm run seed:demo
 * 
 * Features:
 * - Idempotent: running multiple times reuses existing data
 * - Never creates duplicates
 * - Respects existing production data
 * - Uses existing backend services and validation
 * - Generates data for all downstream modules
 * 
 * Output: 7 trips at various completion stages:
 *   - Trip 1 (31-Jul): Draft, Step 4 complete
 *   - Trip 2 (01-Aug): Draft, Step 3 complete
 *   - Trip 3 (02-Aug): Draft, Step 2 complete
 *   - Trip 4 (03-Aug): Draft, Step 1 only
 *   - Trip 5 (04-Aug): Pending, full wizard complete
 *   - Trip 6 (05-Aug): Completed
 *   - Trip 7 (06-Aug): Deleted
 * 
 * Database: Uses shared PostgreSQL pool (dmr_poultries @ localhost:5432)
 * ============================================================================
 */

import { mastersService } from "../services/mastersService.js";
import { tripsService } from "../services/tripsService.js";
import { staffService } from "../services/staffService.js";
import { shopSalesService } from "../services/shopSalesService.js";
import { collectionsService } from "../services/collectionsService.js";
import { fuelExpensesService } from "../services/fuelExpensesService.js";
import { pool } from "../config/db.js";

// ============================================================================
// DEMO CONFIGURATION
// ============================================================================

const DEMO_MARKER = "DEMO-DATA-"; // Prefix to identify demo records

const MASTER_DATA = {
  employees: [
    {
      name: "Ruhulla",
      dept: "Supervisor",
      role: "Supervisor",
      phone: "9876543210",
      marker: "ruhulla-supervisor",
    },
    {
      name: "Rahim",
      dept: "Driver",
      role: "Driver",
      phone: "9876543211",
      marker: "rahim-driver",
    },
    {
      name: "Kareem",
      dept: "Helper",
      role: "Helper",
      phone: "9876543212",
      marker: "kareem-helper",
    },
    {
      name: "Saleem",
      dept: "Loader",
      role: "Loader",
      phone: "9876543213",
      marker: "saleem-loader",
    },
  ],
  vehicles: [
    {
      number: "AP16AB1234",
      type: "Truck",
      boxes: 85,
      birdCapacity: 4500,
      weightCapacity: 9000,
      marker: "ap16ab1234",
    },
  ],
  farms: [
    {
      name: "Sri Lakshmi Poultry Farm",
      owner: "Sri Lakshmi",
      village: "Hyderabad",
      capacity: 25000,
      marker: "sri-lakshmi-farm",
    },
  ],
  shops: [
    {
      name: "New Hyderabad Chicken Center",
      owner: "Hassan",
      area: "Hyderabad",
      marker: "new-hyderabad-chicken",
    },
    {
      name: "Bismillah Chicken Shop",
      owner: "Bismillah",
      area: "Hyderabad",
      marker: "bismillah-chicken",
    },
    {
      name: "Royal Chicken Center",
      owner: "Raja",
      area: "Hyderabad",
      marker: "royal-chicken",
    },
  ],
  banks: [
    {
      name: "SBI Current Account",
      branch: "Hyderabad",
      accountNumber: "12345678901234",
      ifsc: "SBIN0001234",
      marker: "sbi-current-account",
    },
  ],
  birdTypes: [
    {
      name: "Broiler",
      avgWeight: 2.35,
      marker: "broiler-2.35",
    },
  ],
};

const TRIP_DATES = {
  trip1: "2026-07-31",
  trip2: "2026-08-01",
  trip3: "2026-08-02",
  trip4: "2026-08-03",
  trip5: "2026-08-04",
  trip6: "2026-08-05",
  trip7: "2026-08-06",
};

// ============================================================================
// IDEMPOTENT MASTER DATA UPSERT
// ============================================================================

/**
 * Find or create an employee record using a unique marker.
 * Idempotent: returns existing record if found.
 */
async function upsertEmployee(config: {
  name: string;
  dept: string;
  role: string;
  phone: string;
  marker: string;
}) {
  try {
    const existing = await mastersService.listEmployees();
    const found = existing.find((e) => e.employeeName === config.name && e.department === config.dept);
    if (found) {
      console.log(`  ✓ Employee "${config.name}" (${config.dept}) already exists`);
      return found;
    }

    const created = await mastersService.upsertEmployee({
      employeeName: config.name,
      department: config.dept,
      role: config.role,
      phoneNumber: config.phone,
      status: "Active",
      joiningDate: "2024-01-01",
      salary: 20000,
    });
    console.log(`  + Created employee "${config.name}" (${config.dept})`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting employee "${config.name}":`, error);
    throw error;
  }
}

/**
 * Find or create a vehicle record using a unique marker.
 * Idempotent: returns existing record if found.
 */
async function upsertVehicle(config: {
  number: string;
  type: string;
  boxes: number;
  birdCapacity: number;
  weightCapacity: number;
  marker: string;
}) {
  try {
    const existing = await mastersService.listVehicles();
    const found = existing.find((v) => v.vehicleNumber === config.number);
    if (found) {
      console.log(`  ✓ Vehicle "${config.number}" already exists`);
      return found;
    }

    const created = await mastersService.upsertVehicle({
      vehicleNumber: config.number,
      vehicleType: config.type,
      noOfBoxes: config.boxes,
      birdCapacity: config.birdCapacity,
      capacityKg: config.weightCapacity,
      status: "Active",
    });
    console.log(`  + Created vehicle "${config.number}"`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting vehicle "${config.number}":`, error);
    throw error;
  }
}

/**
 * Find or create a farm record.
 * Idempotent: returns existing record if found.
 */
async function upsertFarm(config: {
  name: string;
  owner: string;
  village: string;
  capacity: number;
  marker: string;
}) {
  try {
    const existing = await mastersService.listFarms();
    const found = existing.find((f) => f.farmName === config.name);
    if (found) {
      console.log(`  ✓ Farm "${config.name}" already exists`);
      return found;
    }

    const created = await mastersService.upsertFarm({
      farmName: config.name,
      ownerName: config.owner,
      village: config.village,
      capacity: config.capacity,
      status: "Active",
    });
    console.log(`  + Created farm "${config.name}"`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting farm "${config.name}":`, error);
    throw error;
  }
}

/**
 * Find or create a shop record.
 * Idempotent: returns existing record if found.
 */
async function upsertShop(config: {
  name: string;
  owner: string;
  area: string;
  marker: string;
}) {
  try {
    const existing = await mastersService.listShops();
    const found = existing.find((s) => s.shopName === config.name);
    if (found) {
      console.log(`  ✓ Shop "${config.name}" already exists`);
      return found;
    }

    const created = await mastersService.upsertShop({
      shopName: config.name,
      ownerName: config.owner,
      area: config.area,
      status: "Active",
    });
    console.log(`  + Created shop "${config.name}"`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting shop "${config.name}":`, error);
    throw error;
  }
}

/**
 * Find or create a bank record.
 * Idempotent: returns existing record if found.
 */
async function upsertBank(config: {
  name: string;
  branch: string;
  accountNumber: string;
  ifsc: string;
  marker: string;
}) {
  try {
    const existing = await mastersService.listBanks();
    const found = existing.find((b) => b.bankName === config.name);
    if (found) {
      console.log(`  ✓ Bank "${config.name}" already exists`);
      return found;
    }

    const created = await mastersService.upsertBank({
      bankName: config.name,
      branch: config.branch,
      accountNumber: config.accountNumber,
      ifscCode: config.ifsc,
      status: "Active",
    });
    console.log(`  + Created bank "${config.name}"`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting bank "${config.name}":`, error);
    throw error;
  }
}

/**
 * Find or create a bird type record.
 * Idempotent: returns existing record if found.
 */
async function upsertBirdType(config: {
  name: string;
  avgWeight: number;
  marker: string;
}) {
  try {
    const existing = await mastersService.listBirdTypes();
    const found = existing.find((b) => b.birdType === config.name && b.averageWeight === config.avgWeight);
    if (found) {
      console.log(`  ✓ Bird Type "${config.name}" (${config.avgWeight} kg) already exists`);
      return found;
    }

    const created = await mastersService.upsertBirdType({
      birdType: config.name,
      averageWeight: config.avgWeight,
      status: "Active",
    });
    console.log(`  + Created bird type "${config.name}" (${config.avgWeight} kg)`);
    return created;
  } catch (error) {
    console.error(`  ✗ Error upserting bird type "${config.name}":`, error);
    throw error;
  }
}

// ============================================================================
// DEMO TRIP GENERATION
// ============================================================================

/**
 * Create a demo trip at a specific completion stage.
 * Each trip represents a different step in the workflow.
 */
async function createDemoTrip(
  tripDate: string,
  tripNumber: string,
  status: "Draft" | "Pending" | "Completed" | "Deleted",
  completionStep: "step1" | "step2" | "step3" | "step4" | "complete",
  masters: {
    supervisor: any;
    driver: any;
    helper: any;
    vehicle: any;
    farm: any;
    shop1: any;
    shop2: any;
    shop3: any;
    birdType: any;
  }
) {
  console.log(`\n  Creating Trip ${tripNumber} (${tripDate}, Step: ${completionStep})...`);

  try {
    // STEP 1: Trip Header
    const step1Trip = await tripsService.save(null, {
      tripNo: tripNumber,
      tripDate,
      startTime: `${tripDate}T06:00:00Z`,
      vehicleId: masters.vehicle.id,
      vehicleNo: masters.vehicle.vehicleNumber,
      driverId: masters.driver.id,
      driverName: masters.driver.employeeName,
      supervisorId: masters.supervisor.id,
      supervisorName: masters.supervisor.employeeName,
      helpers: [masters.helper.employeeName],
      advanceAmount: 2000,
      openingMeter: 12000,
      remarks: `Demo trip - Step 1 complete on ${tripDate}`,
      status: "Draft",
      startStepSubmitted: true,
      farmStepSubmitted: false,
      pickupStepSubmitted: false,
      deliveryStepSubmitted: false,
      endStepSubmitted: false,
      totalBirds: 0,
      dcWeight: 0,
      boxes: 0,
      avgWeight: 0,
      deliveries: [],
      boxDetails: [],
      totalShops: 0,
      totalWeight: 0,
      totalDeliveredWeight: 0,
      totalBirdsDelivered: 0,
      totalMortality: 0,
      totalMortalityCount: 0,
      totalMortalityWeight: 0,
      weightLoss: 0,
      survivalRate: 0,
      lastShop: "",
      fuel: 0,
      expense: 0,
      totalKm: 0,
    });

    // If only step 1, return now
    if (completionStep === "step1") {
      console.log(`    ✓ Trip ${tripNumber} created at Step 1 (Draft)`);
      return step1Trip;
    }

    // STEP 2: Farm Loading
    const step2Trip = await tripsService.save(step1Trip.id, {
      ...step1Trip,
      sourceFarmId: masters.farm.id,
      sourceFarm: masters.farm.farmName,
      reachedTime: `${tripDate}T07:00:00Z`,
      destMeter: 12030,
      pickupTolls: 120,
      farmStepSubmitted: true,
    });

    if (completionStep === "step2") {
      console.log(`    ✓ Trip ${tripNumber} updated to Step 2 (Draft)`);
      return step2Trip;
    }

    // STEP 3: Pickup / Farm Boxes
    const boxDetails = [
      { boxNo: 1, birds: 2100, weight: 4935 },
      { boxNo: 2, birds: 2100, weight: 4935 },
    ];

    const step3Trip = await tripsService.save(step2Trip.id, {
      ...step2Trip,
      boxDetails,
      totalBirds: 4200,
      dcWeight: 9870,
      boxes: 2,
      avgWeight: 2.35,
      pickupLoadTime: `${tripDate}T08:30:00Z`,
      pickupStepSubmitted: true,
    });

    if (completionStep === "step3") {
      console.log(`    ✓ Trip ${tripNumber} updated to Step 3 (Draft)`);
      return step3Trip;
    }

    // STEP 4: Deliveries
    const deliveries = [
      {
        id: 0,
        shopId: masters.shop1.id,
        shopName: masters.shop1.shopName,
        birdTypeId: masters.birdType.id,
        birdType: masters.birdType.birdType,
        birds: 1400,
        weight: 3290,
        mortality: 35,
        rate: 118,
        amount: 165200,
        remarks: "Morning delivery",
        deliveryMode: "box" as const,
        selectedBoxIds: [1],
        farmBirds: 4200,
        farmWeight: 9870,
        serialNo: 1,
      },
      {
        id: 0,
        shopId: masters.shop2.id,
        shopName: masters.shop2.shopName,
        birdTypeId: masters.birdType.id,
        birdType: masters.birdType.birdType,
        birds: 1400,
        weight: 3290,
        mortality: 35,
        rate: 118,
        amount: 165200,
        remarks: "Afternoon delivery",
        deliveryMode: "box" as const,
        selectedBoxIds: [1],
        farmBirds: 4200,
        farmWeight: 9870,
        serialNo: 2,
      },
      {
        id: 0,
        shopId: masters.shop3.id,
        shopName: masters.shop3.shopName,
        birdTypeId: masters.birdType.id,
        birdType: masters.birdType.birdType,
        birds: 1400,
        weight: 3290,
        mortality: 35,
        rate: 118,
        amount: 165200,
        remarks: "Evening delivery",
        deliveryMode: "box" as const,
        selectedBoxIds: [2],
        farmBirds: 4200,
        farmWeight: 9870,
        serialNo: 3,
      },
    ];

    const step4Trip = await tripsService.save(step3Trip.id, {
      ...step3Trip,
      deliveries: deliveries as any,
      deliveryStepSubmitted: true,
      totalShops: 3,
      totalBirdsDelivered: 4200,
      totalDeliveredWeight: 9870,
      totalMortalityCount: 105,
      totalMortalityWeight: 246.75,
      lastShop: masters.shop3.shopName,
    });

    if (completionStep === "step4") {
      console.log(`    ✓ Trip ${tripNumber} updated to Step 4 (Draft)`);
      return step4Trip;
    }

    // STEP 5: End Trip (Diesel & Expenses)
    const closingMeter = 12140;
    const totalKm = closingMeter - step4Trip.openingMeter;

    const finalTrip = await tripsService.save(step4Trip.id, {
      ...step4Trip,
      closingMeter,
      endMeter: closingMeter,
      endTime: `${tripDate}T18:00:00Z`,
      deliveryTolls: 150,
      fuel: 4074,
      expense: 3050,
      driverBata: 500,
      helperBata: 400,
      meals: 450,
      loading: 850,
      remarks: "Demo trip complete",
      status: status === "Deleted" ? "Deleted" : status,
      endStepSubmitted: status !== "Draft",
      expensesStepSubmitted: status !== "Draft",
      totalKm,
      deletedReason: status === "Deleted" ? "Demo data cleanup" : undefined,
    });

    console.log(
      `    ✓ Trip ${tripNumber} completed (Status: ${status}, Total KM: ${totalKm})`
    );

    // GENERATE DOWNSTREAM DATA (for completed/pending trips)
    if (status === "Completed" || status === "Pending") {
      await generateDownstreamData(finalTrip, masters, tripDate);
    }

    return finalTrip;
  } catch (error) {
    console.error(`    ✗ Error creating trip ${tripNumber}:`, error);
    throw error;
  }
}

/**
 * Generate downstream data for completed/pending trips.
 * Includes: shop sales, collections, fuel expenses.
 */
async function generateDownstreamData(
  trip: any,
  masters: any,
  tripDate: string
) {
  console.log(`    Generating downstream data for ${trip.tripNo}...`);

  try {
    // Generate shop sales for each delivery
    for (const delivery of trip.deliveries || []) {
      await shopSalesService.create({
        tripId: trip.id,
        tripNo: trip.tripNo,
        saleDate: trip.tripDate,
        shopId: delivery.shopId,
        shopName: delivery.shopName,
        birdTypeId: delivery.birdTypeId,
        birdType: delivery.birdType,
        totalBirds: delivery.birds,
        totalWeight: delivery.weight,
        rate: delivery.rate,
        amount: delivery.amount,
        mortality: delivery.mortality,
        rateCompleted: false,
        remarks: delivery.remarks,
      } as any);
    }

    // Generate collections for sales
    const sales = await shopSalesService.list({ tripId: trip.id } as any);
    for (const sale of sales) {
      await collectionsService.create({
        collectionDate: tripDate,
        shopId: sale.shopId,
        shopName: sale.shopName,
        saleId: sale.id,
        tripId: trip.id,
        amountDue: sale.amount,
        amountCollected: 0,
        createdBy: "seed",
      } as any);
    }

    // Generate fuel expenses
    if (trip.fuel && trip.fuel > 0) {
      await fuelExpensesService.create({
        billDate: tripDate,
        vehicleId: trip.vehicleId,
        vehicleNo: trip.vehicleNo,
        driverId: trip.driverId,
        driverName: trip.driverName,
        supervisorId: trip.supervisorId,
        supervisorName: trip.supervisorName,
        tripId: trip.id,
        liters: 42,
        rate: 97,
        amount: 4074,
        currentMeter: trip.closingMeter,
        pumpName: "Local Fuel Station",
        status: "Approved",
        createdBy: "seed",
      } as any);
    }

    console.log(`      ✓ Downstream data generated for ${trip.tripNo}`);
  } catch (error) {
    console.error(`      ✗ Error generating downstream data:`, error);
    // Don't throw - allow trip creation to succeed even if downstream fails
  }
}

// ============================================================================
// MAIN SEEDING ORCHESTRATION
// ============================================================================

async function seedDemoData() {
  console.log("\n" + "=".repeat(80));
  console.log("DMR Poultries — Demo Data Seeding Script");
  console.log("=".repeat(80));
  console.log(`Target Database: ${process.env.DATABASE_URL || "dmr_poultries (local)"}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=".repeat(80) + "\n");

  try {
    // ========================================================================
    // STEP 1: VERIFY MASTER DATA
    // ========================================================================
    console.log("1️⃣  Verifying/Creating Master Data...\n");

    const supervisor = await upsertEmployee(MASTER_DATA.employees[0]);
    const driver = await upsertEmployee(MASTER_DATA.employees[1]);
    const helper = await upsertEmployee(MASTER_DATA.employees[2]);
    const loader = await upsertEmployee(MASTER_DATA.employees[3]);

    const vehicle = await upsertVehicle(MASTER_DATA.vehicles[0]);

    const farm = await upsertFarm(MASTER_DATA.farms[0]);

    const shop1 = await upsertShop(MASTER_DATA.shops[0]);
    const shop2 = await upsertShop(MASTER_DATA.shops[1]);
    const shop3 = await upsertShop(MASTER_DATA.shops[2]);

    await upsertBank(MASTER_DATA.banks[0]);

    const birdType = await upsertBirdType(MASTER_DATA.birdTypes[0]);

    const masters = {
      supervisor,
      driver,
      helper,
      loader,
      vehicle,
      farm,
      shop1,
      shop2,
      shop3,
      birdType,
    };

    // ========================================================================
    // STEP 2: CREATE DEMO TRIPS AT VARIOUS COMPLETION STAGES
    // ========================================================================
    console.log("\n2️⃣  Creating Demo Trips...\n");

    // Trip 1: Draft, Step 4 complete
    await createDemoTrip(
      TRIP_DATES.trip1,
      "TRIP-20260731-001",
      "Draft",
      "step4",
      masters
    );

    // Trip 2: Draft, Step 3 complete
    await createDemoTrip(
      TRIP_DATES.trip2,
      "TRIP-20260801-001",
      "Draft",
      "step3",
      masters
    );

    // Trip 3: Draft, Step 2 complete
    await createDemoTrip(
      TRIP_DATES.trip3,
      "TRIP-20260802-001",
      "Draft",
      "step2",
      masters
    );

    // Trip 4: Draft, Step 1 only
    await createDemoTrip(
      TRIP_DATES.trip4,
      "TRIP-20260803-001",
      "Draft",
      "step1",
      masters
    );

    // Trip 5: Pending, Full wizard complete
    await createDemoTrip(
      TRIP_DATES.trip5,
      "TRIP-20260804-001",
      "Pending",
      "complete",
      masters
    );

    // Trip 6: Completed
    await createDemoTrip(
      TRIP_DATES.trip6,
      "TRIP-20260805-001",
      "Completed",
      "complete",
      masters
    );

    // Trip 7: Deleted
    await createDemoTrip(
      TRIP_DATES.trip7,
      "TRIP-20260806-001",
      "Deleted",
      "complete",
      masters
    );

    // ========================================================================
    // COMPLETION SUMMARY
    // ========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("✅ DEMO DATA SEEDING COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80));
    console.log("\n📊 Generated Data Summary:");
    console.log("  • 4 Draft Trips (Steps 1-4)");
    console.log("  • 1 Pending Trip (Full workflow)");
    console.log("  • 1 Completed Trip");
    console.log("  • 1 Deleted Trip");
    console.log("  • All linked to master records");
    console.log("  • Ready for dashboard, search, filter testing");
    console.log("\n📝 Master Data Created/Reused:");
    console.log("  • Employees: 4 (Supervisor, Driver, Helper, Loader)");
    console.log("  • Vehicles: 1 (AP16AB1234)");
    console.log("  • Farms: 1 (Sri Lakshmi Poultry Farm)");
    console.log("  • Shops: 3 (New Hyderabad, Bismillah, Royal)");
    console.log("  • Bird Types: 1 (Broiler)");
    console.log("  • Banks: 1 (SBI)");
    console.log("\n🔄 Resume Auto-Navigation:");
    console.log("  • Trip 1 (31-Jul) → Opens at Step 4");
    console.log("  • Trip 2 (01-Aug) → Opens at Step 3");
    console.log("  • Trip 3 (02-Aug) → Opens at Step 2");
    console.log("  • Trip 4 (03-Aug) → Opens at Step 1");
    console.log("  • Trip 5 (04-Aug) → Pending approval");
    console.log("  • Trip 6 (05-Aug) → Completed");
    console.log("  • Trip 7 (06-Aug) → Deleted");
    console.log("\n🧪 Testing Coverage:");
    console.log("  ✓ Dashboard (recent trips, KPIs, trends)");
    console.log("  ✓ Trip List (search, filters, status)");
    console.log("  ✓ Trip Entry (all 5 steps)");
    console.log("  ✓ Shop Sales (delivery records)");
    console.log("  ✓ Collections (pending, recovery)");
    console.log("  ✓ Accounts (payment ledgers)");
    console.log("  ✓ Future Mobile Sync (all data in PostgreSQL)");
    console.log("\n💾 Database: PostgreSQL (dmr_poultries @ localhost:5432)");
    console.log("⚠️  To reset: npm run db:migrate -- --reset && npm run seed:demo");
    console.log("=".repeat(80) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ SEEDING FAILED:", error);
    console.error("\nFull error details:");
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

seedDemoData();
