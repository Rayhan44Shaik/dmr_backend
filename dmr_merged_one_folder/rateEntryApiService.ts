/**
 * Rate Entry — PostgreSQL via shared Axios helpers. PostgreSQL (not
 * localStorage) is the single source of truth for eligible trips and their
 * shop-wise rates.
 *
 * Backend contract (Rate Entry owns the lock):
 *   GET  /operations/rate-entry              -> eligible trips (Completed, not deleted, not rate-locked)
 *   GET  /operations/rate-entry/:tripId      -> trip detail + shop-wise deliveries + market-rate reference
 *   PUT  /operations/rate-entry/:tripId      -> save (draft) rates; does NOT lock
 *   POST /operations/rate-entry/:tripId/lock -> save & lock — immutable, unlocks Shop Sales
 */
import { apiGet, apiPost, apiPut } from "../../../../api";
import type { Trip } from "../../vehicle-trips/types/trip";
import type { RateEntryMarketRateMasterDto } from "../utils/rateEntryMarketMaster";

const RATE_ENTRY_PATH = "/operations/rate-entry";

/**
 * Backend RateEntryDelivery — the authoritative shop-wise delivery line as
 * returned by GET /operations/rate-entry/:tripId (camelCase). `marketRate`
 * carries the READ-ONLY market/reference rate the backend already resolved.
 */
export interface RateEntryDeliveryDto {
  id: number;
  serialNo: number | null;
  boxNo: number | null;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  birds: number;
  weight: number;
  mortality: number;
  mortKg: number | null;
  rate: number | null;
  amount: number;
  remarks: string;
  deliveryMode: "box" | "weight";
  marketRate: {
    shopId: number | null;
    shopName: string;
    birdTypeId: number | null;
    birdType: string;
    masterRate: number | null;
    lastTripRate: number | null;
    lastTripDate: string | null;
    lastTripNo: string | null;
    avgTripRate: number | null;
    tripRateSamples: number;
  } | null;
}

