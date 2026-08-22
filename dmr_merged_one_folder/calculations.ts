import type { BoxDetail, ShopDelivery, Trip } from "./types";

export function calculateAvgWeight(dcWeight: number, totalBirds: number): number {
  if (!dcWeight || !totalBirds) return 0;
  return Number((dcWeight / totalBirds).toFixed(3));
}

export function calculateTripKPIs(
  dcWeight: number,
  totalBirds: number,
  totalDeliveredWeight: number,
  totalMortalityCount: number,
  avgWeight: number
) {
  const totalMortalityWeight = Number((totalMortalityCount * avgWeight).toFixed(2));
  const weightLoss = Number((dcWeight - totalDeliveredWeight - totalMortalityWeight).toFixed(2));
  const survivalRate = totalBirds > 0
    ? Number(((1 - totalMortalityCount / totalBirds) * 100).toFixed(1))
    : 0;
  return { totalMortalityWeight, weightLoss, survivalRate };
}

export function calculateTotals(rows: ShopDelivery[], avgWeight = 0) {
  const totalShops = rows.length;
  const totalBirds = rows.reduce((sum, row) => sum + Number(row.birds || 0), 0);
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  const totalMortality = rows.reduce((sum, row) => sum + Number(row.mortality || 0), 0);
  const lastShop = rows.length > 0 ? rows[rows.length - 1].shopName : "";
  const { totalMortalityWeight, weightLoss, survivalRate } = calculateTripKPIs(
    0,
    totalBirds,
    totalWeight,
    totalMortality,
    avgWeight
  );
  return {
    totalShops,
    totalBirds,
    totalWeight,
    totalMortality,
    lastShop,
    totalDeliveredWeight: totalWeight,
    totalBirdsDelivered: totalBirds,
    totalMortalityWeight,
    weightLoss,
    survivalRate,
  };
}

export function calculateBoxAvgWeight(birds: number, weight: number): number | null {
  if (!(birds > 0) || !(weight > 0) || !Number.isFinite(birds) || !Number.isFinite(weight)) {
    return null;
  }
  return Number((weight / birds).toFixed(3));
}

export function calculatePickupTotals(rows: BoxDetail[]) {
  const entered = rows.filter((row) => Number(row.birds || 0) > 0 || Number(row.weight || 0) > 0);
  const totalBirds = entered.reduce((sum, row) => sum + Number(row.birds || 0), 0);
  const dcWeight = Number(
    entered.reduce((sum, row) => sum + Number(row.weight || 0), 0).toFixed(2)
  );
  return {
    totalBirds,
    dcWeight,
    boxes: entered.length,
    avgWeight: calculateAvgWeight(dcWeight, totalBirds),
  };
}

export function calculateDeliveryMetrics(
  trip: Pick<Trip, "totalBirds" | "dcWeight" | "avgWeight">,
  deliveries: ShopDelivery[]
) {
  const totalBirdsDelivered = deliveries.reduce(
    (sum, row) => sum + Number(row.birds || 0),
    0
  );
  const totalDeliveredWeight = deliveries.reduce(
    (sum, row) => sum + Number(row.weight || 0),
    0
  );
  const totalMortalityCount = deliveries.reduce(
    (sum, row) => sum + Number(row.mortality || 0),
    0
  );
  const { totalMortalityWeight, weightLoss, survivalRate } = calculateTripKPIs(
    trip.dcWeight,
    trip.totalBirds,
    totalDeliveredWeight,
    totalMortalityCount,
    trip.avgWeight
  );
  return {
    totalShops: deliveries.length,
    totalBirdsDelivered,
    totalDeliveredWeight,
    totalWeight: totalDeliveredWeight,
    totalMortality: totalMortalityCount,
    totalMortalityCount,
    totalMortalityWeight,
    weightLoss,
    survivalRate,
    lastShop: deliveries.length > 0 ? deliveries[deliveries.length - 1].shopName : "",
  };
}

export function applyDeliveryMetrics(trip: Trip, deliveries: ShopDelivery[]): Trip {
  return {
    ...trip,
    deliveries,
    ...calculateDeliveryMetrics(trip, deliveries),
  };
}

export function calculateDeliveryDisplayTotals(trip: Trip, deliveries: ShopDelivery[]) {
  if (!deliveries.length) {
    return {
      totalBirds: trip.totalBirdsDelivered || 0,
      totalWeight: trip.totalDeliveredWeight || 0,
      totalMortality: trip.totalMortalityCount || 0,
      totalMortalityKg: trip.totalMortalityWeight || 0,
    };
  }
  return deliveries.reduce(
    (totals, row) => {
      const extra = row as ShopDelivery & { mortalityWeight?: number; mortalityKg?: number };
      let mortalityKg = extra.mortalityWeight ?? extra.mortalityKg ?? 0;
      if (!mortalityKg && row.mortality > 0) {
        const average = row.birds > 0
          ? row.weight / row.birds
          : trip.totalBirds > 0
            ? trip.dcWeight / trip.totalBirds
            : 0;
        mortalityKg = row.mortality * average;
      }
      return {
        totalBirds: totals.totalBirds + Number(row.birds || 0),
        totalWeight: totals.totalWeight + Number(row.weight || 0),
        totalMortality: totals.totalMortality + Number(row.mortality || 0),
        totalMortalityKg: totals.totalMortalityKg + mortalityKg,
      };
    },
    { totalBirds: 0, totalWeight: 0, totalMortality: 0, totalMortalityKg: 0 }
  );
}

export function calculateKM(openingMeter: number, closingMeter: number): number {
  if (!openingMeter || !closingMeter || closingMeter <= openingMeter) return 0;
  return closingMeter - openingMeter;
}

export function calculateTripDistances(
  trip: Pick<Trip, "openingMeter" | "destMeter" | "closingMeter">
) {
  return {
    pickupDistance: Math.max(0, (trip.destMeter || 0) - (trip.openingMeter || 0)),
    deliveryDistance: Math.max(0, (trip.closingMeter || 0) - (trip.destMeter || 0)),
    totalDistance: Math.max(0, (trip.closingMeter || 0) - (trip.openingMeter || 0)),
  };
}

export function sumFlattenedDieselLitres(values: Record<string, unknown>, maxRows = 6): number {
  let total = 0;
  for (let index = 1; index <= maxRows; index += 1) {
    total += Number(values[`dieselLtr${index}`] || 0);
  }
  return total;
}
