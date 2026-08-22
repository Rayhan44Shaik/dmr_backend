// src/modules/dashboard/services/dashboardService.ts
// -----------------------------------------------------------------------------
// Data aggregation for the executive dashboard. Reads exclusively from the
// existing services: localStorage-backed operations services + the PostgreSQL
// masters API (with legacy-key fallback when the local backend is offline).
// -----------------------------------------------------------------------------

import { apiTryGet } from "../../../api";
import { tripService } from "../../operations/vehicle-trips/services/tripService";
import { collectionService } from "../../operations/collections/services/collectionService";
import { fuelExpenseService } from "../../operations/fuel-expenses/services/fuelExpenseService";
import type { Trip } from "../../operations/vehicle-trips/types/trip";
import type { Collection, PendingCollection } from "../../operations/collections/types/collection";
import type { ShopSale } from "../../operations/shop-sales/types/shopSale";
import type { FuelExpense } from "../../operations/fuel-expenses/types/fuelExpense";
import { isDemoDataActive } from "./demoData";

export interface ShopRow {
  id: number;
  name: string;
  owner: string;
  village: string;
  status: string;
}

export interface FarmRow {
  id: number;
  name: string;
  village: string;
  status: string;
}

export interface VehicleRow {
  id: number;
  number: string;
  type: string;
  status: string;
  insuranceExpiry: string;
  permitExpiry: string;
  fitnessExpiry: string;
}

export interface EmployeeRow {
  id: number;
  name: string;
  department: string;
  role: string;
  status: string;
}

export interface DashboardData {
  shops: ShopRow[];
  farms: FarmRow[];
  vehicles: VehicleRow[];
  employees: EmployeeRow[];
  trips: Trip[];
  collections: Collection[];
  pendingCollections: PendingCollection[];
  shopSales: ShopSale[];
  fuelExpenses: FuelExpense[];
  mastersFromApi: boolean;
  demoActive: boolean;
}

/* ------------------------------------------------------------------ */
/*  Safe localStorage reads                                            */
/* ------------------------------------------------------------------ */
function readKey<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function normStatus(value: unknown): string {
  return value === "Active" ? "Active" : value === "Inactive" ? "Inactive" : String(value ?? "Active");
}

/* ------------------------------------------------------------------ */
/*  Masters — API first, legacy keys as offline fallback               */
/* ------------------------------------------------------------------ */
function toShops(rows: unknown[]): ShopRow[] {
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id ?? row.shopNo ?? 0),
        name: String(row.shopName ?? row.name ?? ""),
        owner: String(row.ownerName ?? ""),
        village: String(row.village ?? ""),
        status: normStatus(row.status),
      };
    })
    .filter((s) => s.name);
}

function toFarms(rows: unknown[]): FarmRow[] {
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id ?? row.farmNo ?? 0),
        name: String(row.farmName ?? row.name ?? ""),
        village: String(row.village ?? ""),
        status: normStatus(row.status),
      };
    })
    .filter((f) => f.name);
}

function toVehicles(rows: unknown[]): VehicleRow[] {
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id ?? row.vehicleNo ?? 0),
        number: String(row.vehicleNumber ?? row.number ?? ""),
        type: String(row.vehicleType ?? "Vehicle"),
        status: normStatus(row.status),
        insuranceExpiry: String(row.insuranceExpiry ?? ""),
        permitExpiry: String(row.permitExpiry ?? ""),
        fitnessExpiry: String(row.fitnessExpiry ?? ""),
      };
    })
    .filter((v) => v.number);
}

function toEmployees(rows: unknown[]): EmployeeRow[] {
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id ?? row.employeeNo ?? 0),
        name: String(row.employeeName ?? row.name ?? ""),
        department: String(row.department ?? ""),
        role: String(row.role ?? ""),
        status: normStatus(row.status),
      };
    })
    .filter((e) => e.name);
}

const LEGACY_KEYS = {
  shops: ["dmr-shops", "masters_shops", "dmr_poultries_shops_master_data"],
  farms: ["dmr-farms", "masters_farms"],
  vehicles: ["dmr-vehicles", "masters_vehicles"],
  employees: ["dmr-employees", "masters_employees"],
} as const;

async function loadMasters(): Promise<Pick<DashboardData, "shops" | "farms" | "vehicles" | "employees" | "mastersFromApi">> {
  // Short timeout so the dashboard stays snappy when the local backend is off.
  const opts = { timeout: 2500 };

  const [apiShops, apiFarms, apiVehicles, apiEmployees] = await Promise.all([
    apiTryGet<unknown[]>("/masters/shops", opts),
    apiTryGet<unknown[]>("/masters/farms", opts),
    apiTryGet<unknown[]>("/masters/vehicles", opts),
    apiTryGet<unknown[]>("/masters/employees", opts),
  ]);

  const fromApi = Boolean(apiShops || apiFarms || apiVehicles || apiEmployees);

  const fallback = (keys: readonly string[]): unknown[] => {
    for (const key of keys) {
      const rows = readKey<unknown>(key);
      if (rows.length > 0) return rows;
    }
    return [];
  };

  return {
    shops: apiShops?.length ? toShops(apiShops) : toShops(fallback(LEGACY_KEYS.shops)),
    farms: apiFarms?.length ? toFarms(apiFarms) : toFarms(fallback(LEGACY_KEYS.farms)),
    vehicles: apiVehicles?.length ? toVehicles(apiVehicles) : toVehicles(fallback(LEGACY_KEYS.vehicles)),
    employees: apiEmployees?.length ? toEmployees(apiEmployees) : toEmployees(fallback(LEGACY_KEYS.employees)),
    mastersFromApi: fromApi,
  };
}

/* ------------------------------------------------------------------ */
/*  Main loader                                                        */
/* ------------------------------------------------------------------ */
export async function loadDashboardData(): Promise<DashboardData> {
  const masters = await loadMasters();

  let trips: Trip[] = [];
  let collections: Collection[] = [];
  let pendingCollections: PendingCollection[] = [];
  let shopSales: ShopSale[] = [];
  let fuelExpenses: FuelExpense[] = [];
  try {
    trips = tripService.getAll();
    collections = collectionService.getCollections();
    pendingCollections = collectionService.getPendingCollections();
    shopSales = collectionService.getShopSales();
    fuelExpenses = fuelExpenseService.getAll();
  } catch (error) {
    console.warn("Dashboard: unable to read operations data", error);
  }

  return {
    ...masters,
    trips,
    collections,
    pendingCollections,
    shopSales,
    fuelExpenses,
    demoActive: isDemoDataActive(),
  };
}

/** Re-exported so the dashboard page can refresh after seeding. */
export { seedDemoData, clearDemoData, isDemoDataActive } from "./demoData";
