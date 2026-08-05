import { mastersService } from "../services/mastersService.js";
import { tripsService } from "../services/tripsService.js";
import { staffService } from "../services/staffService.js";
import { shopRatesService } from "../services/shopRatesService.js";
import { shopSalesService } from "../services/shopSalesService.js";
import { collectionsService } from "../services/collectionsService.js";
import { fuelExpensesService } from "../services/fuelExpensesService.js";
import { pool } from "../config/db.js";

// Uses shared pool → DATABASE_URL (dmr_poultries @ localhost:5432 / user dmr)

async function seed() {
  console.log("Seeding sample masters...");

  const driver = await mastersService.upsertEmployee({
    employeeName: "Ravi Kumar",
    department: "Driver",
    role: "Driver",
    phoneNumber: "9000000001",
    salary: 18000,
    status: "Active",
    joiningDate: "2024-01-15",
  });

  const supervisor = await mastersService.upsertEmployee({
    employeeName: "Suresh Reddy",
    department: "Supervisor",
    role: "Supervisor",
    phoneNumber: "9000000002",
    salary: 22000,
    status: "Active",
    joiningDate: "2023-06-01",
  });

  const helper = await mastersService.upsertEmployee({
    employeeName: "Anil",
    department: "Helper",
    role: "Helper",
    phoneNumber: "9000000003",
    salary: 12000,
    status: "Active",
    joiningDate: "2024-03-10",
  });

  const loader = await mastersService.upsertEmployee({
    employeeName: "Babu",
    department: "Loader",
    role: "Loader",
    phoneNumber: "9000000004",
    salary: 12000,
    status: "Active",
    joiningDate: "2024-04-01",
  });

  const vehicle = await mastersService.upsertVehicle({
    vehicleNumber: "AP39AB1234",
    vehicleType: "Truck",
    noOfBoxes: 85,
    birdCapacity: 3500,
    capacityKg: 7000,
    status: "Active",
  });

  const farm = await mastersService.upsertFarm({
    farmName: "Sri Venkateswara Farm",
    ownerName: "Venkat",
    village: "Guntur",
    capacity: 20000,
    status: "Active",
  });

  const shop = await mastersService.upsertShop({
    shopName: "City Broiler",
    ownerName: "Raju",
    village: "Vijayawada",
    status: "Active",
  });

  const birdType = await mastersService.upsertBirdType({
    birdType: "Broiler",
    averageWeight: 2.1,
    description: "Standard broiler",
    status: "Active",
  });

  await mastersService.upsertBank({
    bankName: "SBI",
    branch: "Main",
    accountNumber: "1234567890",
    ifscCode: "SBIN0001234",
    upiId: "dmr@sbi",
    status: "Active",
  });

  console.log("Seeding sample trip (all 5 steps)...");
  const tripDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const trip = await tripsService.save(null, {
    tripDate,
    status: "Completed",
    startTime: `${tripDate}T05:30:00.000Z`,
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    helpers: [helper.employeeName],
    loaders: [loader.employeeName],
    openingMeter: 12000,
    advanceAmount: 5000,
    startStepSubmitted: true,

    sourceFarmId: farm.id,
    sourceFarm: farm.farmName,
    reachedTime: `${tripDate}T07:00:00.000Z`,
    destMeter: 12085,
    pickupTolls: 120,
    farmAddress: "Guntur Rural",
    avgBirdWeight: 2.05,
    farmStepSubmitted: true,

    boxDetails: [
      { boxNo: 1, birds: 40, weight: 82 },
      { boxNo: 2, birds: 38, weight: 79 },
    ],
    totalBirds: 78,
    dcWeight: 161,
    boxes: 2,
    avgWeight: 2.064,
    pickupLoadTime: `${tripDate}T08:00:00.000Z`,
    pickupStepSubmitted: true,

    deliveries: [
      {
        id: 0,
        shopId: shop.id,
        shopName: shop.shopName,
        birdTypeId: birdType.id,
        birdType: birdType.birdType,
        birds: 76,
        weight: 158,
        mortality: 2,
        mortKg: 3,
        rate: 120,
        amount: 18960,
        remarks: "",
        deliveryMode: "box",
        selectedBoxIds: [1, 2],
        farmBirds: 78,
        farmWeight: 161,
        serialNo: 1,
      },
    ],
    deliveryStepSubmitted: true,

    closingMeter: 12140,
    endMeter: 12140,
    deliveryTolls: 80,
    destinationTolls: 80,
    meals: 400,
    loading: 300,
    mealsTiffin: 200,
    vehicleMaintenance: 0,
    othersRC: 50,
    others1Amt: 100,
    others2Amt: 100,
    others3Amt: 100,
    dieselEntries: [
      {
        rowIndex: 1,
        litres: 40,
        rate: 100,
        meter: 12100,
        bunkName: "HP Petrol Bunk",
      },
    ],
    fuel: 4000,
    expense: 1250,
    driverBata: 500,
    helperBata: 300,
    farmBirdTypeId: birdType.id,
    farmBirdType: birdType.birdType,
    farmBirdCount: 78,
    farmLoadWeight: 161,
    farmRate: 120,
    farmAmount: 19320,
    totalWeight: 161,
    remarks: "Seed trip",
    expensesStepSubmitted: true,
    endStepSubmitted: true,
    totalKm: 140,
    totalShops: 1,
    totalBirdsDelivered: 76,
    totalDeliveredWeight: 158,
    totalMortalityCount: 2,
    totalMortalityWeight: 3,
    lastShop: shop.shopName,
  });

  console.log("Seeding staff samples...");
  await staffService.upsertDuty({
    employeeId: driver.id,
    employeeName: driver.employeeName,
    department: driver.department,
    role: driver.role,
    dutyType: "Driver",
    date: tripDate,
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
  });

  await staffService.createLeave({
    employeeId: helper.id,
    employeeName: helper.employeeName,
    type: "Casual",
    fromDate: tripDate,
    toDate: tripDate,
    days: 1,
    reason: "Personal work",
  });

  await staffService.upsertSalary({
    employeeId: driver.id,
    employeeName: driver.employeeName,
    department: driver.department,
    month: tripDate.slice(0, 7),
    basicSalary: 18000,
    leaveDeduction: 0,
    latePenalty: 0,
    advanceRecovery: 0,
    netSalary: 18000,
    status: "Pending",
  });

  console.log("Seeding operations samples...");

  // Mark sample trip Completed so it contributes to dashboard totals
  await tripsService.updateStatus(trip.id, {
    status: "Completed",
    approvedBy: "Seed Admin",
  });

  // Ensure delivery amounts/rates exist on trip_deliveries (shop sales/rates/collections source)
  const sale = await shopSalesService.create({
    saleDate: tripDate,
    shopId: shop.id,
    shopName: shop.shopName,
    birdTypeId: birdType.id,
    birdType: birdType.birdType,
    tripId: trip.id,
    birds: 500,
    weight: 1050,
    rate: 145,
    amount: 152250,
    createdBy: "seed",
  });

  const ratesResult = await shopRatesService.list({ shopId: shop.id });
  const rates = Array.isArray(ratesResult) ? ratesResult : ratesResult.data;
  const rate = rates[0] ?? (await shopRatesService.getById(sale.id));

  // Partial pending: rate_completed false → pending collections
  await collectionsService.create({
    collectionDate: tripDate,
    shopId: shop.id,
    shopName: shop.shopName,
    saleId: sale.id,
    tripId: trip.id,
    amountDue: 152250,
    amountCollected: 0,
    createdBy: "seed",
  });

  const fuel = await fuelExpensesService.create({
    billDate: tripDate,
    vehicleId: vehicle.id,
    vehicleNo: vehicle.vehicleNumber,
    driverId: driver.id,
    driverName: driver.employeeName,
    supervisorId: supervisor.id,
    supervisorName: supervisor.employeeName,
    tripId: trip.id,
    currentMeter: 12540,
    fuelRate: 102.5,
    liters: 80,
    amount: 8200,
    pumpName: "HP Guntur",
    status: "Approved",
    createdBy: "seed",
  });
  await fuelExpensesService.updateStatus(fuel.id, {
    status: "Approved",
    approvedBy: "Seed Admin",
  });

  console.log("Seed complete.");
  console.log({
    tripId: trip.id,
    tripNo: trip.tripNo,
    vehicle: vehicle.vehicleNumber,
    driver: driver.employeeName,
    shopRateId: rate.id,
    saleId: sale.id,
    fuelExpenseId: fuel.id,
  });
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
