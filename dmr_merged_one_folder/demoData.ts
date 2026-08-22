// src/modules/dashboard/services/demoData.ts
// -----------------------------------------------------------------------------
// Optional, user-initiated SAMPLE DATA for previewing the executive dashboard
// when the local PostgreSQL backend is not running. It writes into the exact
// localStorage keys the existing services read, so every module (Trip List,
// Collections, Fuel, Pending Collections…) shows the same consistent data.
// Never seeded automatically — only when the user clicks "Load sample data".
// -----------------------------------------------------------------------------

import type { Trip } from "../../operations/vehicle-trips/types/trip";
import type { Collection } from "../../operations/collections/types/collection";
import type { ShopSale } from "../../operations/shop-sales/types/shopSale";
import type { FuelExpense } from "../../operations/fuel-expenses/types/fuelExpense";

const DEMO_FLAG = "dmr_demo_data";

export const DEMO_KEYS = {
  flag: DEMO_FLAG,
  shops: "dmr-shops",
  farms: "dmr-farms",
  vehicles: "dmr-vehicles",
  employees: "dmr-employees",
  trips: "vehicleTrips",
  collections: "dmr-collections",
  shopSales: "shopSales",
  fuel: "dmr-fuel-expenses",
} as const;

export function isDemoDataActive(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

export function clearDemoData(): void {
  try {
    Object.values(DEMO_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Deterministic sample generators                                    */
/* ------------------------------------------------------------------ */

function iso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const SHOP_NAMES = [
  "Srinivasa Chicken Centre",
  "Lakshmi Poultry Stores",
  "Venkateswara Egg Mart",
  "Sri Sai Broilers",
  "Balaji Chicken Shop",
  "Anjaneya Poultry",
  "Krishna Broiler House",
  "Mallikarjuna Chicken",
  "Padmavathi Poultry",
  "Ganesh Chicken Centre",
  "Durga Broiler Shop",
  "Vijaya Poultry Mart",
];

const FARMS = [
  "Green Valley Poultry Farm",
  "Sri Lakshmi Farms",
  "Rajahmundry Broiler Farm",
  "Nandini Poultry Farm",
  "Amrutha Farms",
  "Krishna Delta Farms",
];

const VEHICLES = [
  "AP 39 TC 1234",
  "AP 39 TC 5678",
  "AP 16 TD 9012",
  "TS 08 UE 3456",
  "AP 40 TF 7890",
  "TS 09 UG 2345",
  "AP 39 TH 6789",
  "TS 07 UJ 1122",
];

const DRIVERS = ["Ravi Kumar", "Suresh", "Mohan Rao", "Anil", "Prasad", "Srinivas", "Kishore", "Nagendra"];
const SUPERVISORS = ["Imran", "Shafi", "Mahesh", "Venkat"];
const HELPERS = ["Chinna", "Balu", "Ramu", "Sekhar"];

function rand(seed: number): number {
  // deterministic pseudo-random from seed
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function makeTrip(seed: number, daysAgo: number, status: Trip["status"]): Trip {
  const r = (n: number) => rand(seed * 100 + n);
  const vehicle = VEHICLES[Math.floor(r(1) * VEHICLES.length)];
  const driver = DRIVERS[Math.floor(r(2) * DRIVERS.length)];
  const supervisor = SUPERVISORS[Math.floor(r(3) * SUPERVISORS.length)];
  const farm = FARMS[Math.floor(r(4) * FARMS.length)];
  const shop = SHOP_NAMES[Math.floor(r(5) * SHOP_NAMES.length)];
  const birds = Math.round(2500 + r(6) * 3500);
  const weight = Math.round((birds * (2.05 + r(7) * 0.4)) * 10) / 10;
  const completed = status === "Completed";
  const date = iso(daysAgo);

  return {
    id: seed,
    tripNo: `TRP-${date.replace(/-/g, "")}-${String(seed).padStart(3, "0")}`,
    tripDate: date,
    startTime: new Date(new Date().setHours(5, 30)).toLocaleString(),
    vehicleId: seed,
    vehicleNo: vehicle,
    driverId: seed,
    driverName: driver,
    supervisorId: seed,
    supervisorName: supervisor,
    advanceAmount: 2000,
    helpers: [HELPERS[Math.floor(r(8) * HELPERS.length)]],
    openingMeter: Math.round(18000 + r(9) * 60000),
    startStepSubmitted: true,
    sourceFarmId: seed,
    sourceFarm: farm,
    reachedTime: new Date(new Date().setHours(7, 15)).toLocaleString(),
    destMeter: Math.round(18060 + r(10) * 60000),
    pickupTolls: 120,
    farmStepSubmitted: true,
    dcWeight: weight,
    totalBirds: birds,
    boxes: Math.ceil(birds / 12),
    avgWeight: 2.15,
    pickupLoadTime: new Date(new Date().setHours(8, 5)).toLocaleString(),
    pickupStepSubmitted: true,
    boxNo: seed,
    birds,
    weight,
    boxDetails: [{ boxNo: seed, birds, weight }],
    deliveries: [
      {
        id: seed,
        boxNo: seed,
        shopId: seed,
        shopName: shop,
        birdTypeId: 1,
        birdType: "Broiler",
        birds: Math.round(birds * 0.4),
        weight: Math.round(weight * 0.4 * 10) / 10,
        mortality: Math.round(birds * 0.004),
        rate: 118,
        amount: Math.round(weight * 0.4 * 118),
        remarks: "",
      },
      {
        id: seed + 1,
        boxNo: seed + 1,
        shopId: seed + 1,
        shopName: SHOP_NAMES[(Math.floor(r(5) * SHOP_NAMES.length) + 1) % SHOP_NAMES.length],
        birdTypeId: 1,
        birdType: "Broiler",
        birds: Math.round(birds * 0.35),
        weight: Math.round(weight * 0.35 * 10) / 10,
        mortality: Math.round(birds * 0.003),
        rate: 118,
        amount: Math.round(weight * 0.35 * 118),
        remarks: "",
      },
    ],
    deliveryStepSubmitted: completed,
    closingMeter: Math.round(18240 + r(11) * 60000),
    endTime: new Date(new Date().setHours(16, 40)).toLocaleString(),
    deliveryTolls: 160,
    meals: 450,
    loading: 300,
    fuel: Math.round(2800 + r(12) * 2200),
    expense: Math.round(600 + r(13) * 900),
    totalKm: Math.round(160 + r(14) * 220),
    totalShops: 2,
    totalWeight: weight,
    totalDeliveredWeight: Math.round(weight * 0.75 * 10) / 10,
    totalBirdsDelivered: Math.round(birds * 0.75),
    totalMortality: Math.round(birds * 0.004),
    totalMortalityCount: Math.round(birds * 0.004),
    totalMortalityWeight: Math.round(birds * 0.004 * 2.1 * 10) / 10,
    weightLoss: Math.round(weight * 0.01 * 10) / 10,
    survivalRate: 99.6,
    lastShop: shop,
    remarks: "",
    status,
    rateCompleted: completed,
    expensesStepSubmitted: completed,
    endStepSubmitted: completed,
    createdAt: date,
  };
}

function makeCollection(seed: number, daysAgo: number, shopName: string, amount: number): Collection {
  const modes = ["Cash", "UPI", "Bank Transfer", "Cheque"];
  return {
    id: `COL-${String(seed).padStart(6, "0")}`,
    collectionNo: `COL-${String(seed).padStart(6, "0")}`,
    collectionDate: iso(daysAgo),
    shopName,
    collectorName: "Kiran",
    paymentModeName: modes[seed % modes.length],
    referenceNo: `REF${seed}`,
    amount,
    remarks: "",
    status: "Approved",
  } as Collection;
}

function makeShopSale(seed: number, daysAgo: number, shopName: string, tripNo: string): ShopSale {
  const birds = Math.round(900 + rand(seed) * 1400);
  const weight = Math.round(birds * 2.1 * 10) / 10;
  return {
    id: `SS-${seed}`,
    tripId: String(seed),
    tripNo,
    tripDate: iso(daysAgo),
    shopId: String(seed),
    shopName,
    birdType: "Broiler",
    totalBirds: birds,
    totalWeight: weight,
    rate: 118,
    amount: Math.round(weight * 118),
    remark: "",
    status: "Completed",
  };
}

function makeFuel(seed: number, daysAgo: number, vehicleNo: string, driverName: string): FuelExpense {
  const litres = Math.round((180 + rand(seed) * 140) * 10) / 10;
  const rate = 101.5;
  return {
    id: `FUEL-${seed}`,
    billNo: `BILL-${iso(daysAgo).replace(/-/g, "")}-${String(seed).padStart(3, "0")}`,
    date: iso(daysAgo),
    vehicleId: seed,
    vehicleNo,
    driverId: seed,
    driverName,
    supervisorId: seed,
    supervisorName: SUPERVISORS[seed % SUPERVISORS.length],
    meterReading: Math.round(20000 + rand(seed) * 50000),
    amount: Math.round(litres * rate),
    rate,
    litres,
    petrolBunk: "HP Petrol Bunk, NH-16",
    remarks: "",
    status: "Approved",
    createdDate: new Date().toISOString(),
    createdBy: "Rubulla",
  };
}

/** Seed a realistic dataset into the existing service storage keys. */
export function seedDemoData(): void {
  try {
    const shops = SHOP_NAMES.map((name, i) => ({
      id: i + 1,
      shopNo: i + 1,
      shopName: name,
      ownerName: `Owner ${i + 1}`,
      village: ["Guntur", "Tenali", "Ponnur", "Repalle", "Bapatla", "Narsaraopet"][i % 6],
      phoneNumber: `+91 98${String(65000000 + i * 137)}`,
      status: i % 9 === 8 ? "Inactive" : "Active",
    }));

    const farms = FARMS.map((name, i) => ({
      id: i + 1,
      farmNo: i + 1,
      farmName: name,
      ownerName: `Farm Owner ${i + 1}`,
      supervisorName: SUPERVISORS[i % SUPERVISORS.length],
      phoneNumber: `+91 99${String(40000000 + i * 151)}`,
      village: ["Chilakaluripet", "Sattenapalli", "Mangalagiri", "Vinukonda"][i % 4],
      capacity: 20000 + i * 2500,
      status: "Active",
    }));

    const vehicles = VEHICLES.map((number, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() + (i % 3) * 2 + 1);
      return {
        id: i + 1,
        vehicleNo: i + 1,
        vehicleNumber: number,
        vehicleType: i % 2 === 0 ? "Tata Ace" : "Eicher 10.75",
        noOfBoxes: 14,
        birdCapacity: 4200,
        capacityKg: 8000,
        trackingId: `DMR-TRK-${i + 1}`,
        fastagBank: "ICICI Bank",
        insuranceExpiry: d.toISOString().slice(0, 10),
        permitExpiry: i % 4 === 0 ? iso(-12) : d.toISOString().slice(0, 10),
        fitnessExpiry: new Date(d.getTime() + 86400000 * 60).toISOString().slice(0, 10),
        status: i % 6 === 5 ? "Inactive" : "Active",
      };
    });

    const departments = ["Driver", "Supervisor", "Collection", "Accounts", "Operations"];
    const employees = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      employeeNo: i + 1,
      employeeName: `${["Ravi", "Suresh", "Mohan", "Anil", "Prasad", "Kiran", "Imran", "Shafi", "Mahesh", "Venkat", "Balu", "Ramu"][i % 12]} ${["K", "R", "V", "N"][i % 4]}.`,
      department: departments[i % departments.length],
      role: departments[i % departments.length] === "Driver" ? "Driver" : departments[i % departments.length],
      phoneNumber: `+91 97${String(12000000 + i * 171)}`,
      salary: 16000 + (i % 5) * 2500,
      status: i % 7 === 6 ? "Inactive" : "Active",
    }));

    // Trips across the last 8 days — a mix of completed / pending / draft.
    const trips: Trip[] = [];
    let seed = 1;
    for (let day = 0; day <= 7; day++) {
      const count = day === 0 ? 3 : 4 + (day % 2);
      for (let k = 0; k < count; k++) {
        const status: Trip["status"] = day === 0 && k === 0 ? "Draft" : day === 0 && k === 1 ? "Pending" : "Completed";
        trips.push(makeTrip(seed, day, status));
        seed++;
      }
    }

    const shopSales: ShopSale[] = [];
    const collections: Collection[] = [];
    const daysAgoFor = (dateStr: string) =>
      Math.max(0, Math.round((Date.now() - new Date(`${dateStr}T00:00:00`).getTime()) / 86400000));

    trips.forEach((t, i) => {
      const tripDay = daysAgoFor(t.tripDate);
      if (t.status !== "Draft") {
        t.deliveries.forEach((d, j) => {
          shopSales.push(makeShopSale(i * 10 + j + 1, tripDay, d.shopName, t.tripNo));
        });
      }
      if (t.status === "Completed") {
        collections.push(
          makeCollection(i + 1, tripDay, t.lastShop, Math.round((t.totalDeliveredWeight || 0) * 118))
        );
      }
    });

    const fuel: FuelExpense[] = [];
    for (let day = 0; day <= 6; day++) {
      for (let v = 0; v < 3; v++) {
        fuel.push(makeFuel(day * 10 + v + 1, day, VEHICLES[(day + v) % VEHICLES.length], DRIVERS[(day + v) % DRIVERS.length]));
      }
    }

    localStorage.setItem(DEMO_KEYS.shops, JSON.stringify(shops));
    localStorage.setItem(DEMO_KEYS.farms, JSON.stringify(farms));
    localStorage.setItem(DEMO_KEYS.vehicles, JSON.stringify(vehicles));
    localStorage.setItem(DEMO_KEYS.employees, JSON.stringify(employees));
    localStorage.setItem(DEMO_KEYS.trips, JSON.stringify(trips));
    localStorage.setItem(DEMO_KEYS.shopSales, JSON.stringify(shopSales));
    localStorage.setItem(DEMO_KEYS.collections, JSON.stringify(collections));
    localStorage.setItem(DEMO_KEYS.fuel, JSON.stringify(fuel));
    localStorage.setItem(DEMO_FLAG, "1");
  } catch (error) {
    console.warn("Failed to seed demo data:", error);
  }
}
