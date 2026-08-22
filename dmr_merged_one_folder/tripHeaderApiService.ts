/**
 * Trip Entry wizard — PostgreSQL via shared Axios helpers.
 * Step 1: POST /trips/steps/start
 * Steps 2–5: POST /trips/:id/steps/:step
 * No draft/localStorage persistence for the active wizard session.
 */

import {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  handleApiError,
} from "../../../../api";
import {
  createEmptyTrip,
  isTripStatus,
  type Trip,
  type TripStatus,
} from "../../../../shared/trip";

const TRIPS_PATH = "/trips";

/** Raw trip shape returned by GET/PUT/POST /api/trips */
type ApiTripRecord = Record<string, unknown>;

export type LastClosingMeter = {
  closingMeter: number;
  tripNo: string;
  tripDate: string;
  /** Ledger event source (TRIP_START | TRIP_END | FUEL_EXPENSE | MAINTENANCE). */
  source?: string;
  /** Ledger event record id — the trip id for TRIP_START/TRIP_END events. */
  ref?: string | number | null;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function optionalQuantity(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numOrZero(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return num(value, 0);
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

/** Shared user-facing timestamp formatter for Step 1–5 View (locale/timezone as-is). */
export function formatStartTimeForDisplay(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }
  return raw;
}

function mapDeliveriesForDisplay(value: unknown, fallback: Trip["deliveries"]): Trip["deliveries"] {
  if (!Array.isArray(value)) return fallback;
  return value.map((row) => {
    const rec = row as Trip["deliveries"][number] & { selectedBoxIds?: unknown; boxNo?: unknown };
    const selectedBoxIds = Array.isArray(rec.selectedBoxIds)
      ? rec.selectedBoxIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const boxNoRaw = numOrNull(rec.boxNo);
    return {
      ...rec,
      selectedBoxIds,
      boxNo: boxNoRaw ?? selectedBoxIds.length,
      autoCaptureTime:
        formatStartTimeForDisplay(rec.autoCaptureTime) || rec.autoCaptureTime,
    };
  });
}

function mapDieselEntriesForDisplay(
  value: unknown,
  fallback: Trip["dieselEntries"]
): Trip["dieselEntries"] {
  if (!Array.isArray(value)) return fallback;
  return value.map((row) => {
    const entry = row as NonNullable<Trip["dieselEntries"]>[number];
    return {
      ...entry,
      submittedAt: formatStartTimeForDisplay(entry.submittedAt) || entry.submittedAt,
    };
  });
}

function mapFlattenedDieselTimestamps(raw: ApiTripRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (/^dieselSubmittedAt\d+$/.test(key)) {
      out[key] = formatStartTimeForDisplay(value) || value;
    }
  }
  return out;
}

function normalizeStatus(value: unknown): TripStatus {
  const status = str(value, "Draft");
  return isTripStatus(status) ? status : "Draft";
}

function normalizeDate(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

/** Map backend trip JSON onto the frontend Trip model. */
export function mapApiTripToTrip(raw: ApiTripRecord, existing?: Trip): Trip {
  const defaults: Trip = existing ?? createEmptyTrip({ tripDate: "" });

  return {
    ...defaults,
    ...raw,
    id: num(raw.id, defaults.id),
    tripNo: str(raw.tripNo ?? raw.trip_no, defaults.tripNo),
    tripDate: normalizeDate(raw.tripDate ?? raw.trip_date) || defaults.tripDate,
    status: normalizeStatus(raw.status ?? defaults.status),
    startTime: formatStartTimeForDisplay(raw.startTime ?? raw.start_time) || defaults.startTime,
    vehicleId: numOrZero(raw.vehicleId ?? raw.vehicle_id ?? defaults.vehicleId),
    vehicleNo: str(raw.vehicleNo ?? raw.vehicle_no, defaults.vehicleNo),
    driverId: numOrZero(raw.driverId ?? raw.driver_id ?? defaults.driverId),
    driverName: str(raw.driverName ?? raw.driver_name, defaults.driverName),
    supervisorId: numOrZero(raw.supervisorId ?? raw.supervisor_id ?? defaults.supervisorId),
    supervisorName: str(raw.supervisorName ?? raw.supervisor_name, defaults.supervisorName),
    helpers: Array.isArray(raw.helpers) ? (raw.helpers as string[]) : defaults.helpers,
    loaders: Array.isArray(raw.loaders) ? (raw.loaders as string[]) : defaults.loaders ?? [],
    openingMeter: numOrNull(raw.openingMeter ?? raw.opening_meter),
    advanceAmount: numOrNull(raw.advanceAmount ?? raw.advance_amount),
    startStepSubmitted: Boolean(raw.startStepSubmitted ?? raw.start_step_submitted ?? defaults.startStepSubmitted),
    remarks: str(raw.remarks, defaults.remarks),
    farmStepSubmitted: Boolean(raw.farmStepSubmitted ?? raw.farm_step_submitted ?? defaults.farmStepSubmitted),
    pickupStepSubmitted: Boolean(raw.pickupStepSubmitted ?? raw.pickup_step_submitted ?? defaults.pickupStepSubmitted),
    deliveryStepSubmitted: Boolean(raw.deliveryStepSubmitted ?? raw.delivery_step_submitted ?? defaults.deliveryStepSubmitted),
    endStepSubmitted: Boolean(raw.endStepSubmitted ?? raw.end_step_submitted ?? defaults.endStepSubmitted),
    expensesStepSubmitted: Boolean(raw.expensesStepSubmitted ?? raw.expenses_step_submitted ?? defaults.expensesStepSubmitted),
    expensesStepSubmittedAt: raw.expensesStepSubmittedAt != null || raw.expenses_step_submitted_at != null
      ? formatStartTimeForDisplay(raw.expensesStepSubmittedAt ?? raw.expenses_step_submitted_at)
      : defaults.expensesStepSubmittedAt,
    submittedAtTimestamp: formatStartTimeForDisplay(
      raw.expensesStepSubmittedAt ?? raw.expenses_step_submitted_at ?? raw.submittedAtTimestamp ?? raw.submittedAt
    ) || defaults.submittedAtTimestamp,
    mileageKmL: numOrNull(raw.mileageKmL ?? raw.mileage_km_l),
    dieselEntries: mapDieselEntriesForDisplay(raw.dieselEntries, defaults.dieselEntries),
    dcWeight: num(raw.dcWeight ?? raw.dc_weight, defaults.dcWeight),
    totalBirds: num(raw.totalBirds ?? raw.total_birds, defaults.totalBirds),
    boxes: num(raw.boxes, defaults.boxes),
    avgWeight: num(raw.avgWeight ?? raw.avg_weight, defaults.avgWeight),
    pickupLoadTime: formatStartTimeForDisplay(raw.pickupLoadTime ?? raw.pickup_load_time) || defaults.pickupLoadTime,
    boxDetails: Array.isArray(raw.boxDetails) ? (raw.boxDetails as Trip["boxDetails"]) : defaults.boxDetails,
    deliveries: mapDeliveriesForDisplay(raw.deliveries, defaults.deliveries),
    closingMeter: numOrZero(raw.closingMeter ?? raw.closing_meter ?? defaults.closingMeter),
    endTime: formatStartTimeForDisplay(raw.endTime ?? raw.end_time) || defaults.endTime,
    deliveryTolls: num(raw.deliveryTolls ?? raw.delivery_tolls, defaults.deliveryTolls),
    totalKm: num(raw.totalKm ?? raw.total_km, defaults.totalKm),
    totalShops: num(raw.totalShops ?? raw.total_shops, defaults.totalShops),
    totalWeight: num(raw.totalWeight ?? raw.total_weight, defaults.totalWeight),
    totalDeliveredWeight: num(raw.totalDeliveredWeight ?? raw.total_delivered_weight, defaults.totalDeliveredWeight),
    totalBirdsDelivered: num(raw.totalBirdsDelivered ?? raw.total_birds_delivered, defaults.totalBirdsDelivered),
    totalMortality: num(raw.totalMortality ?? raw.total_mortality, defaults.totalMortality),
    totalMortalityCount: num(raw.totalMortalityCount ?? raw.total_mortality_count, defaults.totalMortalityCount),
    totalMortalityWeight: num(raw.totalMortalityWeight ?? raw.total_mortality_weight, defaults.totalMortalityWeight),
    weightLoss: num(raw.weightLoss ?? raw.weight_loss, defaults.weightLoss),
    survivalRate: num(raw.survivalRate ?? raw.survival_rate, defaults.survivalRate),
    lastShop: str(raw.lastShop ?? raw.last_shop, defaults.lastShop),
    fuel: num(raw.fuel, defaults.fuel),
    expense: num(raw.expense, defaults.expense),
    rateCompleted: Boolean(raw.rateCompleted ?? raw.rate_completed ?? defaults.rateCompleted),
    createdAt: str(raw.createdAt ?? raw.created_at, defaults.createdAt ?? new Date().toISOString()),
    updatedAt: str(raw.updatedAt ?? raw.updated_at, defaults.updatedAt ?? new Date().toISOString()),
    sourceFarmId: numOrZero(raw.sourceFarmId ?? raw.source_farm_id ?? defaults.sourceFarmId),
    sourceFarm: str(raw.sourceFarm ?? raw.source_farm, defaults.sourceFarm),
    reachedTime: formatStartTimeForDisplay(raw.reachedTime ?? raw.reached_time) || defaults.reachedTime,
    destMeter: numOrZero(raw.destMeter ?? raw.dest_meter ?? defaults.destMeter),
    pickupTolls: num(raw.pickupTolls ?? raw.pickup_tolls, defaults.pickupTolls),
    farmAddress: raw.farmAddress != null ? str(raw.farmAddress) : raw.farm_address != null ? str(raw.farm_address) : defaults.farmAddress,
    avgBirdWeight: num(raw.avgBirdWeight ?? raw.avg_bird_weight, defaults.avgBirdWeight ?? 0),
    farmGpsLat: numOrNull(raw.farmGpsLat ?? raw.farm_gps_lat),
    farmGpsLon: numOrNull(raw.farmGpsLon ?? raw.farm_gps_lon),
    farmGpsAccuracy: numOrNull(raw.farmGpsAccuracy ?? raw.farm_gps_accuracy),
    farmGpsTime: raw.farmGpsTime != null ? str(raw.farmGpsTime) : raw.farm_gps_time != null ? str(raw.farm_gps_time) : defaults.farmGpsTime ?? null,
    dcPhotoKey: raw.dcPhotoKey != null ? str(raw.dcPhotoKey) : raw.dc_photo_key != null ? str(raw.dc_photo_key) : defaults.dcPhotoKey,
    dcPhotoMime: raw.dcPhotoMime != null ? str(raw.dcPhotoMime) : defaults.dcPhotoMime,
    dcPhotoData: raw.dcPhotoData != null ? str(raw.dcPhotoData) : defaults.dcPhotoData,
    dcPhotoKey2: raw.dcPhotoKey2 != null ? str(raw.dcPhotoKey2) : defaults.dcPhotoKey2,
    dcPhotoMime2: raw.dcPhotoMime2 != null ? str(raw.dcPhotoMime2) : defaults.dcPhotoMime2,
    dcPhotoData2: raw.dcPhotoData2 != null ? str(raw.dcPhotoData2) : defaults.dcPhotoData2,
    vehicleBoxCapacity: numOrNull(raw.vehicleBoxCapacity) ?? defaults.vehicleBoxCapacity,
    destinationTolls: num(raw.destinationTolls ?? raw.destination_tolls, defaults.destinationTolls),
    meals: num(raw.meals, defaults.meals),
    loading: num(raw.loading, defaults.loading),
    mealsTiffin: num(raw.mealsTiffin ?? raw.meals_tiffin, defaults.mealsTiffin),
    vehicleMaintenance: num(raw.vehicleMaintenance ?? raw.vehicle_maintenance, defaults.vehicleMaintenance),
    othersRC: num(raw.othersRC ?? raw.others_rc, defaults.othersRC),
    others1Amt: num(raw.others1Amt ?? raw.others1_amt, defaults.others1Amt),
    others2Amt: num(raw.others2Amt ?? raw.others2_amt, defaults.others2Amt),
    others3Amt: num(raw.others3Amt ?? raw.others3_amt, defaults.others3Amt),
    others4Amt: num(raw.others4Amt ?? raw.others4_amt, defaults.others4Amt),
    others5Amt: num(raw.others5Amt ?? raw.others5_amt, defaults.others5Amt),
    deleted: Boolean(raw.deleted ?? defaults.deleted),
    deletedReason: raw.deletedReason != null ? str(raw.deletedReason) : defaults.deletedReason,
    approvedBy: raw.approvedBy != null ? str(raw.approvedBy) : defaults.approvedBy,
    ...mapFlattenedDieselTimestamps(raw),
  };
}

/** Step 1 payload sent to PUT /trips/:id and POST /trips/:id/steps/start */
export function toStep1Payload(trip: Partial<Trip>): Record<string, unknown> {
  return {
    tripDate: trip.tripDate,
    status: trip.status ?? "Draft",
    vehicleId: trip.vehicleId || null,
    vehicleNo: trip.vehicleNo || null,
    driverId: trip.driverId || null,
    driverName: trip.driverName || null,
    supervisorId: trip.supervisorId || null,
    supervisorName: trip.supervisorName || null,
    openingMeter: optionalQuantity(trip.openingMeter),
    advanceAmount: optionalQuantity(trip.advanceAmount),
    helpers: trip.helpers ?? [],
    loaders: trip.loaders ?? [],
    remarks: trip.remarks ?? "",
    startStepSubmitted: trip.startStepSubmitted ?? false,
  };
}

function normalizeTolls(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Step 2 payload — Farm Loading only. Never sends Completed Trips / Average Rate / client reachedTime. */
export function toStep2Payload(trip: Partial<Trip>): Record<string, unknown> {
  const destMeter = optionalQuantity(trip.destMeter);
  const avgBirdWeight = optionalQuantity(trip.avgBirdWeight);
  const payload: Record<string, unknown> = {
    sourceFarmId: trip.sourceFarmId || null,
    sourceFarm: trip.sourceFarm || null,
    farmAddress: trip.farmAddress ?? "",
    destMeter: destMeter === 0 ? null : destMeter,
    pickupTolls: normalizeTolls(trip.pickupTolls),
    avgBirdWeight: avgBirdWeight === 0 ? null : avgBirdWeight,
    remarks: trip.remarks ?? "",
    farmStepSubmitted: trip.farmStepSubmitted ?? false,
  };
  const lat = numOrNull(trip.farmGpsLat);
  const lon = numOrNull(trip.farmGpsLon);
  if (
    lat != null &&
    lon != null &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  ) {
    payload.farmGpsLat = lat;
    payload.farmGpsLon = lon;
    const acc = numOrNull(trip.farmGpsAccuracy);
    payload.farmGpsAccuracy = acc != null && acc >= 0 ? acc : null;
    payload.farmGpsTime = trip.farmGpsTime || null;
  }
  return payload;
}

export function toStep3Payload(trip: Partial<Trip> & { removedBoxNos?: number[]; syncPickupPhotos?: boolean }): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (Array.isArray(trip.boxDetails) && trip.boxDetails.length) {
    payload.boxDetails = trip.boxDetails.map((b) => ({
      boxNo: b.boxNo,
      birds: b.birds ?? 0,
      weight: b.weight ?? 0,
    }));
  }
  if (Array.isArray(trip.removedBoxNos) && trip.removedBoxNos.length) {
    payload.removedBoxNos = trip.removedBoxNos;
  }
  if (trip.dcPhotoKey) payload.dcPhotoKey = trip.dcPhotoKey;
  if (trip.dcPhotoMime) payload.dcPhotoMime = trip.dcPhotoMime;
  if (trip.dcPhotoData) payload.dcPhotoData = trip.dcPhotoData;
  if (trip.dcPhotoKey2) payload.dcPhotoKey2 = trip.dcPhotoKey2;
  if (trip.dcPhotoMime2) payload.dcPhotoMime2 = trip.dcPhotoMime2;
  if (trip.dcPhotoData2) payload.dcPhotoData2 = trip.dcPhotoData2;
  if (trip.syncPickupPhotos) payload.syncPickupPhotos = true;
  return payload;
}

export function toStep5Payload(trip: Partial<Trip> & Record<string, unknown>): Record<string, unknown> {
  const n = (v: unknown) => {
    if (v === undefined || v === null || v === "") return 0;
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const EXPENSE_KEYS = [
    "meals",
    "loading",
    "mealsTiffin",
    "vehicleMaintenance",
    "othersRC",
    "others1Amt",
    "others2Amt",
    "others3Amt",
    "others4Amt",
    "others5Amt",
  ] as const;
  const payload: Record<string, unknown> = {
    remarks: trip.remarks ?? "",
  };
  for (const key of EXPENSE_KEYS) {
    const x = n(trip[key]);
    if (x > 0) payload[key] = x;
  }
  const raw = trip as Record<string, unknown>;
  const endRaw = raw.endMeter ?? trip.closingMeter;
  if (endRaw !== "" && endRaw != null && Number.isFinite(Number(endRaw))) {
    payload.endMeter = Number(endRaw);
    payload.closingMeter = Number(endRaw);
  }
  const tollRaw = raw.destinationTolls ?? trip.deliveryTolls;
  if (tollRaw !== "" && tollRaw != null && Number.isFinite(Number(tollRaw))) {
    payload.destinationTolls = Number(tollRaw);
    payload.deliveryTolls = Number(tollRaw);
  }
  return payload;
}

export type DieselSubmitPayload = {
  clientKey: string;
  litres: number;
  rate: number;
  meter: number;
  bunkName: string;
  gpsLat: number;
  gpsLon: number;
  gpsAccuracy: number | null;
  gpsCapturedAt: string | null;
  imageData: string;
  imageName?: string | null;
};

export async function submitTripDiesel(tripId: number, payload: DieselSubmitPayload): Promise<Trip> {
  const { data } = await apiPost<ApiTripRecord>(`${TRIPS_PATH}/${tripId}/diesel`, payload);
  return mapApiTripToTrip(data);
}

export async function updateTripDiesel(
  tripId: number,
  entryId: number,
  payload: DieselSubmitPayload
): Promise<Trip> {
  const { data } = await apiPatch<ApiTripRecord>(`${TRIPS_PATH}/${tripId}/diesel/${entryId}`, payload);
  return mapApiTripToTrip(data);
}

export async function deleteTripDiesel(tripId: number, entryId: number): Promise<Trip> {
  const { data } = await apiDelete<ApiTripRecord>(`${TRIPS_PATH}/${tripId}/diesel/${entryId}`);
  return mapApiTripToTrip(data);
}

function finiteOrOmit(value: unknown): number | undefined {
  const n = numOrNull(value);
  return n == null ? undefined : n;
}

function sanitizePerBoxData(value: unknown): Array<{ boxNo: number; birds?: number; weight?: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const rec = item as Record<string, unknown>;
    const boxNo = numOrNull(rec.boxNo);
    if (boxNo == null || boxNo <= 0) return [];
    const birds = numOrNull(rec.birds);
    const weight = numOrNull(rec.weight);
    return [
      {
        boxNo,
        ...(birds != null ? { birds } : {}),
        ...(weight != null ? { weight } : {}),
      },
    ];
  });
}

export function toStep4Payload(trip: Partial<Trip> & { deliveries?: Trip["deliveries"] }): Record<string, unknown> {
  const rows = Array.isArray(trip.deliveries) ? trip.deliveries : [];
  return {
    deliveries: rows.map((d) => {
      const birds = numOrNull(d.birds) ?? 0;
      const weight = numOrNull(d.weight) ?? 0;
      const mortality = numOrNull(d.mortality) ?? 0;
      const mortKg = numOrNull(d.mortKg) ?? 0;
      const rate = numOrNull(d.rate);
      const computedAmount =
        rate != null ? Number((weight * rate).toFixed(2)) : 0;
      const amount = numOrNull(d.amount) ?? computedAmount;
      const selectedBoxIds = Array.isArray(d.selectedBoxIds)
        ? d.selectedBoxIds.map((id) => numOrNull(id)).filter((id): id is number => id != null && id > 0)
        : [];
      const shopId = numOrNull(d.shopId);
      const birdTypeId = numOrNull(d.birdTypeId);
      return {
        id: d.id && d.id < 1e12 ? d.id : undefined,
        clientKey: d.clientKey || undefined,
        shopId,
        shopName: d.shopName || "",
        birdTypeId,
        birdType: d.birdType || "",
        birds,
        weight,
        mortality,
        mortKg,
        rate,
        amount,
        remarks: d.remarks ?? "",
        deliveryMode: d.deliveryMode === "weight" ? "weight" : "box",
        selectedBoxIds,
        perBoxData: sanitizePerBoxData(d.perBoxData),
        boxNo: numOrNull(d.boxNo) ?? selectedBoxIds.length,
        farmBirds: numOrNull(d.farmBirds),
        farmWeight: numOrNull(d.farmWeight),
        serialNo: finiteOrOmit(d.serialNo),
      };
    }),
  };
}

export async function saveTripDeliveries(tripId: number, trip: Partial<Trip>): Promise<Trip> {
  const { data } = await apiPut<ApiTripRecord>(`${TRIPS_PATH}/${tripId}/deliveries`, toStep4Payload(trip));
  return mapApiTripToTrip(data, trip as Trip);
}

/** GET /api/trips/:id — load full trip (Step 1 resume). */
export async function loadTripById(id: number): Promise<Trip> {
  const { data } = await apiGet<ApiTripRecord>(`${TRIPS_PATH}/${id}`);
  return mapApiTripToTrip(data);
}

/** GET /api/trips — PostgreSQL-backed Trip List / Recent Trips. The backend
 * is the single source of truth — never fall back to stale localStorage
 * data that could override PostgreSQL (Trip List must reflect the same
 * updated trip deliveries/summaries as Shop Sales). */
export async function listTrips(options?: { includeDeleted?: boolean }): Promise<Trip[]> {
  const { data } = await apiGet<ApiTripRecord[]>(TRIPS_PATH, {
    params: options?.includeDeleted ? { includeDeleted: "true" } : undefined,
  });
  return data.map((trip) => mapApiTripToTrip(trip));
}

/** GET /api/operations/trip-list — completed/approved, non-deleted trips only. */
export async function listCompletedTrips(): Promise<Trip[]> {
  const { data } = await apiGet<ApiTripRecord[] | { data: ApiTripRecord[] }>(
    "/operations/trip-list"
  );
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return rows.map((trip) => mapApiTripToTrip(trip));
}

/** Single final Step 1 submission. No draft is created or updated before this request. */
export async function submitStep1(trip: Partial<Trip>): Promise<Trip> {
  const payload = {
    ...toStep1Payload(trip),
    startStepSubmitted: true,
    status: "Draft" as TripStatus,
  };
  const { data } = await apiPost<ApiTripRecord>(`${TRIPS_PATH}/steps/start`, payload);
  return mapApiTripToTrip(data, trip as Trip);
}

export type TripWizardStep = "start" | "farm" | "pickup" | "deliveries" | "expenses";

/**
 * Submit a later wizard step against an existing trip ID.
 * Uses POST /api/trips/:id/steps/:step — one request per submit.
 */
export async function submitTripStep(
  tripId: number,
  step: TripWizardStep,
  trip: Partial<Trip>
): Promise<Trip> {
  let body: Record<string, unknown> = { ...trip, mode: "submit" };
  if (step === "start") {
    delete body.startTime;
    body.startStepSubmitted = true;
    Object.assign(body, toStep1Payload({ ...trip, startStepSubmitted: true }));
    body.mode = "submit";
  }
  if (step === "farm") {
    body = {
      ...toStep2Payload({ ...trip, farmStepSubmitted: true }),
      mode: "submit",
      farmStepSubmitted: true,
    };
  }
  if (step === "pickup") {
    body = {
      ...toStep3Payload(trip),
      mode: "submit",
      pickupStepSubmitted: true,
      pickupBoxWrite: "replace",
    };
  }
  if (step === "deliveries") {
    body = {
      ...toStep4Payload(trip),
      mode: "submit",
    };
  }
  if (step === "expenses") {
    body = {
      ...toStep5Payload(trip as Partial<Trip> & Record<string, unknown>),
      mode: "submit",
    };
  }
  const { data } = await apiPost<ApiTripRecord>(
    `${TRIPS_PATH}/${tripId}/steps/${step}`,
    body
  );
  return mapApiTripToTrip(data, trip as Trip);
}

/** Explicitly persist a valid step without submitting/locking it. */
export async function saveTripStepProgress(
  tripId: number,
  step: TripWizardStep,
  trip: Partial<Trip>
): Promise<Trip> {
  const body: Record<string, unknown> =
    step === "farm"
      ? { ...toStep2Payload({ ...trip, farmStepSubmitted: false }), mode: "save" }
      : step === "pickup"
        ? { ...toStep3Payload(trip), mode: "save", pickupBoxWrite: "upsert" }
        : step === "deliveries"
          ? { ...toStep4Payload(trip), mode: "save" }
          : step === "expenses"
            ? { ...toStep5Payload(trip as Partial<Trip> & Record<string, unknown>), mode: "save" }
          : { ...trip, mode: "save" };
  const { data } = await apiPost<ApiTripRecord>(
    `${TRIPS_PATH}/${tripId}/steps/${step}`,
    body
  );
  return mapApiTripToTrip(data, trip as Trip);
}

export type AvailableTripResources = {
  vehicles: Array<{ id: number; vehicleNumber: string }>;
  drivers: Array<{ id: number; employeeName: string; department: string }>;
  supervisors: Array<{ id: number; employeeName: string; department: string }>;
  helpers: Array<{ id: number; employeeName: string; department: string }>;
  loaders: Array<{ id: number; employeeName: string; department: string }>;
};

export async function fetchAvailableResources(tripId?: number | null): Promise<AvailableTripResources> {
  const suffix = tripId && tripId > 0 ? `?tripId=${tripId}` : "";
  const { data } = await apiGet<AvailableTripResources>(`${TRIPS_PATH}/available-resources${suffix}`);
  return data;
}

/** GET /api/trips/vehicle/:vehicleId/last-meter — opening KM validation. */
export async function fetchLastClosingMeter(vehicleId: number): Promise<LastClosingMeter | null> {
  const { data } = await apiGet<LastClosingMeter | null>(
    `${TRIPS_PATH}/vehicle/${vehicleId}/last-meter`
  );
  if (!data || data.closingMeter == null) return null;
  return data;
}

/** PATCH /api/trips/:id/status — backend-authoritative status transition
 * (Pending -> Completed / Draft -> Pending). The backend enforces the state
 * machine and persists the change to PostgreSQL, so the Trip List / Recent
 * lifecycle survives refresh and is never stored in localStorage. */
export async function changeTripStatus(
  id: number,
  status: TripStatus,
  approvedBy?: string
): Promise<Trip> {
  const { data } = await apiPatch<ApiTripRecord>(`${TRIPS_PATH}/${id}/status`, {
    status,
    approvedBy,
  });
  return mapApiTripToTrip(data);
}

/** DELETE /api/trips/:id — backend soft-delete. Reason is sent as a query
 * param (the backend route reads req.body.reason ?? req.query.reason). */
export async function deleteTripFromApi(id: number, reason?: string): Promise<{ id: number; deleted: boolean }> {
  const { data } = await apiDelete<{ id: number; deleted: boolean }>(`${TRIPS_PATH}/${id}`, {
    params: reason ? { reason } : undefined,
  });
  return data;
}

export { handleApiError };