/** Backend RateEntryTrip — the authoritative Rate Entry row shape. */
export interface RateEntryTripDto {
  id: number;
  tripNo: string;
  tripDate: string;
  status: string;
  vehicleNo: string | null;
  driverName: string | null;
  supervisorName: string | null;
  sourceFarm: string | null;
  totalBirds: number;
  totalWeight: number;
  totalShops: number;
  rateLocked: boolean;
  rateLockedAt: string | null;
  rateLockedBy: string | null;
  ratesEntered: number;
  deliveriesCount: number;
  totalAmount: number;
  deliveries: RateEntryDeliveryDto[];
  marketRatesWindow?: Array<{
    businessDate: string;
    entered?: boolean;
    vencobRate: number | null;
    vencobVii: number | null;
    vencobGun: number | null;
    sneha: number | null;
    associationVii: number | null;
    vij: number | null;
    gun: number | null;
    rp: number | null;
    sizeColumns?: Record<string, number | null>;
  }>;
  marketRateMaster?: RateEntryMarketRateMasterDto | null;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Maps a backend RateEntryTrip row onto the frontend Trip shape the
 * existing table/filter components consume. Deliveries are populated from
 * the backend detail; list rows carry empty deliveries (loaded on demand
 * when the user opens the modal via GET /operations/rate-entry/:tripId).
 */
function mapRowToTrip(row: RateEntryTripDto, withDeliveries: boolean): Trip {
  const now = new Date().toISOString();
  return {
    id: row.id,
    tripNo: row.tripNo,
    tripDate: row.tripDate,
    startTime: "",
    vehicleId: 0,
    vehicleNo: row.vehicleNo ?? "",
    driverId: 0,
    driverName: row.driverName ?? "",
    supervisorId: 0,
    supervisorName: row.supervisorName ?? "",
    advanceAmount: 0,
    helpers: [],
    openingMeter: 0,
    startStepSubmitted: true,
    sourceFarmId: 0,
    sourceFarm: row.sourceFarm ?? "",
    reachedTime: "",
    destMeter: 0,
    pickupTolls: 0,
    farmStepSubmitted: true,
    dcWeight: 0,
    totalBirds: row.totalBirds,
    boxes: 0,
    avgWeight: 0,
    pickupLoadTime: "",
    pickupStepSubmitted: true,
    boxNo: 0,
    birds: 0,
    weight: 0,
    boxDetails: [],
    deliveries: withDeliveries
      ? row.deliveries.map((d) => ({
          id: d.id,
          boxNo: d.boxNo ?? 0,
          shopId: d.shopId ?? 0,
          shopName: d.shopName,
          birdTypeId: d.birdTypeId ?? 0,
          birdType: d.birdType,
          birds: num(d.birds),
          weight: num(d.weight),
          mortality: num(d.mortality),
          rate: d.rate,
          amount: num(d.amount),
          remarks: d.remarks,
          // Carry the backend market/reference rate for display (read-only).
          marketRate: d.marketRate,
        }))
      : [],
    deliveryStepSubmitted: true,
    closingMeter: 0,
    endTime: "",
    deliveryTolls: 0,
    totalKm: 0,
    totalShops: row.totalShops,
    totalWeight: row.totalWeight,
    totalDeliveredWeight: row.totalWeight,
    totalBirdsDelivered: row.totalBirds,
    totalMortality: 0,
    totalMortalityCount: 0,
    totalMortalityWeight: 0,
    weightLoss: 0,
    survivalRate: 0,
    lastShop: "",
    fuel: 0,
    expense: 0,
    remarks: "",
    status: "Completed",
    rateCompleted: row.rateLocked,
    rateLockedAt: row.rateLockedAt,
    rateLockedBy: row.rateLockedBy,
    ratesEntered: row.ratesEntered,
    createdAt: now,
    updatedAt: now,
    marketRatesWindow: row.marketRatesWindow ?? [],
    marketRateMaster: row.marketRateMaster ?? null,
  } as Trip;
}

/** GET /operations/rate-entry — trips currently eligible for rate entry
 * (Completed, not deleted, not rate-locked). The backend is the authority. */
export async function listEligibleTrips(): Promise<Trip[]> {
  const { data } = await apiGet<RateEntryTripDto[]>(RATE_ENTRY_PATH);
  return (data || []).map((row) => mapRowToTrip(row, false));
}

/** GET /operations/rate-entry/:tripId — full trip detail with shop-wise
 * deliveries + market-rate reference, for the Enter/Modify Rate modal. */
export async function getRateEntryTrip(tripId: number): Promise<Trip> {
  const { data } = await apiGet<RateEntryTripDto>(`${RATE_ENTRY_PATH}/${tripId}`);
  return mapRowToTrip(data, true);
}

/** PUT /operations/rate-entry/:tripId — save (draft) shop-wise rates.
 * Sends only deliveryId + rate; amount is always computed server-side.
 * Blank shops are omitted so partial progress is persistable. */
export async function saveRates(
  tripId: number,
  deliveries: Array<{ deliveryId: number; rate: number }>
): Promise<void> {
  const lines = deliveries
    .filter((d) => d.rate != null && Number.isFinite(d.rate) && d.rate >= 50 && d.rate <= 300)
    .map((d) => ({ deliveryId: d.deliveryId, rate: d.rate }));
  await apiPut(`${RATE_ENTRY_PATH}/${tripId}`, { rates: lines });
}

/** POST /operations/rate-entry/:tripId/lock — atomic persist + lock. */
export async function lockRates(
  tripId: number,
  actor = "web-user",
  deliveries: Array<{ deliveryId: number; rate: number }> = []
): Promise<void> {
  const lines = deliveries
    .filter((d) => d.rate != null && Number.isFinite(d.rate) && d.rate >= 50 && d.rate <= 300)
    .map((d) => ({ deliveryId: d.deliveryId, rate: d.rate }));
  await apiPost(`${RATE_ENTRY_PATH}/${tripId}/lock`, { lockedBy: actor, rates: lines });
}

/** Atomic Save & Lock — single POST /lock with rates in the same transaction. */
export async function saveAndLockRates(
  tripId: number,
  deliveries: Array<{ deliveryId: number; rate: number }>,
  actor = "web-user"
): Promise<void> {
  await lockRates(tripId, actor, deliveries);
}
