// src/modules/dashboard/utils/dashboardDerive.ts
// Pure derivation of every dashboard view from the aggregated rows.
// No side effects — easy to reuse from any client (web / mobile).

import type { LucideIcon } from "lucide-react";
import {
  Bird,
  CreditCard,
  IndianRupee,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import type { DashboardData, VehicleRow } from "../services/dashboardService";
import type { Trip } from "../../operations/vehicle-trips/types/trip";
import { getMaintenance } from "../../fleet-operations/services/storage";
import { formatINR, formatINRCompact, formatNumber, formatWeight } from "../../../utils/format";

export interface KpiDatum {
  key: string;
  label: string;
  value: string;
  sub: string;
  delta: number | null;
  trend: "up" | "down" | "flat";
  icon: LucideIcon;
  tone: "brand" | "sky" | "amber" | "rose" | "violet" | "slate";
  spark: { x: string; y: number }[];
}

export interface TripView {
  tripNo: string;
  vehicle: string;
  driver: string;
  supervisor: string;
  farm: string;
  shop: string;
  birds: number;
  weight: number;
  status: Trip["status"];
}

export interface FleetVehicleView {
  id: number;
  number: string;
  type: string;
  status: "On Trip" | "Available" | "Inactive";
  driver: string;
  currentTrip: string;
  fuel: number;
  /** Latest known odometer reading (from the most recent trip), null if unknown. */
  km: number | null;
  maintenanceNote: string;
  insuranceExpiry: string;
  permitExpiry: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: "brand" | "sky" | "amber" | "rose" | "violet" | "slate";
  icon: LucideIcon;
}

export interface DerivedDashboard {
  kpis: KpiDatum[];
  salesVsCollections: { date: string; sales: number; collections: number }[];
  weeklyRevenue: { day: string; revenue: number }[];
  deliveryVolume: { date: string; birds: number; weight: number }[];
  vehicleActivity: { name: string; value: number; color: string }[];
  todayTrips: TripView[];
  latestTrips: TripView[];
  pendingCollections: DashboardData["pendingCollections"];
  fleet: FleetVehicleView[];
  activity: ActivityItem[];
  hasAnyData: boolean;
  totals: {
    pendingAmount: number;
    overdueCount: number;
    todaySales: number;
    todayCollections: number;
    todayProfit: number;
    todayBirds: number;
    todayWeight: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function sum(arr: number[]): number {
  return arr.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/* ------------------------------------------------------------------ */
/*  Main derivation                                                    */
/* ------------------------------------------------------------------ */
export function deriveDashboard(data: DashboardData): DerivedDashboard {
  const today = todayIso();
  const yesterday = isoDaysAgo(1);

  const todaySales = sum(data.shopSales.filter((s) => s.tripDate === today).map((s) => Number(s.amount) || 0));
  const yesterdaySales = sum(data.shopSales.filter((s) => s.tripDate === yesterday).map((s) => Number(s.amount) || 0));
  const todayCollections = sum(data.collections.filter((c) => c.collectionDate === today).map((c) => Number(c.amount) || 0));
  const yesterdayCollections = sum(data.collections.filter((c) => c.collectionDate === yesterday).map((c) => Number(c.amount) || 0));
  const todayFuel = sum(data.fuelExpenses.filter((f) => f.date === today).map((f) => Number(f.amount) || 0));
  const todayTripExpense = sum(data.trips.filter((t) => t.tripDate === today).map((t) => Number(t.expense) || 0));
  const yesterdayFuel = sum(data.fuelExpenses.filter((f) => f.date === yesterday).map((f) => Number(f.amount) || 0));
  const yesterdayTripExpense = sum(data.trips.filter((t) => t.tripDate === yesterday).map((t) => Number(t.expense) || 0));
  const todayProfit = todaySales - todayFuel - todayTripExpense;
  const yesterdayProfit = yesterdaySales - yesterdayFuel - yesterdayTripExpense;

  const pendingAmount = sum(data.pendingCollections.map((p) => Number(p.currentPending) || 0));
  const overdueCount = data.pendingCollections.filter((p) => Number(p.overdueDays) > 0).length;

  const activeShops = data.shops.filter((s) => s.status === "Active").length;
  const activeFarms = data.farms.filter((f) => f.status === "Active").length;
  const activeVehicles = data.vehicles.filter((v) => v.status === "Active").length;
  const activeEmployees = data.employees.filter((e) => e.status === "Active").length;

  /* ----- 7-day series ----- */
  const series = Array.from({ length: 7 }, (_, i) => {
    const date = isoDaysAgo(6 - i);
    const sales = sum(data.shopSales.filter((s) => s.tripDate === date).map((s) => Number(s.amount) || 0));
    const collections = sum(data.collections.filter((c) => c.collectionDate === date).map((c) => Number(c.amount) || 0));
    const birds = sum(data.shopSales.filter((s) => s.tripDate === date).map((s) => Number(s.totalBirds) || 0));
    const weight = sum(data.shopSales.filter((s) => s.tripDate === date).map((s) => Number(s.totalWeight) || 0));
    const fuel = sum(data.fuelExpenses.filter((f) => f.date === date).map((f) => Number(f.amount) || 0));
    const tripExpense = sum(data.trips.filter((t) => t.tripDate === date).map((t) => Number(t.expense) || 0));
    const label = new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
    return { date: label, iso: date, sales, collections, birds, weight, expenses: fuel + tripExpense };
  });

  const salesVsCollections = series.map((s) => ({
    date: s.date,
    sales: Math.round(s.sales),
    collections: Math.round(s.collections),
  }));
  const weeklyRevenue = series.map((s) => ({ day: s.date, revenue: Math.round(s.sales) }));
  const deliveryVolume = series.map((s) => ({ date: s.date, birds: s.birds, weight: Math.round(s.weight * 10) / 10 }));

  /* ----- Today's trips ----- */
  const todaysTrips = data.trips.filter((t) => t.tripDate === today);
  const latestTrips = todaysTrips.length > 0 ? todaysTrips : data.trips.slice(0, 5);

  const toTripView = (t: Trip): TripView => ({
    tripNo: t.tripNo || "—",
    vehicle: t.vehicleNo || "—",
    driver: t.driverName || "—",
    supervisor: t.supervisorName || "—",
    farm: t.sourceFarm || "—",
    shop: t.deliveries?.[0]?.shopName || t.lastShop || "—",
    birds: t.totalBirdsDelivered || t.totalBirds || t.birds || 0,
    weight: t.totalDeliveredWeight || t.totalWeight || t.weight || 0,
    status: t.status,
  });

  const tripViews = (latestTrips.length > 0 ? latestTrips : []).map(toTripView);
  const todayTripViews = todaysTrips.map(toTripView);

  /* ----- Fleet status ----- */
  const todayPendingTrips = data.trips.filter((t) => t.tripDate === today && (t.status === "Pending" || t.status === "Draft"));
  const maintenanceRecords = (() => {
    try {
      return getMaintenance() as unknown[];
    } catch {
      return [];
    }
  })();

  const fleet: FleetVehicleView[] = data.vehicles.map((v) => {
    const vehicleTrips = data.trips.filter((t) => t.vehicleNo === v.number);
    const latestTrip = vehicleTrips.sort((a, b) => b.tripDate.localeCompare(a.tripDate))[0];
    const onTrip = todayPendingTrips.find((t) => t.vehicleNo === v.number);
    const recentMaintenance = maintenanceRecords
      .map((m) => m as { vehicleId?: string | number; vehicleNo?: string; date?: string; nextServiceKM?: number })
      .filter((m) => String(m.vehicleId ?? "") === String(v.id) || m.vehicleNo === v.number)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    const fuelRecords = data.fuelExpenses.filter((f) => f.vehicleNo === v.number);
    const lastFuel = fuelRecords.sort((a, b) => b.date.localeCompare(a.date))[0];

    // Status follows the real backend contract — the vehicle master record
    // only persists Active/Inactive (no persisted "Maintenance" state):
    //  · Inactive  → master record status "Inactive"
    //  · On Trip   → master status Active + a current active trip
    //  · Available → master status Active + no current active trip
    // Service due and recent servicing are alerts/info, never a status.
    const status: FleetVehicleView["status"] =
      v.status === "Inactive" ? "Inactive" : onTrip ? "On Trip" : "Available";

    const lastMeter = latestTrip
      ? Number(latestTrip.closingMeter) || Number(latestTrip.openingMeter) + Number(latestTrip.totalKm) || null
      : null;

    return {
      id: v.id,
      number: v.number,
      type: v.type,
      status,
      driver: latestTrip?.driverName || "—",
      currentTrip: onTrip?.tripNo || "",
      fuel: lastFuel ? Number(lastFuel.amount) || 0 : 0,
      km: lastMeter,
      maintenanceNote: recentMaintenance ? `Next service ${recentMaintenance.nextServiceKM ? `${recentMaintenance.nextServiceKM} km` : "due"}` : "No open issues",
      insuranceExpiry: v.insuranceExpiry,
      permitExpiry: v.permitExpiry,
    };
  });

  const vehicleActivity = (["On Trip", "Available", "Inactive"] as const).map((status, i) => ({
    name: status,
    value: fleet.filter((f) => f.status === status).length,
    color: ["#059669", "#0ea5e9", "#94a3b8"][i],
  }));

  /* ----- Activity timeline ----- */
  const activity: ActivityItem[] = [];

  data.trips
    .filter((t) => t.tripDate === today && t.status === "Completed")
    .slice(0, 3)
    .forEach((t) => {
      activity.push({
        id: `trip-${t.tripNo}`,
        title: `Delivery completed — ${t.tripNo}`,
        description: `${t.vehicleNo} · ${t.deliveries?.length ?? 0} shop deliveries · ${formatWeight(t.totalDeliveredWeight || 0)}`,
        time: "Today",
        tone: "brand",
        icon: Truck,
      });
    });

  data.collections
    .filter((c) => c.collectionDate === today)
    .slice(0, 3)
    .forEach((c) => {
      activity.push({
        id: `col-${c.collectionNo}`,
        title: `Collection received — ${c.shopName}`,
        description: `${formatINR(Number(c.amount) || 0)} via ${c.paymentModeName}`,
        time: "Today",
        tone: "sky",
        icon: CreditCard,
      });
    });

  data.fuelExpenses
    .filter((f) => f.date === today)
    .slice(0, 2)
    .forEach((f) => {
      activity.push({
        id: `fuel-${f.billNo}`,
        title: `Fuel entry created — ${f.billNo}`,
        description: `${f.vehicleNo} · ${f.litres} L · ${formatINR(Number(f.amount) || 0)}`,
        time: "Today",
        tone: "amber",
        icon: Bird,
      });
    });

  (maintenanceRecords as { vehicleNo?: string; date?: string; totalCost?: number }[])
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 2)
    .forEach((m) => {
      activity.push({
        id: `maint-${m.vehicleNo}-${m.date}`,
        title: `Vehicle maintenance completed — ${m.vehicleNo ?? "Vehicle"}`,
        description: `${formatINR(Number(m.totalCost) || 0)} service cost`,
        time: m.date ?? "",
        tone: "violet",
        icon: Truck,
      });
    });

  activity.sort((a, b) => b.time.localeCompare(a.time));

  /* ----- KPIs ----- */
  const kpis: KpiDatum[] = [
    {
      key: "shops",
      label: "Total Shops",
      value: formatNumber(data.shops.length),
      sub: `${activeShops} active · ${data.shops.length - activeShops} inactive`,
      delta: null,
      trend: "flat",
      icon: Store,
      tone: "brand",
      spark: series.map((s) => ({ x: s.date, y: data.shops.length })),
    },
    {
      key: "farms",
      label: "Active Farms",
      value: formatNumber(activeFarms),
      sub: `${data.farms.length} farms on record`,
      delta: null,
      trend: "flat",
      icon: Sprout,
      tone: "violet",
      spark: series.map((s) => ({ x: s.date, y: activeFarms })),
    },
    {
      key: "vehicles",
      label: "Vehicles",
      value: formatNumber(data.vehicles.length),
      sub: `${activeVehicles} in service`,
      delta: null,
      trend: "flat",
      icon: Truck,
      tone: "sky",
      spark: series.map((s) => ({ x: s.date, y: activeVehicles })),
    },
    {
      key: "employees",
      label: "Employees",
      value: formatNumber(data.employees.length),
      sub: `${activeEmployees} on duty`,
      delta: null,
      trend: "flat",
      icon: Users,
      tone: "amber",
      spark: series.map((s) => ({ x: s.date, y: activeEmployees })),
    },
    {
      key: "todaySales",
      label: "Today's Sales",
      value: formatINRCompact(todaySales),
      sub: `vs ${formatINRCompact(yesterdaySales)} yesterday`,
      delta: pctChange(todaySales, yesterdaySales),
      trend: todaySales >= yesterdaySales ? "up" : "down",
      icon: IndianRupee,
      tone: "brand",
      spark: series.map((s) => ({ x: s.date, y: s.sales })),
    },
    {
      key: "todayCollections",
      label: "Today's Collections",
      value: formatINRCompact(todayCollections),
      sub: `vs ${formatINRCompact(yesterdayCollections)} yesterday`,
      delta: pctChange(todayCollections, yesterdayCollections),
      trend: todayCollections >= yesterdayCollections ? "up" : "down",
      icon: CreditCard,
      tone: "sky",
      spark: series.map((s) => ({ x: s.date, y: s.collections })),
    },
    {
      key: "pending",
      label: "Pending Collections",
      value: formatINRCompact(pendingAmount),
      sub: overdueCount > 0 ? `${overdueCount} shops overdue` : `${data.pendingCollections.length} shops to collect`,
      delta: null,
      trend: "flat",
      icon: CreditCard,
      tone: "rose",
      spark: series.map((s) => ({ x: s.date, y: Math.round(s.sales - s.collections) })),
    },
    {
      key: "profit",
      label: "Today's Profit",
      value: formatINRCompact(todayProfit),
      sub: `vs ${formatINRCompact(yesterdayProfit)} yesterday`,
      delta: pctChange(todayProfit, yesterdayProfit),
      trend: todayProfit >= yesterdayProfit ? "up" : "down",
      icon: TrendingUp,
      tone: "violet",
      spark: series.map((s) => ({ x: s.date, y: Math.round(s.sales - s.expenses) })),
    },
  ];

  const hasAnyData =
    data.trips.length > 0 ||
    data.collections.length > 0 ||
    data.shopSales.length > 0 ||
    data.shops.length > 0 ||
    data.vehicles.length > 0;

  return {
    kpis,
    salesVsCollections,
    weeklyRevenue,
    deliveryVolume,
    vehicleActivity,
    todayTrips: todayTripViews,
    latestTrips: tripViews,
    pendingCollections: data.pendingCollections,
    fleet,
    activity,
    hasAnyData,
    totals: {
      pendingAmount,
      overdueCount,
      todaySales,
      todayCollections,
      todayProfit,
      todayBirds: sum(data.shopSales.filter((s) => s.tripDate === today).map((s) => Number(s.totalBirds) || 0)),
      todayWeight: sum(data.shopSales.filter((s) => s.tripDate === today).map((s) => Number(s.totalWeight) || 0)),
    },
  };
}

export type { VehicleRow };
