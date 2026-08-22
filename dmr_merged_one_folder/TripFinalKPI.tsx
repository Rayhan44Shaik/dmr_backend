// src/modules/operations/vehicle-trips/components/TripFinalKPI.tsx

import { useMemo } from "react";
import type { Trip, ShopDelivery } from "../types/trip";
import {
  calculateDeliveryDisplayTotals,
  calculateTripDistances,
  sumFlattenedDieselLitres,
} from "../../../../shared/trip/calculations";
import {
  Weight,
  Bird,
  ShoppingBag,
  HeartPulse,
  TrendingDown,
  Ticket,
  Route,
  Fuel,
  MapPin,
  Map,
  Receipt,
} from "lucide-react";

interface Props {
  trip: Trip | null;
  deliveries?: ShopDelivery[];
}

function kpiNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatKg(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)} Kg`;
}

function formatCount(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return suffix ? `${value}${suffix}` : String(value);
}

function formatKm(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)} KM`;
}

export default function TripFinalKPI({ trip, deliveries = [] }: Props) {
  if (!trip) {
    return null;
  }

  const t = trip as any;
  const pickupSubmitted = Boolean(trip.pickupStepSubmitted);
  const farmSubmitted = Boolean(trip.farmStepSubmitted);
  const deliverySubmitted = Boolean(trip.deliveryStepSubmitted);
  const expensesSubmitted = Boolean(t.expensesStepSubmitted || t.endStepSubmitted);

  const persistedDeliveries = deliverySubmitted
    ? (Array.isArray(deliveries) && deliveries.length ? deliveries : trip.deliveries || [])
    : [];

  const deliveryTotals = useMemo(
    () =>
      deliverySubmitted
        ? calculateDeliveryDisplayTotals(trip, persistedDeliveries)
        : { totalBirds: 0, totalWeight: 0, totalMortality: 0, totalMortalityKg: 0 },
    [deliverySubmitted, persistedDeliveries, trip]
  );

  const mortalityWeight = deliveryTotals.totalMortalityKg;

  // ─── Weight Loss ──────────────────────────────────────────────────
  const weightLoss = useMemo(() => {
    const dcWeight = trip.dcWeight || 0;
    const totalOut = deliveryTotals.totalWeight + mortalityWeight;
    return Math.max(0, dcWeight - totalOut);
  }, [deliveryTotals.totalWeight, mortalityWeight, trip.dcWeight]);

  // ─── Distances (For Display) ────────────────────────────────────────
  const {
    pickupDistance: pickupDist,
    deliveryDistance: deliveryDist,
    totalDistance: totalDist,
  } = calculateTripDistances(trip);

  // ─── Synchronized Mileage (Odometer Logic) ──────────────────────────
  const mileage = useMemo(() => {
    const startMeter = Number(trip.openingMeter || 0);
    const endMeter = Number(t.endMeter ?? t.closingMeter ?? 0);
    const odometerDistanceCovered = (startMeter > 0 && endMeter > startMeter) ? endMeter - startMeter : 0;
    
    const totalDieselLiters = sumFlattenedDieselLitres(t);
    const backendMileage = t.mileageKmL;

    if (backendMileage != null && Number.isFinite(Number(backendMileage)) && Number(backendMileage) > 0) {
      return Number(backendMileage);
    }
    
    return odometerDistanceCovered > 0 && totalDieselLiters > 0
      ? odometerDistanceCovered / totalDieselLiters
      : 0;
  }, [trip, t]);

  // ─── Synchronized Expenses ──────────────────────────────────────────
  const totalExpenses = useMemo(() => {
    // 1:1 match with StepEnd.tsx expense calculation logic
    const computedExpenses =
      Number(t.meals || 0) +
      Number(t.loading || 0) +
      Number(t.mealsTiffin || 0) +
      Number(t.vehicleMaintenance || 0) +
      Number(t.othersRC || 0) +
      Number(t.others1Amt || 0) +
      Number(t.others2Amt || 0) +
      Number(t.others3Amt || 0) +
      Number(t.others4Amt || 0) +
      Number(t.others5Amt || 0);

    // Fallback to backend saved totalExpenses if computed is 0
    return computedExpenses > 0 ? computedExpenses : Number(t.totalExpenses || 0);
  }, [t]);

  const dcWeight = pickupSubmitted ? kpiNumber(trip.dcWeight) : null;
  const totalBirds = pickupSubmitted ? kpiNumber(trip.totalBirds) : null;
  const deliveryWeight = deliverySubmitted ? kpiNumber(deliveryTotals.totalWeight) : null;
  const deliveryBirds = deliverySubmitted ? kpiNumber(deliveryTotals.totalBirds) : null;
  const mortalityCount = deliverySubmitted ? kpiNumber(deliveryTotals.totalMortality) : null;
  const mortalityKg = deliverySubmitted ? kpiNumber(mortalityWeight) : null;
  const weightLossValue =
    pickupSubmitted && deliverySubmitted ? kpiNumber(weightLoss) : null;
  const pickupDistValue = farmSubmitted && trip.startStepSubmitted ? kpiNumber(pickupDist) : null;
  const deliveryDistValue = expensesSubmitted ? kpiNumber(deliveryDist) : null;
  const totalDistValue = expensesSubmitted ? kpiNumber(totalDist) : null;
  const pickupTollsValue = farmSubmitted ? kpiNumber(trip.pickupTolls) ?? 0 : null;
  const deliveryTollsValue = expensesSubmitted ? kpiNumber(trip.deliveryTolls) ?? 0 : null;
  const tollsValue =
    pickupTollsValue == null && deliveryTollsValue == null
      ? null
      : (pickupTollsValue ?? 0) + (deliveryTollsValue ?? 0);
  const mileageValue = expensesSubmitted ? kpiNumber(mileage) : null;
  const expensesValue = expensesSubmitted ? kpiNumber(totalExpenses) : null;

  const row1Cards = [
    {
      label: "DC WEIGHT",
      value: formatKg(dcWeight),
      sub: "Load from Farm",
      bg: "bg-blue-50",
      icon: <Weight size={18} className="text-blue-600" />,
    },
    {
      label: "TOTAL BIRDS",
      value: formatCount(totalBirds),
      sub: "Picked up from Farm",
      bg: "bg-green-50",
      icon: <Bird size={18} className="text-green-600" />,
    },
    {
      label: "DELIVERY WEIGHT",
      value: formatKg(deliveryWeight),
      sub: deliverySubmitted ? `${persistedDeliveries.length} Shop Delivery(s)` : "Not submitted",
      bg: "bg-slate-50",
      icon: <ShoppingBag size={18} className="text-slate-700" />,
    },
    {
      label: "DELIVERY BIRDS",
      value: formatCount(deliveryBirds),
      sub: "Total to Shops",
      bg: "bg-cyan-50",
      icon: <Bird size={18} className="text-cyan-600" />,
    },
    {
      label: "MORTALITY",
      value: mortalityCount == null ? "—" : `${mortalityCount} Birds`,
      sub: mortalityKg == null ? "Not submitted" : `${mortalityKg.toFixed(2)} Kg Total`,
      bg: "bg-red-50",
      icon: <HeartPulse size={18} className="text-red-600" />,
    },
    {
      label: "WEIGHT LOSS",
      value: formatKg(weightLossValue),
      sub: "DC - Del - Mort",
      bg: "bg-amber-50",
      icon: <TrendingDown size={18} className="text-amber-600" />,
    },
  ];

  const row2Cards = [
    {
      label: "PICKUP DIST",
      value: formatKm(pickupDistValue),
      sub: "Start to Farm",
      bg: "bg-indigo-50/50",
      icon: <MapPin size={18} className="text-indigo-600" />,
    },
    {
      label: "DELIVERY DIST",
      value: formatKm(deliveryDistValue),
      sub: "Farm to Last Drop",
      bg: "bg-indigo-50/50",
      icon: <Map size={18} className="text-indigo-600" />,
    },
    {
      label: "TOTAL DISTANCE",
      value: formatKm(totalDistValue),
      sub: "Full Trip Total",
      bg: "bg-indigo-50",
      icon: <Route size={18} className="text-indigo-700" />,
    },
    {
      label: "TOLL GATES",
      value: formatCount(tollsValue),
      sub:
        pickupTollsValue == null && deliveryTollsValue == null
          ? "Not submitted"
          : `P: ${pickupTollsValue ?? 0} • D: ${deliveryTollsValue ?? 0}`,
      bg: "bg-violet-50",
      icon: <Ticket size={18} className="text-violet-600" />,
    },
    {
      label: "MILEAGE",
      value: mileageValue == null ? "—" : mileageValue.toFixed(2),
      sub: "KM/Ltr Efficiency",
      bg: "bg-purple-50",
      icon: <Fuel size={18} className="text-purple-600" />,
    },
    {
      label: "EXPENSES",
      value: expensesValue == null ? "—" : `₹${expensesValue.toFixed(0)}`,
      sub: "Total Trip Spends",
      bg: "bg-orange-50",
      icon: <Receipt size={18} className="text-orange-600" />,
    },
  ];

  return (
    <div className="mt-8 p-6 md:p-8 w-full bg-slate-50/50 rounded-3xl border border-slate-200/60 shadow-sm overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
      <h3 className="text-sm font-bold text-slate-700 mb-5 uppercase tracking-wider pl-1">
        Trip Final KPI Summary
      </h3>
      
      {/* ─── Row 1: Load, Delivery & Mortality (Forced Wide Layout) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-5 mb-5 min-w-[900px] xl:min-w-full">
        {row1Cards.map((card, idx) => (
          <div
            key={`r1-${idx}`}
            className={`${card.bg} p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between gap-3 overflow-hidden min-w-[140px]`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                {card.label}
              </span>
              <div className="p-1.5 bg-white/70 rounded-full border border-slate-100/80 shadow-xs shrink-0">
                {card.icon}
              </div>
            </div>
            <div className="mt-1">
              <div className="text-xl font-bold text-slate-900 truncate">
                {card.value}
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1.5 truncate">
                {card.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Row 2: Distance, Tolls, Metrics (Forced Wide Layout) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-5 min-w-[900px] xl:min-w-full">
        {row2Cards.map((card, idx) => (
          <div
            key={`r2-${idx}`}
            className={`${card.bg} p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between gap-3 overflow-hidden min-w-[140px]`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                {card.label}
              </span>
              <div className="p-1.5 bg-white/70 rounded-full border border-slate-100/80 shadow-xs shrink-0">
                {card.icon}
              </div>
            </div>
            <div className="mt-1">
              <div className="text-xl font-bold text-slate-900 truncate">
                {card.value}
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1.5 truncate">
                {card.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}