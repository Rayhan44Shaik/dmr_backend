import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  BoxDetail,
  DieselEntry,
  ShopDelivery,
  Trip,
  TripStatus,
  TripStepStatuses,
  TripSummary,
} from "../types/models.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
import {
  formatTripNo,
  resolveTripDateForNumbering,
} from "../utils/tripNumbering.js";
import {
  assertVehicleActive,
  resolveEmployeeNames,
  validateTripForeignKeys,
} from "../utils/fkValidation.js";
import { computeTripExpense } from "../utils/operationsHelpers.js";
import {
  paginatedResult,
  type PaginationParams,
  type PaginatedResult,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  computeDeliveryAmount,
  computeFarmAmount,
  computeTotalKm,
  computeTripKpis,
  sumDieselFuel,
} from "../utils/tripCalculations.js";
import { loadDcPhoto, syncDieselToFuelExpenses, syncTripFuelFromDb } from "../utils/tripFuelSync.js";
import { assertWithinCapacity, generateSaleNo, recalcTripDeliveryTotals, sumActiveDeliveries } from "../utils/tripDeliverySync.js";
import {
  getLatestVehicleMeter,
  lockVehicleForMeterWrite,
  preciseIsoOrUndefined,
  validateVehicleMeter,
} from "../utils/vehicleMeterLedger.js";
import {
  assertStepOrder,
  getResumeLabel,
  getResumeStep,
  getWizardProgress,
  type TripWizardStep,
} from "../utils/tripResume.js";
import {
  addTripLeg,
  ensureTripLeg1,
  farmMeterFloor,
  listTripLegs,
  maxDieselMeter,
  MAX_TRIP_LEGS,
  requireTripLeg,
  resolveLegIndex,
  syncTripStepFlagsFromLegs,
  upsertLegFields,
  type TripLegRow,
} from "../utils/tripLegs.js";
import { assertTripResourcesAvailable } from "../validation/tripResourceValidation.js";
import { assertTripCompletionGates, assertTripMetersEditable, getTripMeterLock, revalidateTripMetersForCompletion } from "../utils/tripMeterLock.js";
import { assertTripStatus } from "../validation/operations.js";
import {
  assertTripReadyForCompletion,
  assertTripStatusTransition,
  parseDeliverySave,
  parseTripAutosave,
  validateStepSubmit,
} from "../validation/trips.js";

type Client = pg.PoolClient;

type ResolvedDieselBunk = {
  bunkName: string;
  bunkSource: "MASTER" | "OTHER";
  fuelBunkId: number | null;
  gpsLat: number;
  gpsLon: number;
  gpsAccuracy: number | null;
  gpsCapturedAt: string | null;
};

async function resolveDieselBunk(
  client: Client,
  body: Record<string, unknown>
): Promise<ResolvedDieselBunk> {
  const requestedSource = str(body.bunkSource).toUpperCase();
  const fuelBunkId = numOrNull(body.fuelBunkId);

  if (requestedSource === "MASTER" || fuelBunkId != null) {
    if (!(fuelBunkId != null && fuelBunkId > 0)) {
      throw new AppError(422, "A valid Fuel Bunk master selection is required");
    }
    const master = await client.query(
      `SELECT id, bird_type, latitude, longitude
         FROM bird_types
        WHERE id = $1 AND category = 'Fuel Bunk' AND status = 'Active'`,
      [fuelBunkId]
    );
    if (!master.rowCount) {
      throw new AppError(422, "Selected Fuel Bunk is not active or does not exist");
    }
    const row = master.rows[0];
    const gpsLat = numOrNull(row.latitude);
    const gpsLon = numOrNull(row.longitude);
    if (gpsLat == null || gpsLon == null || (gpsLat === 0 && gpsLon === 0)) {
      throw new AppError(422, "Selected Fuel Bunk has no valid GPS in Others master");
    }
    return {
      bunkName: str(row.bird_type).trim(),
      bunkSource: "MASTER",
      fuelBunkId,
      gpsLat,
      gpsLon,
      gpsAccuracy: 0,
      gpsCapturedAt: new Date().toISOString(),
    };
  }

  const bunkName = body.bunkName != null ? str(body.bunkName).trim() : "";
  if (!bunkName) throw new AppError(422, "Other diesel bunk / location details are required");
  const gpsLat = numOrNull(body.gpsLat);
  const gpsLon = numOrNull(body.gpsLon);
  if (gpsLat == null || gpsLon == null || (gpsLat === 0 && gpsLon === 0)) {
    throw new AppError(422, "Other diesel bunk GPS is required");
  }
  return {
    bunkName,
    bunkSource: "OTHER",
    fuelBunkId: null,
    gpsLat,
    gpsLon,
    gpsAccuracy: numOrNull(body.gpsAccuracy),
    gpsCapturedAt: body.gpsCapturedAt != null ? str(body.gpsCapturedAt) : null,
  };
}

function mapTripBase(row: Record<string, unknown>): Omit<
  Trip,
  "helpers" | "loaders" | "boxDetails" | "deliveries" | "dieselEntries"
> {
  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    status: str(row.status) as TripStatus,
    legCount: Math.max(1, Math.min(MAX_TRIP_LEGS, num(row.leg_count) || 1)),

    startTime: isoOrNull(row.start_time),
    vehicleId: numOrNull(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    vehicleBoxCapacity:
      numOrNull(row.vehicle_box_capacity) ?? numOrNull(row.no_of_boxes) ?? null,
    driverId: numOrNull(row.driver_id),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorId: numOrNull(row.supervisor_id),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    openingMeter: numOrNull(row.opening_meter),
    advanceAmount: numOrNull(row.advance_amount),
    startStepSubmitted: Boolean(row.start_step_submitted),
    startStepSubmittedAt: isoOrNull(row.start_step_submitted_at),

    sourceFarmId: numOrNull(row.source_farm_id),
    sourceFarm: row.source_farm == null ? null : str(row.source_farm),
    reachedTime: isoOrNull(row.reached_time),
    destMeter: numOrNull(row.dest_meter),
    pickupTolls: num(row.pickup_tolls),
    farmAddress: row.farm_address == null ? null : str(row.farm_address),
    avgBirdWeight: numOrNull(row.avg_bird_weight),
    farmRemarks: row.farm_remarks == null ? null : str(row.farm_remarks),
    farmBirdTypeId: numOrNull(row.farm_bird_type_id),
    farmBirdType: row.farm_bird_type == null ? null : str(row.farm_bird_type),
    farmBirdCount: numOrNull(row.farm_bird_count),
    farmLoadWeight: numOrNull(row.farm_load_weight),
    farmRate: numOrNull(row.farm_rate),
    farmAmount: numOrNull(row.farm_amount),
    farmPaidAmount: num(row.farm_paid_amount),
    farmPaymentDate: dateOnly(row.farm_payment_date),
    farmPaymentMode: row.farm_payment_mode == null ? null : str(row.farm_payment_mode),
    farmPaymentReference:
      row.farm_payment_reference == null ? null : str(row.farm_payment_reference),
    farmCompletedTrips: numOrNull(row.farm_completed_trips),
    farmGpsLat: numOrNull(row.farm_gps_lat),
    farmGpsLon: numOrNull(row.farm_gps_lon),
    farmGpsAccuracy: numOrNull(row.farm_gps_accuracy),
    farmGpsTime: isoOrNull(row.farm_gps_time),
    farmStepSubmitted: Boolean(row.farm_step_submitted),
    farmStepSubmittedAt: isoOrNull(row.farm_step_submitted_at),

    dcWeight: num(row.dc_weight),
    totalBirds: num(row.total_birds),
    boxes: num(row.boxes),
    avgWeight: num(row.avg_weight),
    pickupLoadTime: isoOrNull(row.pickup_load_time),
    dcPhotoKey: row.dc_photo_key == null ? null : str(row.dc_photo_key),
    pickupStepSubmitted: Boolean(row.pickup_step_submitted),
    pickupStepSubmittedAt: isoOrNull(row.pickup_step_submitted_at),

    deliveryStepSubmitted: Boolean(row.delivery_step_submitted),
    deliveriesStepSubmittedAt: isoOrNull(row.deliveries_step_submitted_at),

    closingMeter: numOrNull(row.closing_meter),
    endMeter: numOrNull(row.end_meter),
    endTime: isoOrNull(row.end_time),
    deliveryTolls: num(row.delivery_tolls),
    destinationTolls: num(row.destination_tolls),
    meals: num(row.meals),
    loading: num(row.loading),
    mealsTiffin: num(row.meals_tiffin),
    vehicleMaintenance: num(row.vehicle_maintenance),
    othersRC: num(row.others_rc),
    others1Amt: num(row.others1_amt),
    others2Amt: num(row.others2_amt),
    others3Amt: num(row.others3_amt),
    others4Amt: num(row.others4_amt),
    others5Amt: num(row.others5_amt),
    fuel: num(row.fuel),
    expense: num(row.expense),
    driverBata: num(row.driver_bata),
    helperBata: num(row.helper_bata),
    totalTripExpense: num(row.total_trip_expense),
    remarks: str(row.remarks),
    submittedAt: isoOrNull(row.submitted_at),
    endStepSubmitted: Boolean(row.end_step_submitted),
    expensesStepSubmitted: Boolean(row.expenses_step_submitted),
    expensesStepSubmittedAt: isoOrNull(row.expenses_step_submitted_at),

    totalKm: num(row.total_km),
    totalShops: num(row.total_shops),
    totalWeight: num(row.total_weight),
    totalDeliveredWeight: num(row.total_delivered_weight),
    totalBirdsDelivered: num(row.total_birds_delivered),
    totalMortality: num(row.total_mortality),
    totalMortalityCount: num(row.total_mortality_count),
    totalMortalityWeight: num(row.total_mortality_weight),
    weightLoss: num(row.weight_loss),
    survivalRate: num(row.survival_rate),
    lastShop: row.last_shop == null ? null : str(row.last_shop),
    rateCompleted: Boolean(row.rate_completed),

    deleted: Boolean(row.deleted),
    deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt: isoOrNull(row.approved_at),
    rejectedBy: row.rejected_by == null ? null : str(row.rejected_by),
    rejectedAt: isoOrNull(row.rejected_at),
    rejectedReason: row.rejected_reason == null ? null : str(row.rejected_reason),
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
  };
}

interface ChildCounts {
  boxCount: number;
  deliveryCount: number;
  dieselCount: number;
}

function childCounts(row: Record<string, unknown>): ChildCounts {
  return {
    boxCount: num(row.box_count),
    deliveryCount: num(row.delivery_count),
    dieselCount: num(row.diesel_count),
  };
}

function hasNumber(value: unknown): boolean {
  return value != null && Number(value) > 0;
}

function normalizeTripTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = String(value).trim();

  // Already ISO-compatible.
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // Frontend display stamp: "18-09-2026 19:12:05 IST" (dd-MM-yyyy HH:mm:ss IST).
  const istMatch = raw.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*IST$/i
  );
  if (istMatch) {
    const [, day, month, year, hour, minute, second = "0"] = istMatch;
    const normalized =
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` +
      `T${String(hour).padStart(2, "0")}:${minute}:${String(second).padStart(2, "0")}+05:30`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // Handles localized values such as:
  // "8/13/2026, 8:39:06 PM"
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
  );

  if (match) {
    const [, month, day, year, hour, minute, second = "0", meridiem] = match;

    let h = Number(hour);

    if (meridiem.toUpperCase() === "PM" && h !== 12) {
      h += 12;
    }

    if (meridiem.toUpperCase() === "AM" && h === 12) {
      h = 0;
    }

    const normalized =
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` +
      `T${String(h).padStart(2, "0")}:${minute}:${second.padStart(2, "0")}`;

    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Derived per-step wizard state used by the UI:
 *  - "completed"    â†’ step was successfully submitted (server flag)
 *  - "saved"        â†’ partial data persisted but step not submitted
 *  - "not_started"  â†’ no meaningful data for the step
 */
function computeStepStatuses(
  src: Pick<
    Trip,
    | "startStepSubmitted"
    | "farmStepSubmitted"
    | "pickupStepSubmitted"
    | "deliveryStepSubmitted"
    | "expensesStepSubmitted"
    | "endStepSubmitted"
    | "vehicleId"
    | "driverId"
    | "openingMeter"
    | "advanceAmount"
    | "startTime"
    | "sourceFarmId"
    | "destMeter"
    | "reachedTime"
    | "pickupTolls"
    | "farmBirdTypeId"
    | "farmBirdCount"
    | "farmLoadWeight"
    | "farmRate"
    | "farmAddress"
    | "avgBirdWeight"
    | "dcWeight"
    | "totalBirds"
    | "boxes"
    | "dcPhotoKey"
    | "totalShops"
    | "totalWeight"
    | "totalBirdsDelivered"
    | "closingMeter"
    | "endMeter"
    | "endTime"
    | "deliveryTolls"
    | "destinationTolls"
    | "meals"
    | "mealsTiffin"
    | "loading"
    | "vehicleMaintenance"
    | "othersRC"
    | "others1Amt"
    | "others2Amt"
    | "others3Amt"
    | "others4Amt"
    | "others5Amt"
    | "driverBata"
    | "helperBata"
    | "remarks"
  >,
  counts: ChildCounts
): TripStepStatuses {
  const startSaved =
    Boolean(src.vehicleId) ||
    Boolean(src.driverId) ||
    hasNumber(src.openingMeter) ||
    hasNumber(src.advanceAmount) ||
    Boolean(src.startTime);

  const farmSaved =
    Boolean(src.sourceFarmId) ||
    hasNumber(src.destMeter) ||
    Boolean(src.reachedTime) ||
    hasNumber(src.pickupTolls) ||
    Boolean(src.farmBirdTypeId) ||
    hasNumber(src.farmBirdCount) ||
    hasNumber(src.farmLoadWeight) ||
    hasNumber(src.farmRate) ||
    Boolean(src.farmAddress) ||
    hasNumber(src.avgBirdWeight);

  const pickupSaved =
    hasNumber(src.dcWeight) ||
    hasNumber(src.totalBirds) ||
    hasNumber(src.boxes) ||
    Boolean(src.dcPhotoKey) ||
    counts.boxCount > 0;

  const deliverySaved =
    counts.deliveryCount > 0 ||
    hasNumber(src.totalShops) ||
    hasNumber(src.totalWeight) ||
    hasNumber(src.totalBirdsDelivered);

  const expenseSaved =
    hasNumber(src.closingMeter) ||
    hasNumber(src.endMeter) ||
    Boolean(src.endTime) ||
    hasNumber(src.deliveryTolls) ||
    hasNumber(src.destinationTolls) ||
    hasNumber(src.meals) ||
    hasNumber(src.mealsTiffin) ||
    hasNumber(src.loading) ||
    hasNumber(src.vehicleMaintenance) ||
    hasNumber(src.othersRC) ||
    hasNumber(src.others1Amt) ||
    hasNumber(src.others2Amt) ||
    hasNumber(src.others3Amt) ||
    hasNumber(src.others4Amt) ||
    hasNumber(src.others5Amt) ||
    hasNumber(src.driverBata) ||
    hasNumber(src.helperBata) ||
    counts.dieselCount > 0 ||
    Boolean(src.remarks);

  return {
    start: src.startStepSubmitted ? "completed" : startSaved ? "saved" : "not_started",
    farm: src.farmStepSubmitted ? "completed" : farmSaved ? "saved" : "not_started",
    pickup: src.pickupStepSubmitted ? "completed" : pickupSaved ? "saved" : "not_started",
    deliveries: src.deliveryStepSubmitted ? "completed" : deliverySaved ? "saved" : "not_started",
    expenses:
      src.expensesStepSubmitted || src.endStepSubmitted
        ? "completed"
        : expenseSaved
          ? "saved"
          : "not_started",
  };
}

function toTripSummary(row: Record<string, unknown>): TripSummary {
  const base = mapTripBase(row);
  const rawLoadSummaries = Array.isArray(row.load_summaries) ? row.load_summaries : [];
  const loadSummaries = rawLoadSummaries.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      load: num(value.load),
      birds: num(value.birds),
      weight: num(value.weight),
      mortality: num(value.mortality),
      mortalityWeight: num(value.mortalityWeight ?? value.mortality_weight),
      weightLoss: num(value.weightLoss ?? value.weight_loss),
      shops: num(value.shops),
    };
  });
  const completedTotals = loadSummaries.reduce(
    (sum, load) => ({
      birds: sum.birds + load.birds,
      weight: sum.weight + load.weight,
      mortality: sum.mortality + load.mortality,
      mortalityWeight: sum.mortalityWeight + load.mortalityWeight,
      weightLoss: sum.weightLoss + load.weightLoss,
      shops: sum.shops + load.shops,
    }),
    { birds: 0, weight: 0, mortality: 0, mortalityWeight: 0, weightLoss: 0, shops: 0 }
  );
  // Older completed trips and endpoints that do not attach the per-load
  // aggregate must retain their persisted trip totals. Never replace valid
  // list data with a synthetic all-zero reduction of an empty array.
  const totals = loadSummaries.length > 0
    ? completedTotals
    : {
        birds: base.totalBirdsDelivered || base.totalBirds,
        weight: base.totalDeliveredWeight || base.totalWeight,
        mortality: base.totalMortalityCount || base.totalMortality,
        mortalityWeight: base.totalMortalityWeight,
        weightLoss: base.weightLoss,
        shops: base.totalShops,
      };
  const flags = {
    startStepSubmitted: base.startStepSubmitted,
    farmStepSubmitted: base.farmStepSubmitted,
    pickupStepSubmitted: base.pickupStepSubmitted,
    deliveryStepSubmitted: base.deliveryStepSubmitted,
    expensesStepSubmitted: base.expensesStepSubmitted,
    endStepSubmitted: base.endStepSubmitted,
    status: base.status,
    deleted: base.deleted,
  };

  return {
    ...base,
    submittedLoadCount: Math.max(1, num(row.submitted_load_count) || 1),
    loadSummaries,
    totalBirds: totals.birds,
    totalBirdsDelivered: totals.birds,
    totalWeight: totals.weight,
    totalDeliveredWeight: totals.weight,
    totalMortality: totals.mortality,
    totalMortalityCount: totals.mortality,
    totalMortalityWeight: totals.mortalityWeight,
    weightLoss: totals.weightLoss,
    totalShops: totals.shops,
    helpers: [],
    loaders: [],
    boxDetails: [],
    deliveries: [],
    dieselEntries: [],
    resumeStep: getResumeStep(flags),
    resumeStepLabel: getResumeLabel(flags),
    wizardProgress: getWizardProgress(flags),
    stepStatuses: computeStepStatuses(base as unknown as Trip, childCounts(row)),
  };
}

async function loadTripExtras(client: Client, tripId: number, legId?: number | null) {
  const crew = await client.query(`SELECT * FROM trip_crew WHERE trip_id = $1`, [tripId]);
  const boxSql =
    legId != null && legId > 0
      ? `SELECT * FROM trip_boxes WHERE trip_id = $1 AND leg_id = $2 ORDER BY box_no`
      : `SELECT * FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`;
  const boxes = await client.query(
    boxSql,
    legId != null && legId > 0 ? [tripId, legId] : [tripId]
  );
  const delSql =
    legId != null && legId > 0
      ? `SELECT * FROM trip_deliveries WHERE trip_id = $1 AND leg_id = $2 ORDER BY serial_no NULLS LAST, id`
      : `SELECT * FROM trip_deliveries WHERE trip_id = $1 ORDER BY serial_no NULLS LAST, id`;
  const deliveries = await client.query(
    delSql,
    legId != null && legId > 0 ? [tripId, legId] : [tripId]
  );
  const diesel = await client.query(
    `SELECT * FROM trip_diesel_entries WHERE trip_id = $1 ORDER BY row_index`,
    [tripId]
  );
  const deliveryBoxes = await client.query(
    legId != null && legId > 0
      ? `SELECT db.* FROM trip_delivery_boxes db
         JOIN trip_deliveries d ON d.id = db.delivery_id
         WHERE d.trip_id = $1 AND d.leg_id = $2`
      : `SELECT db.* FROM trip_delivery_boxes db
         JOIN trip_deliveries d ON d.id = db.delivery_id
         WHERE d.trip_id = $1`,
    legId != null && legId > 0 ? [tripId, legId] : [tripId]
  );
  const perBox = await client.query(
    legId != null && legId > 0
      ? `SELECT pb.* FROM trip_delivery_per_box pb
         JOIN trip_deliveries d ON d.id = pb.delivery_id
         WHERE d.trip_id = $1 AND d.leg_id = $2`
      : `SELECT pb.* FROM trip_delivery_per_box pb
         JOIN trip_deliveries d ON d.id = pb.delivery_id
         WHERE d.trip_id = $1`,
    legId != null && legId > 0 ? [tripId, legId] : [tripId]
  );

  const helpers = crew.rows
    .filter((r) => r.role === "helper")
    .map((r) => str(r.employee_name));
  const loaders = crew.rows
    .filter((r) => r.role === "loader")
    .map((r) => str(r.employee_name));

  const boxDetails: BoxDetail[] = boxes.rows.map((r) => {
    const birds = num(r.birds);
    const weight = num(r.weight);
    // Old rows have no avg_weight — derive it safely (never divide by zero).
    const avgWeight =
      numOrNull(r.avg_weight) ??
      (birds > 0 ? Number((weight / birds).toFixed(3)) : null);
    return {
      boxNo: num(r.box_no),
      birds,
      weight,
      avgWeight,
    };
  });

  const boxesByDelivery = new Map<number, number[]>();
  for (const row of deliveryBoxes.rows) {
    const id = num(row.delivery_id);
    const list = boxesByDelivery.get(id) ?? [];
    list.push(num(row.box_no));
    boxesByDelivery.set(id, list);
  }

  const perBoxByDelivery = new Map<number, BoxDetail[]>();
  for (const row of perBox.rows) {
    const id = num(row.delivery_id);
    const list = perBoxByDelivery.get(id) ?? [];
    list.push({
      boxNo: num(row.box_no),
      birds: num(row.birds),
      weight: num(row.weight),
    });
    perBoxByDelivery.set(id, list);
  }

  const mappedDeliveries: ShopDelivery[] = deliveries.rows.map((r) => {
    const id = num(r.id);
    return {
      id,
      serialNo: numOrNull(r.serial_no),
      boxNo: numOrNull(r.box_no),
      legId: numOrNull(r.leg_id),
      shopId: numOrNull(r.shop_id),
      shopName: str(r.shop_name),
      subShopName: str(r.sub_shop_name),
      birdTypeId: numOrNull(r.bird_type_id),
      birdType: str(r.bird_type),
      birds: num(r.birds),
      weight: num(r.weight),
      mortality: num(r.mortality),
      mortKg: numOrNull(r.mort_kg),
      rate: numOrNull(r.rate),
      amount: num(r.amount),
      remarks: str(r.remarks),
      deliveryMode: (str(r.delivery_mode) as "box" | "weight") || "box",
      selectedBoxIds: boxesByDelivery.get(id) ?? [],
      farmBirds: numOrNull(r.farm_birds),
      farmWeight: numOrNull(r.farm_weight),
      perBoxData: perBoxByDelivery.get(id) ?? [],
      autoCaptureTime: isoOrNull(r.auto_capture_time),
      clientKey: r.client_key == null ? null : str(r.client_key),
    };
  });

  const dieselEntries: DieselEntry[] = diesel.rows.map((r) => ({
    id: num(r.id),
    rowIndex: num(r.row_index),
    litres: numOrNull(r.litres),
    rate: numOrNull(r.rate),
    meter: numOrNull(r.meter),
    bunkName: r.bunk_name == null ? null : str(r.bunk_name),
    bunkSource: str(r.bunk_source) === "MASTER" ? "MASTER" : "OTHER",
    fuelBunkId: numOrNull(r.fuel_bunk_id),
    bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
    imageData: r.image_data == null ? null : str(r.image_data),
    imageName: r.image_name == null ? null : str(r.image_name),
    clientKey: r.client_key == null ? null : str(r.client_key),
    gpsLat: numOrNull(r.gps_lat),
    gpsLon: numOrNull(r.gps_lon),
    gpsAccuracy: numOrNull(r.gps_accuracy),
    gpsCapturedAt: isoOrNull(r.gps_captured_at),
    submitted: true,
    submittedAt: isoOrNull(r.submitted_at),
  }));

  return { helpers, loaders, boxDetails, deliveries: mappedDeliveries, dieselEntries };
}

async function hydrateLegs(
  client: Client,
  tripId: number
): Promise<Array<TripLegRow & { boxDetails: BoxDetail[]; deliveries: ShopDelivery[] }>> {
  const legs = await listTripLegs(client, tripId);
  const out: Array<TripLegRow & { boxDetails: BoxDetail[]; deliveries: ShopDelivery[] }> = [];
  for (const leg of legs) {
    const extras = await loadTripExtras(client, tripId, leg.id);
    out.push({
      ...leg,
      boxDetails: extras.boxDetails,
      deliveries: extras.deliveries,
    });
  }
  return out;
}

function isMissingRelationError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Detect multi-load schema without aborting an open transaction. */
async function tripLegsSchemaReady(client: Client): Promise<boolean> {
  try {
    const r = await client.query<{ t: string | null }>(
      `SELECT to_regclass('public.trip_legs')::text AS t`
    );
    return Boolean(r.rows[0]?.t);
  } catch {
    return false;
  }
}

/** Build a display-only Load 1 from the trips row when trip_legs is empty/unavailable. */
function syntheticLeg1FromTripRow(
  base: ReturnType<typeof mapTripBase>,
  extras: Awaited<ReturnType<typeof loadTripExtras>>
): TripLegRow & { boxDetails: BoxDetail[]; deliveries: ShopDelivery[] } {
  return {
    id: 0,
    tripId: base.id,
    legIndex: 1,
    sourceFarmId: base.sourceFarmId,
    sourceFarm: base.sourceFarm,
    reachedTime: base.reachedTime,
    destMeter: base.destMeter,
    pickupTolls: base.pickupTolls,
    farmAddress: base.farmAddress ?? null,
    avgBirdWeight: base.avgBirdWeight ?? null,
    farmRemarks: base.farmRemarks ?? null,
    farmBirdTypeId: base.farmBirdTypeId ?? null,
    farmBirdType: base.farmBirdType ?? null,
    farmBirdCount: base.farmBirdCount ?? null,
    farmLoadWeight: base.farmLoadWeight ?? null,
    farmRate: base.farmRate ?? null,
    farmAmount: base.farmAmount ?? null,
    farmGpsLat: base.farmGpsLat ?? null,
    farmGpsLon: base.farmGpsLon ?? null,
    farmGpsAccuracy: base.farmGpsAccuracy ?? null,
    farmGpsTime: base.farmGpsTime ?? null,
    farmStepSubmitted: base.farmStepSubmitted,
    farmStepSubmittedAt: base.farmStepSubmittedAt,
    dcWeight: base.dcWeight,
    totalBirds: base.totalBirds,
    boxes: base.boxes,
    avgWeight: base.avgWeight,
    pickupLoadTime: base.pickupLoadTime,
    dcPhotoKey: base.dcPhotoKey ?? null,
    pickupStepSubmitted: base.pickupStepSubmitted,
    pickupStepSubmittedAt: base.pickupStepSubmittedAt,
    deliveryStepSubmitted: base.deliveryStepSubmitted,
    deliveriesStepSubmittedAt: base.deliveriesStepSubmittedAt,
    boxDetails: extras.boxDetails,
    deliveries: extras.deliveries,
  };
}

async function hydrateTrip(
  client: Client,
  row: Record<string, unknown>,
  options: { includeDcPhoto?: boolean; viewLegIndex?: number } = {}
): Promise<
  Trip & {
    dcPhotoData?: string | null;
    dcPhotoMime?: string | null;
    dcPhotoKey2?: string | null;
    dcPhotoMime2?: string | null;
    dcPhotoData2?: string | null;
  }
> {
  const base = mapTripBase(row);
  // GET must never INSERT. Create leg 1 only on write paths (save/submit/addLeg).
  let legs: Array<TripLegRow & { boxDetails: BoxDetail[]; deliveries: ShopDelivery[] }> = [];
  const legsReady = await tripLegsSchemaReady(client);
  if (legsReady) {
    try {
      await client.query("SAVEPOINT trip_legs_hydrate");
      legs = await hydrateLegs(client, base.id);
      await client.query("RELEASE SAVEPOINT trip_legs_hydrate");
    } catch (err) {
      try {
        await client.query("ROLLBACK TO SAVEPOINT trip_legs_hydrate");
      } catch {
        /* ignore — may already be rolled back */
      }
      if (!isMissingRelationError(err)) throw err;
      legs = [];
    }
  }

  // Prefer an explicit viewLegIndex; otherwise open the first incomplete load
  // so resume never jumps to Step 5 while a later load is still empty.
  const firstIncomplete =
    legs.find((l) => !l.deliveryStepSubmitted) ?? legs[legs.length - 1] ?? null;
  const viewIndex = options.viewLegIndex ?? firstIncomplete?.legIndex ?? 1;
  let viewLeg = legs.find((l) => l.legIndex === viewIndex) ?? legs[0] ?? null;
  let extras =
    viewLeg && viewLeg.id > 0
      ? await loadTripExtras(client, base.id, viewLeg.id)
      : await loadTripExtras(client, base.id);

  if (!legs.length) {
    viewLeg = syntheticLeg1FromTripRow(base, extras);
    legs = [viewLeg];
  }

  // Resolve box capacity from Vehicle Master when not already joined onto the row.
  let vehicleBoxCapacity = base.vehicleBoxCapacity ?? null;
  if ((vehicleBoxCapacity == null || vehicleBoxCapacity <= 0) && base.vehicleId) {
    const veh = await client.query(`SELECT no_of_boxes FROM vehicles WHERE id = $1`, [
      base.vehicleId,
    ]);
    if (veh.rowCount) {
      vehicleBoxCapacity = numOrNull(veh.rows[0].no_of_boxes);
    }
  }

  let dcPhoto: {
    dcPhotoKey: string | null;
    dcPhotoMime: string | null;
    dcPhotoData: string | null;
    dcPhotoKey2: string | null;
    dcPhotoMime2: string | null;
    dcPhotoData2: string | null;
  } = {
    dcPhotoKey: (viewLeg?.dcPhotoKey ?? base.dcPhotoKey) ?? null,
    dcPhotoMime: null,
    dcPhotoData: null,
    dcPhotoKey2: null,
    dcPhotoMime2: null,
    dcPhotoData2: null,
  };
  if (options.includeDcPhoto) {
    dcPhoto = await loadDcPhoto(
      client,
      base.id,
      viewLeg?.dcPhotoKey ?? base.dcPhotoKey ?? null,
      viewLeg?.id && viewLeg.id > 0 ? viewLeg.id : null
    );
  }

  const overlaid = viewLeg
    ? {
        ...base,
        legCount: Math.max(legs.length, base.legCount || 1),
        sourceFarmId: viewLeg.sourceFarmId,
        sourceFarm: viewLeg.sourceFarm,
        reachedTime: viewLeg.reachedTime,
        destMeter: viewLeg.destMeter,
        pickupTolls: viewLeg.pickupTolls,
        farmAddress: viewLeg.farmAddress,
        avgBirdWeight: viewLeg.avgBirdWeight,
        farmRemarks: viewLeg.farmRemarks,
        farmBirdTypeId: viewLeg.farmBirdTypeId,
        farmBirdType: viewLeg.farmBirdType,
        farmBirdCount: viewLeg.farmBirdCount,
        farmLoadWeight: viewLeg.farmLoadWeight,
        farmRate: viewLeg.farmRate,
        farmAmount: viewLeg.farmAmount,
        farmGpsLat: viewLeg.farmGpsLat,
        farmGpsLon: viewLeg.farmGpsLon,
        farmGpsAccuracy: viewLeg.farmGpsAccuracy,
        farmGpsTime: viewLeg.farmGpsTime,
        farmStepSubmitted: viewLeg.farmStepSubmitted,
        farmStepSubmittedAt: viewLeg.farmStepSubmittedAt,
        dcWeight: viewLeg.dcWeight,
        totalBirds: viewLeg.totalBirds,
        boxes: viewLeg.boxes,
        avgWeight: viewLeg.avgWeight,
        pickupLoadTime: viewLeg.pickupLoadTime,
        dcPhotoKey: viewLeg.dcPhotoKey,
        pickupStepSubmitted: viewLeg.pickupStepSubmitted,
        pickupStepSubmittedAt: viewLeg.pickupStepSubmittedAt,
        deliveryStepSubmitted: viewLeg.deliveryStepSubmitted,
        deliveriesStepSubmittedAt: viewLeg.deliveriesStepSubmittedAt,
      }
    : { ...base, legCount: legs.length || base.legCount || 1 };

  return {
    ...overlaid,
    vehicleBoxCapacity,
    helpers: extras.helpers,
    loaders: extras.loaders,
    boxDetails: extras.boxDetails,
    deliveries: extras.deliveries,
    dieselEntries: extras.dieselEntries,
    legs,
    activeLegIndex: viewLeg?.legIndex ?? viewIndex,
    ...dcPhoto,
  };
}

/**
 * Allocate the next trip number for a business date.
 * Counts EVERY row for that trip_date — Draft, Pending, Completed, and soft-deleted.
 * Deleted numbers stay consumed so Recent / History / Fuel stay gap-stable.
 */
async function nextSequenceForTripDate(client: Client, tripDate: string): Promise<number> {
  const result = await client.query<{ m: string }>(
    `SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int), 0)::text AS m
       FROM trips
      WHERE trip_date = $1::date AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`,
    [tripDate]
  );
  return Number(result.rows[0].m) + 1;
}

async function generateTripNo(client: Client, tripDate: string): Promise<string> {
  // Serialize allocators for the same calendar day (all statuses / deleted).
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`trip_no_${tripDate}`]);
  const seq = await nextSequenceForTripDate(client, tripDate);
  return formatTripNo(tripDate, seq);
}

async function assertOptimisticLock(
  client: Client,
  tripId: number,
  expectedUpdatedAt?: string | null
) {
  if (!expectedUpdatedAt) return;

  const current = await client.query(`SELECT updated_at FROM trips WHERE id = $1`, [tripId]);
  if (!current.rowCount) throw new AppError(404, `Trip ${tripId} not found`);

  const dbUpdated = isoOrNull(current.rows[0].updated_at);
  const expected = isoOrNull(expectedUpdatedAt);
  if (dbUpdated && expected && dbUpdated !== expected) {
    throw new AppError(409, "Trip was modified by another session", {
      tripId,
      expectedUpdatedAt: expected,
      currentUpdatedAt: dbUpdated,
    });
  }
}

async function enrichMasterDenorm(
  client: Client,
  body: Partial<Trip> & Record<string, unknown>
) {
  if (body.vehicleId && !body.vehicleNo) {
    const v = await client.query(`SELECT vehicle_number FROM vehicles WHERE id = $1`, [
      body.vehicleId,
    ]);
    if (v.rowCount) body.vehicleNo = str(v.rows[0].vehicle_number);
  }
  if (body.driverId && !body.driverName) {
    const e = await client.query(`SELECT employee_name FROM employees WHERE id = $1`, [
      body.driverId,
    ]);
    if (e.rowCount) body.driverName = str(e.rows[0].employee_name);
  }
  if (body.supervisorId && !body.supervisorName) {
    const e = await client.query(`SELECT employee_name FROM employees WHERE id = $1`, [
      body.supervisorId,
    ]);
    if (e.rowCount) body.supervisorName = str(e.rows[0].employee_name);
  }
  if (body.sourceFarmId && !body.sourceFarm) {
    const f = await client.query(`SELECT farm_name FROM farms WHERE id = $1`, [
      body.sourceFarmId,
    ]);
    if (f.rowCount) body.sourceFarm = str(f.rows[0].farm_name);
  }
  if (body.farmBirdTypeId && !body.farmBirdType) {
    const b = await client.query(`SELECT bird_type FROM bird_types WHERE id = $1`, [
      body.farmBirdTypeId,
    ]);
    if (b.rowCount) body.farmBirdType = str(b.rows[0].bird_type);
  }
}

async function replaceCrew(
  client: Client,
  tripId: number,
  helpers: string[] = [],
  loaders: string[] = []
) {
  await client.query(`DELETE FROM trip_crew WHERE trip_id = $1`, [tripId]);

  // De-duplicate dropped names so a helper/loader selected twice on the same
  // submission can never trip the (trip_id, employee_name, role) unique index.
  const uniqueNames = (names: string[]) =>
    [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];

  const resolvedHelpers = await resolveEmployeeNames(client, uniqueNames(helpers), "helper");
  for (const member of resolvedHelpers) {
    await client.query(
      `INSERT INTO trip_crew (trip_id, employee_id, employee_name, role)
       VALUES ($1,$2,$3,'helper')`,
      [tripId, member.employeeId, member.employeeName]
    );
  }

  const resolvedLoaders = await resolveEmployeeNames(client, uniqueNames(loaders), "loader");
  for (const member of resolvedLoaders) {
    await client.query(
      `INSERT INTO trip_crew (trip_id, employee_id, employee_name, role)
       VALUES ($1,$2,$3,'loader')`,
      [tripId, member.employeeId, member.employeeName]
    );
  }
}

async function replaceBoxes(
  client: Client,
  tripId: number,
  boxes: BoxDetail[] = [],
  legId?: number | null
) {
  if (legId != null && legId > 0) {
    await client.query(`DELETE FROM trip_boxes WHERE trip_id = $1 AND leg_id = $2`, [
      tripId,
      legId,
    ]);
  } else {
    await client.query(`DELETE FROM trip_boxes WHERE trip_id = $1`, [tripId]);
  }
  for (const box of boxes) {
    const birds = Number(box.birds ?? 0);
    const weight = Number(box.weight ?? 0);
    // Per-box average weight = weight / birds. Never divide by zero.
    const avgWeight =
      birds > 0 && Number.isFinite(weight) ? Number((weight / birds).toFixed(3)) : null;
    await client.query(
      `INSERT INTO trip_boxes (trip_id, leg_id, box_no, birds, weight, avg_weight) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tripId, legId ?? null, box.boxNo, birds, weight, avgWeight]
    );
  }
}

/**
 * Trip Entry Step 4 (Deliveries) capacity guard â€” backend-authoritative,
 * mirrors the same rule already proven correct for Shop Sales edits
 * (assertWithinCapacity / sumActiveDeliveries in tripDeliverySync.ts, and
 * shopSalesService.ts's lockTrip()): the sum of every shop delivery's birds
 * PLUS mortality must never exceed the trip's originally loaded birds, and
 * the sum of every delivery's weight PLUS mortality-weight must never
 * exceed the originally loaded weight. Birds and weight are independent â€”
 * neither is derived from the other.
 *
 * replaceDeliveries() below is a full delete+reinsert of the whole delivery
 * list in one call (not a single-row edit like Shop Sales), so there is no
 * "existing minus self" to exclude â€” every row in the incoming `deliveries`
 * array is summed against the trip's own capacity. The trip row is locked
 * FOR UPDATE first (same pattern already proven correct under real
 * concurrency for Shop Sales in shopSalesService.ts) so two concurrent Step
 * 4 submissions for the same trip can never both race past capacity.
 */
async function assertDeliveriesWithinCapacity(
  client: Client,
  tripId: number,
  deliveries: ShopDelivery[],
  legId?: number | null
): Promise<void> {
  const tripRow = await client.query<{
    farm_bird_count: number | null;
    farm_load_weight: string | null;
    total_birds: number | null;
    dc_weight: string | null;
    vehicle_id: number | null;
    remarks: string | null;
  }>(
    `SELECT farm_bird_count, farm_load_weight, total_birds, dc_weight, vehicle_id, remarks
       FROM trips WHERE id = $1 FOR UPDATE`,
    [tripId]
  );
  if (!tripRow.rowCount) return; // caller already guarantees the trip exists
  const row = tripRow.rows[0];
  const isOrdersCollection =
    row.vehicle_id == null && String(row.remarks ?? "").trim() === "[ORDER_COLLECTION]";

  if (isOrdersCollection) {
    const shopIds = new Set<number>();
    for (const delivery of deliveries) {
      const shopId = Number(delivery.shopId);
      const boxes = Number(delivery.boxNo);
      const birds = Number(delivery.birds ?? 0);
      const weight = Number(delivery.weight ?? 0);
      if (!Number.isSafeInteger(shopId) || shopId <= 0) {
        throw new AppError(422, "Order collection shop id must be a positive integer.");
      }
      if (shopIds.has(shopId)) throw new AppError(409, "Duplicate shop in order collection.");
      shopIds.add(shopId);
      if (!Number.isSafeInteger(boxes) || boxes <= 0 || boxes > 9999) {
        throw new AppError(422, "Order collection boxes must be a whole number from 1 to 9999.");
      }
      if (!Number.isSafeInteger(birds) || birds < 0 || birds > 9999) {
        throw new AppError(422, "Order collection birds must be a whole number from 0 to 9999.");
      }
      if (!Number.isFinite(weight) || weight < 0 || weight > 999999 || Number(weight.toFixed(2)) !== weight) {
        throw new AppError(422, "Order collection weight must be a non-negative number with at most 2 decimals.");
      }
      if (weight > 0 && birds === 0) {
        throw new AppError(422, "Order collection birds are required when weight is supplied.");
      }
    }
    if (shopIds.size > 0) {
      const active = await client.query<{ id: number }>(
        `SELECT id FROM shops WHERE id = ANY($1::int[]) AND status='Active'`,
        [[...shopIds]],
      );
      if (active.rowCount !== shopIds.size) {
        throw new AppError(422, "One or more selected shops are inactive or no longer available.");
      }
    }
    return;
  }

  let farmBirdCount = num(row.farm_bird_count);
  let farmLoadWeight = num(row.farm_load_weight);
  let totalBirdsCap = num(row.total_birds);
  let dcWeightCap = num(row.dc_weight);
  if (legId != null && legId > 0) {
    const leg = await client.query(
      `SELECT farm_bird_count, farm_load_weight, total_birds, dc_weight FROM trip_legs WHERE id = $1`,
      [legId]
    );
    if (leg.rowCount) {
      farmBirdCount = num(leg.rows[0].farm_bird_count);
      farmLoadWeight = num(leg.rows[0].farm_load_weight);
      totalBirdsCap = num(leg.rows[0].total_birds);
      dcWeightCap = num(leg.rows[0].dc_weight);
    }
  }
  const capacityBirds = farmBirdCount > 0 ? farmBirdCount : totalBirdsCap;
  const capacityWeight = farmLoadWeight > 0 ? farmLoadWeight : dcWeightCap;

  let totalBirds = 0;
  let totalWeight = 0;
  const orderBalances = new Map<
    string,
    { orderRef: string; shopId: number; planned: number; captured: number }
  >();
  for (const d of deliveries) {
    const birds = Number(d.birds ?? 0);
    const weight = Number(d.weight ?? 0);
    if (!Number.isInteger(birds) || birds < 0) {
      throw new AppError(422, `Shop delivery birds must be a non-negative whole number (got ${d.birds}).`);
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new AppError(422, `Shop delivery weight must be a non-negative number (got ${d.weight}).`);
    }
    const remarks = String(d.remarks ?? "");
    const isOrderRow = remarks.startsWith("[ORDER]");
    const isCapturedOrderRow =
      isOrderRow &&
      Boolean(
        d.autoCaptureTime ||
          (d as { deliveredAt?: string }).deliveredAt ||
          (d as { deliveryTime?: string }).deliveryTime
      );
    if (isOrderRow) {
      const boxes = Number(d.boxNo ?? 0);
      if (!Number.isSafeInteger(boxes) || boxes <= 0) {
        throw new AppError(422, "Orders assignment/delivery boxes must be a positive whole number.");
      }
      const orderRef = remarks.match(/\bO:([^|\s]+)/)?.[1] ?? "";
      const shopId = Number(d.shopId ?? 0);
      if (!orderRef || !Number.isSafeInteger(shopId) || shopId <= 0) {
        throw new AppError(422, "Orders assignment rows require a valid order reference and shop id.");
      }
      const key = `${orderRef}:${shopId}`;
      const balance = orderBalances.get(key) ?? {
        orderRef,
        shopId,
        planned: 0,
        captured: 0,
      };
      if (isCapturedOrderRow) balance.captured += boxes;
      else balance.planned += boxes;
      orderBalances.set(key, balance);
    }
    // Assignment plans carry proportional figures for reporting only. They
    // do not consume pickup capacity until a real Step 4 capture exists.
    if (!isOrderRow || isCapturedOrderRow) {
      totalBirds += birds + Number(d.mortality ?? 0);
      totalWeight = Number((totalWeight + weight + Number(d.mortKg ?? 0)).toFixed(2));
    }
  }
  for (const [key, balance] of orderBalances) {
    if (balance.captured > balance.planned) {
      throw new AppError(
        422,
        `Delivered boxes exceed the assigned quantity for order/shop ${key} (${balance.captured} > ${balance.planned}).`
      );
    }

    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `orders_assignment_${balance.orderRef}_${balance.shopId}`,
    ]);

    const collected = await client.query<{ box_no: number }>(
      `SELECT d.box_no
         FROM trips c
         JOIN trip_deliveries d ON d.trip_id = c.id
        WHERE c.trip_no = $1
          AND c.deleted = FALSE
          AND c.vehicle_id IS NULL
          AND c.remarks = '[ORDER_COLLECTION]'
          AND d.deleted = FALSE
          AND d.shop_id = $2
          AND d.auto_capture_time IS NULL
        FOR UPDATE OF d`,
      [balance.orderRef, balance.shopId],
    );
    const collectedBoxes = collected.rows.reduce(
      (sum, collectedRow) => sum + Number(collectedRow.box_no ?? 0),
      0,
    );
    if (!Number.isSafeInteger(collectedBoxes) || collectedBoxes <= 0) {
      throw new AppError(409, `Order ${balance.orderRef} has no active collected quantity for this shop.`);
    }

    const assignedElsewhere = await client.query<{ boxes: string }>(
      `SELECT COALESCE(SUM(d.box_no), 0)::text AS boxes
         FROM trip_deliveries d
         JOIN trips t ON t.id = d.trip_id
        WHERE d.trip_id <> $1
          AND t.deleted = FALSE
          AND t.vehicle_id IS NOT NULL
          AND d.deleted = FALSE
          AND d.shop_id = $2
          AND d.remarks = $3
          AND d.auto_capture_time IS NULL`,
      [tripId, balance.shopId, `[ORDER] O:${balance.orderRef}`],
    );
    const elsewhereBoxes = Number(assignedElsewhere.rows[0]?.boxes ?? 0);
    if (elsewhereBoxes + balance.planned > collectedBoxes) {
      throw new AppError(
        409,
        `Order assignment exceeds the collected quantity for order/shop ${key} (${elsewhereBoxes + balance.planned} > ${collectedBoxes}).`,
      );
    }
  }

  assertWithinCapacity({
    label: "birds",
    available: capacityBirds,
    alreadyAllocated: 0,
    requested: totalBirds,
  });
  assertWithinCapacity({
    label: "weight",
    available: capacityWeight,
    alreadyAllocated: 0,
    requested: totalWeight,
  });
}

async function replaceDeliveries(
  client: Client,
  tripId: number,
  deliveries: ShopDelivery[] = [],
  legId?: number | null
) {
  if (deliveries.length > 0) {
    await assertDeliveriesWithinCapacity(client, tripId, deliveries, legId);
  }
  if (legId != null && legId > 0) {
    await client.query(`DELETE FROM trip_deliveries WHERE trip_id = $1 AND leg_id = $2`, [
      tripId,
      legId,
    ]);
  } else {
    await client.query(`DELETE FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
  }
  if (deliveries.length === 0) return;

  // trip_deliveries.sale_no is NOT NULL (023_shop_sales_hardening.sql) in the
  // existing "<tripNo>-S<seq>" format also used by shopSalesService.ts for
  // post-completion Shop Sales edits. This wizard path (Step 4, Draft/Pending
  // trips) never populated it, which is exactly why new inserts here started
  // violating the constraint â€” reuse the same generateSaleNo() rather than
  // inventing a second numbering scheme. Full delete+reinsert (existing
  // behavior above) means the per-trip sequence restarts each save; that is
  // unchanged from how serial_no/id already behave for this same function.
  const tripRow = await client.query<{ trip_no: string }>(
    `SELECT trip_no FROM trips WHERE id = $1`,
    [tripId]
  );
  const tripNo = tripRow.rows[0]?.trip_no ?? `TR-${tripId}`;

  for (const [index, d] of deliveries.entries()) {
    // Financial values are authoritative on the server. Never persist a
    // browser-supplied amount that can be derived from weight and rate.
    const weight = Number(Number(d.weight ?? 0).toFixed(2));
    const mortKg = Number(Number(d.mortKg ?? 0).toFixed(2));
    const amount = computeDeliveryAmount(weight, d.rate);

    const saleNo = await generateSaleNo(client, tripId, tripNo);

    const inserted = await client.query(
      `INSERT INTO trip_deliveries (
         trip_id, leg_id, sale_no, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
         birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
         farm_birds, farm_weight, auto_capture_time, client_key, sub_shop_name
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id`,
      [
        tripId,
        legId ?? null,
        saleNo,
        d.serialNo ?? index + 1,
        d.boxNo ?? null,
        d.shopId ?? null,
        d.shopName ?? "",
        d.birdTypeId ?? null,
        d.birdType ?? "",
        d.birds ?? 0,
        weight,
        d.mortality ?? 0,
        mortKg,
        d.rate ?? null,
        amount,
        d.remarks ?? "",
        d.deliveryMode ?? "box",
        d.farmBirds ?? null,
        d.farmWeight == null ? null : Number(Number(d.farmWeight).toFixed(2)),
        normalizeTripTimestamp(d.autoCaptureTime),
        d.clientKey ?? null,
        d.subShopName ?? "",
      ]
    );
    const deliveryId = num(inserted.rows[0].id);

    for (const boxNo of d.selectedBoxIds ?? []) {
      await client.query(
        `INSERT INTO trip_delivery_boxes (delivery_id, box_no) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [deliveryId, boxNo]
      );
    }

    for (const pb of d.perBoxData ?? []) {
      await client.query(
        `INSERT INTO trip_delivery_per_box (delivery_id, box_no, birds, weight)
         VALUES ($1,$2,$3,$4)`,
        [deliveryId, pb.boxNo, pb.birds ?? 0, Number(Number(pb.weight ?? 0).toFixed(2))]
      );
    }
  }
}

async function replaceDiesel(
  client: Client,
  tripId: number,
  entries: DieselEntry[] = []
) {
  await client.query(`DELETE FROM trip_diesel_entries WHERE trip_id = $1`, [tripId]);
  for (const e of entries) {
    const bunkGps =
      e.bunkGps ??
      (e.gpsLat != null && e.gpsLon != null
        ? `${Number(e.gpsLat).toFixed(6)},${Number(e.gpsLon).toFixed(6)}`
        : null);
    await client.query(
      `INSERT INTO trip_diesel_entries (
         trip_id, row_index, litres, rate, meter, bunk_name, bunk_source, fuel_bunk_id,
         bunk_gps, image_data, image_name, client_key, gps_lat, gps_lon, gps_accuracy,
         gps_captured_at, submitted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,COALESCE($17::timestamptz, NOW()))`,
      [
        tripId,
        e.rowIndex,
        e.litres ?? null,
        e.rate ?? null,
        e.meter ?? null,
        e.bunkName ?? null,
        e.bunkSource ?? "OTHER",
        e.fuelBunkId ?? null,
        bunkGps,
        e.imageData ?? null,
        e.imageName ?? null,
        e.clientKey ?? null,
        e.gpsLat ?? null,
        e.gpsLon ?? null,
        e.gpsAccuracy ?? null,
        e.gpsCapturedAt ?? null,
        e.submittedAt ?? null,
      ]
    );
  }
}

function extractDieselFromBody(body: Record<string, unknown>): DieselEntry[] {
  if (Array.isArray(body.dieselEntries)) {
    return body.dieselEntries as DieselEntry[];
  }

  const indices = new Set<number>();
  for (const key of Object.keys(body)) {
    const match = key.match(/^dieselLtr(\d+)$/);
    if (match) indices.add(Number(match[1]));
  }

  return [...indices]
    .sort((a, b) => a - b)
    .map((rowIndex) => ({
      rowIndex,
      litres: numOrNull(body[`dieselLtr${rowIndex}`]),
      rate: numOrNull(body[`dieselRate${rowIndex}`]),
      meter: numOrNull(body[`dieselMeter${rowIndex}`]),
      bunkName: body[`dieselBunk${rowIndex}`]
        ? str(body[`dieselBunk${rowIndex}`])
        : null,
      bunkSource: body[`dieselBunkSource${rowIndex}`] === "MASTER" ? "MASTER" : "OTHER",
      fuelBunkId: numOrNull(body[`dieselFuelBunkId${rowIndex}`]),
      bunkGps: body[`dieselBunkGps${rowIndex}`]
        ? str(body[`dieselBunkGps${rowIndex}`])
        : null,
      imageData: body[`dieselImage${rowIndex}`]
        ? str(body[`dieselImage${rowIndex}`])
        : null,
      imageName: body[`dieselImageName${rowIndex}`]
        ? str(body[`dieselImageName${rowIndex}`])
        : null,
      clientKey: body[`dieselClientKey${rowIndex}`]
        ? str(body[`dieselClientKey${rowIndex}`])
        : null,
      gpsLat: numOrNull(body[`dieselGpsLat${rowIndex}`]),
      gpsLon: numOrNull(body[`dieselGpsLon${rowIndex}`]),
      gpsAccuracy: numOrNull(body[`dieselGpsAccuracy${rowIndex}`]),
      gpsCapturedAt: body[`dieselGpsCapturedAt${rowIndex}`]
        ? str(body[`dieselGpsCapturedAt${rowIndex}`])
        : null,
    }));
}

function flattenDiesel(entries: DieselEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) {
    out[`dieselId${e.rowIndex}`] = e.id ?? null;
    out[`dieselLtr${e.rowIndex}`] = e.litres;
    out[`dieselRate${e.rowIndex}`] = e.rate;
    out[`dieselMeter${e.rowIndex}`] = e.meter;
    out[`dieselBunk${e.rowIndex}`] = e.bunkName;
    out[`dieselBunkSource${e.rowIndex}`] = e.bunkSource ?? "OTHER";
    out[`dieselFuelBunkId${e.rowIndex}`] = e.fuelBunkId ?? null;
    // Never duplicate full base64 into flat keys — FE reads dieselEntries /
    // keeps local sheet images. Flat keys only carry the file name + flag.
    out[`dieselImageName${e.rowIndex}`] = e.imageName;
    out[`dieselHasImage${e.rowIndex}`] = Boolean(e.imageData && String(e.imageData).length > 40);
    out[`dieselClientKey${e.rowIndex}`] = e.clientKey ?? null;
    out[`dieselGpsLat${e.rowIndex}`] = e.gpsLat ?? null;
    out[`dieselGpsLon${e.rowIndex}`] = e.gpsLon ?? null;
    out[`dieselGpsAccuracy${e.rowIndex}`] = e.gpsAccuracy ?? null;
    out[`dieselGpsCapturedAt${e.rowIndex}`] = e.gpsCapturedAt ?? null;
    out[`dieselSubmitted${e.rowIndex}`] = e.submitted !== false;
    out[`dieselSubmittedAt${e.rowIndex}`] = e.submittedAt ?? null;
  }
  return out;
}

/** After a single-row diesel write, slim other rows' images so 5–10 bill trips
 *  do not re-download megabytes of base64 on every submit. */
function slimDieselEntriesForWriteResponse(
  entries: DieselEntry[],
  keepRowIndex: number
): DieselEntry[] {
  return entries.map((entry) => {
    if (entry.rowIndex === keepRowIndex) return entry;
    const hasImage = Boolean(entry.imageData && String(entry.imageData).length > 40);
    return hasImage ? { ...entry, imageData: null } : entry;
  });
}

function buildListWhere(filters: {
  fromDate?: string;
  toDate?: string;
  status?: string;
  vehicleId?: number;
  supervisorId?: number;
  search?: string;
  includeDeleted?: boolean;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  // A caller explicitly filtering status=Deleted is asking for deleted trips
  // by definition (soft-delete always sets status='Deleted'), so the default
  // "hide deleted" clause must not be ANDed in â€” otherwise the two clauses
  // contradict each other and the query always returns zero rows.
  if (!filters.includeDeleted && filters.status !== "Deleted") {
    clauses.push(`deleted = FALSE`);
    // A trip whose `status` is 'Deleted' is deleted even if the boolean flag
    // was left inconsistent by a legacy write path â€” never list it again.
    if (!filters.status) {
      clauses.push(`status <> 'Deleted'`);
    }
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`trip_date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`trip_date <= $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    clauses.push(`vehicle_id = $${params.length}`);
  }
  if (filters.supervisorId) {
    params.push(filters.supervisorId);
    clauses.push(`supervisor_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(
      `(trip_no ILIKE $${params.length} OR vehicle_no ILIKE $${params.length} OR driver_name ILIKE $${params.length} OR supervisor_name ILIKE $${params.length} OR source_farm ILIKE $${params.length})`
    );
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Trip List query â€” read-only historical view.
 *
 * Eligibility is enforced IN THE DATABASE, never in the caller:
 *   â€¢ only `status = 'Completed'` trips (the system's completed/approved state)
 *   â€¢ only `deleted = FALSE` rows
 * Draft / Pending / Deleted / soft-deleted / inconsistent rows are excluded
 * by the WHERE clause itself, regardless of any filter the client sends.
 */
function buildTripListWhere(filters: {
  fromDate?: string;
  toDate?: string;
  vehicleId?: number;
  supervisorId?: number;
  driverId?: number;
  farmId?: number;
  search?: string;
}) {
  const clauses: string[] = [`deleted = FALSE`, `status = 'Completed'`];
  const params: unknown[] = [];

  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`trip_date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`trip_date <= $${params.length}`);
  }
  if (filters.vehicleId) {
    params.push(filters.vehicleId);
    clauses.push(`vehicle_id = $${params.length}`);
  }
  if (filters.supervisorId) {
    params.push(filters.supervisorId);
    clauses.push(`supervisor_id = $${params.length}`);
  }
  if (filters.driverId) {
    params.push(filters.driverId);
    clauses.push(`driver_id = $${params.length}`);
  }
  if (filters.farmId) {
    params.push(filters.farmId);
    clauses.push(`source_farm_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(
      `(trip_no ILIKE $${params.length} OR vehicle_no ILIKE $${params.length} OR driver_name ILIKE $${params.length} OR supervisor_name ILIKE $${params.length} OR source_farm ILIKE $${params.length})`
    );
  }

  return {
    where: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

function applyComputedFields(
  body: Partial<Trip> & Record<string, unknown>,
  boxDetails: BoxDetail[],
  deliveries: ShopDelivery[]
) {
  const kpis = computeTripKpis({
    boxes: boxDetails,
    deliveries,
    farmBirdCount: body.farmBirdCount as number | null,
    farmLoadWeight: body.farmLoadWeight as number | null,
    dcWeight: body.dcWeight as number | null,
    totalBirds: body.totalBirds as number | null,
  });

  body.totalWeight = kpis.totalWeight;
  body.totalDeliveredWeight = kpis.totalDeliveredWeight;
  body.totalBirdsDelivered = kpis.totalBirdsDelivered;
  body.totalMortality = kpis.totalMortality;
  body.totalMortalityCount = kpis.totalMortalityCount;
  body.totalMortalityWeight = kpis.totalMortalityWeight;
  body.weightLoss = kpis.weightLoss;
  body.survivalRate = kpis.survivalRate;
  body.totalShops = kpis.totalShops;
  body.lastShop = kpis.lastShop;
  if (boxDetails.length) {
    body.boxes = kpis.boxes;
    body.totalBirds = kpis.totalBirds;
    body.avgWeight = kpis.avgWeight;
    // DC weight is derived from the persisted box rows (authoritative).
    body.dcWeight = kpis.totalWeight;
    body.totalWeight = kpis.totalWeight;
  }
  if (deliveries.length) {
    body.deliveries = kpis.deliveries;
  }

  body.totalKm = computeTotalKm(
    body.openingMeter as number | null,
    body.closingMeter as number | null,
    body.endMeter as number | null
  );

  if (body.farmLoadWeight != null || body.farmRate != null) {
    body.farmAmount = computeFarmAmount(
      body.farmLoadWeight as number | null,
      body.farmRate as number | null
    );
  }
}

/** Canonical per-load Recent Trips metrics. Only submitted Step 4 loads count. */
const recentLoadSummarySelect = `,
  (SELECT COUNT(*) FROM trip_legs submitted
    WHERE submitted.trip_id = trips.id AND submitted.farm_step_submitted = TRUE) AS submitted_load_count,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'load', totals.leg_index,
        'birds', totals.birds,
        'weight', totals.weight,
        'mortality', totals.mortality,
        'mortalityWeight', totals.mortality_weight,
        'weightLoss', GREATEST(0, totals.dc_weight - totals.weight - totals.mortality_weight),
        'shops', totals.shops
      ) ORDER BY totals.leg_index
    )
    FROM (
      SELECT leg.leg_index,
             COALESCE(leg.dc_weight, 0) AS dc_weight,
             COALESCE(SUM(delivery.birds), 0) AS birds,
             COALESCE(SUM(delivery.weight), 0) AS weight,
             COALESCE(SUM(delivery.mortality), 0) AS mortality,
             COALESCE(SUM(delivery.mort_kg), 0) AS mortality_weight,
             COUNT(DISTINCT delivery.shop_id) AS shops
        FROM trip_legs leg
        LEFT JOIN trip_deliveries delivery
          ON delivery.trip_id = leg.trip_id
         AND delivery.leg_id = leg.id
         AND COALESCE(delivery.deleted, FALSE) = FALSE
       WHERE leg.trip_id = trips.id
         AND leg.delivery_step_submitted = TRUE
       GROUP BY leg.id, leg.leg_index, leg.dc_weight
    ) totals
  ), '[]'::jsonb) AS load_summaries`;

export const tripsService = {
  /**
   * Preview the next trip number for a selected business date.
   * Same rule as create (MAX+1 across all statuses including deleted).
   * Approximate under concurrency — authoritative number is assigned on create.
   */
  async previewNextTripNo(rawDate: unknown): Promise<{ tripDate: string; tripNo: string; sequence: number }> {
    const tripDate = resolveTripDateForNumbering(rawDate, { required: true });
    const result = await query<{ m: string }>(
      `SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int), 0)::text AS m
         FROM trips
        WHERE trip_date = $1::date AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`,
      [tripDate]
    );
    const sequence = Number(result.rows[0]?.m ?? 0) + 1;
    return { tripDate, tripNo: formatTripNo(tripDate, sequence), sequence };
  },

  async list(
    filters: {
      fromDate?: string;
      toDate?: string;
      status?: string;
      vehicleId?: number;
      supervisorId?: number;
      search?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
      full?: boolean;
    } = {}
  ): Promise<TripSummary[] | Trip[] | PaginatedResult<TripSummary>> {
    const { where, params } = buildListWhere(filters);

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM trips ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `SELECT trips.*,
                (SELECT COUNT(*) FROM trip_boxes b WHERE b.trip_id = trips.id) AS box_count,
                (SELECT COUNT(*) FROM trip_deliveries d WHERE d.trip_id = trips.id) AS delivery_count,
                (SELECT COUNT(*) FROM trip_diesel_entries e WHERE e.trip_id = trips.id) AS diesel_count
                ${recentLoadSummarySelect}
         FROM trips ${where}
         ORDER BY trip_date DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      const summaries = result.rows.map(toTripSummary);
      return paginatedResult(summaries, total, filters.pagination);
    }

    const result = await query(
      `SELECT trips.*,
              (SELECT COUNT(*) FROM trip_boxes b WHERE b.trip_id = trips.id) AS box_count,
              (SELECT COUNT(*) FROM trip_deliveries d WHERE d.trip_id = trips.id) AS delivery_count,
              (SELECT COUNT(*) FROM trip_diesel_entries e WHERE e.trip_id = trips.id) AS diesel_count
              ${recentLoadSummarySelect}
       FROM trips ${where} ORDER BY trip_date DESC, id DESC`,
      params
    );

    if (filters.full) {
      return withTransaction(async (client) => {
        const trips: Trip[] = [];
        for (const row of result.rows) {
          const trip = await hydrateTrip(client, row);
          trips.push({
            ...trip,
            ...flattenDiesel(trip.dieselEntries ?? []),
            stepStatuses: computeStepStatuses(trip, {
              boxCount: trip.boxDetails.length,
              deliveryCount: trip.deliveries.length,
              dieselCount: (trip.dieselEntries ?? []).length,
            }),
          });
        }
        return trips;
      });
    }

    return result.rows.map(toTripSummary);
  },

  /**
   * Trip List â€” returns ONLY completed/approved, non-deleted trips.
   * The eligibility rule lives in the SQL WHERE clause (see buildTripListWhere),
   * so the frontend can never pull Draft/Pending/Deleted rows and filter locally.
   */
  async listCompleted(
    filters: {
      fromDate?: string;
      toDate?: string;
      vehicleId?: number;
      supervisorId?: number;
      driverId?: number;
      farmId?: number;
      search?: string;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<TripSummary[] | PaginatedResult<TripSummary>> {
    const { where, params } = buildTripListWhere(filters);

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM trips ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [
        ...params,
        filters.pagination.limit,
        filters.pagination.offset,
      ];
      const result = await query(
        `SELECT trips.*
                ${recentLoadSummarySelect}
           FROM trips ${where}
         ORDER BY trip_date DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(
        result.rows.map(toTripSummary),
        total,
        filters.pagination
      );
    }

    const result = await query(
      `SELECT trips.*
              ${recentLoadSummarySelect}
         FROM trips ${where} ORDER BY trip_date DESC, id DESC`,
      params
    );
    return result.rows.map(toTripSummary);
  },

  /**
   * Trip List detail â€” full trip only when eligible (completed + not deleted).
   * A Draft / Pending / Deleted trip id returns 404, so the read-only view can
   * never surface a trip that should not be in the list.
   */
  async getCompletedById(id: number) {
    const result = await query(
      `SELECT * FROM trips WHERE id = $1 AND deleted = FALSE AND status = 'Completed'`,
      [id]
    );
    if (!result.rowCount) {
      throw new AppError(404, `Trip ${id} not found in Trip List`);
    }

    return withTransaction(async (client) => {
      const trip = await hydrateTrip(client, result.rows[0], {
        includeDcPhoto: true,
      });
      const flags = {
        startStepSubmitted: trip.startStepSubmitted,
        farmStepSubmitted: trip.farmStepSubmitted,
        pickupStepSubmitted: trip.pickupStepSubmitted,
        deliveryStepSubmitted: trip.deliveryStepSubmitted,
        expensesStepSubmitted: trip.expensesStepSubmitted,
        endStepSubmitted: trip.endStepSubmitted,
        status: trip.status,
        deleted: trip.deleted,
      };
      return {
        ...trip,
        ...flattenDiesel(trip.dieselEntries ?? []),
        resumeStep: getResumeStep(flags),
        resumeStepLabel: getResumeLabel(flags),
        wizardProgress: getWizardProgress(flags),
      };
    });
  },

  async getById(id: number, viewLegIndex?: number) {
    const result = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);

    try {
      return await withTransaction(async (client) => {
        const trip = await hydrateTrip(client, result.rows[0], { includeDcPhoto: true, viewLegIndex });
        // Proactive lock state for the editor: meters render read-only when a
        // later same-vehicle approval exists. Enforcement stays backend-side.
        const meterLock = await getTripMeterLock(client, id);
        (trip as unknown as Record<string, unknown>).meterLocked = meterLock.locked;
        (trip as unknown as Record<string, unknown>).meterLockReason = meterLock.reason;
        const flags = {
          startStepSubmitted: trip.startStepSubmitted,
          farmStepSubmitted: trip.farmStepSubmitted,
          pickupStepSubmitted: trip.pickupStepSubmitted,
          deliveryStepSubmitted: trip.deliveryStepSubmitted,
          expensesStepSubmitted: trip.expensesStepSubmitted,
          endStepSubmitted: trip.endStepSubmitted,
          status: trip.status,
          deleted: trip.deleted,
        };
        return {
          ...trip,
          ...flattenDiesel(trip.dieselEntries ?? []),
          resumeStep: getResumeStep(flags),
          resumeStepLabel: getResumeLabel(flags),
          wizardProgress: getWizardProgress(flags),
          stepStatuses: computeStepStatuses(trip, {
            boxCount: trip.boxDetails.length,
            deliveryCount: trip.deliveries.length,
            dieselCount: (trip.dieselEntries ?? []).length,
          }),
        };
      });
    } catch (err) {
      if (!(err instanceof AppError)) {
        console.error(`[trips.getById] failed for trip ${id}:`, err);
      }
      throw err;
    }
  },

  async createDraft(body: Partial<Trip> = {}) {
    return withTransaction(async (client) => {
      try {
        // Number from the selected business date (not UTC "yesterday").
        // Counts Draft / Pending / Completed / Deleted for that day.
        const tripDate = resolveTripDateForNumbering(body.tripDate, { required: false });
        const tripNo = await generateTripNo(client, tripDate);

        const remarks = body.remarks == null ? null : str(body.remarks).trim() || null;
        const inserted = await client.query(
          `INSERT INTO trips (trip_no, trip_date, status, remarks)
           VALUES ($1,$2,'Draft',$3) RETURNING *`,
          [tripNo, tripDate, remarks]
        );
        await ensureTripLeg1(client, num(inserted.rows[0].id));
        const trip = await hydrateTrip(client, inserted.rows[0]);
        const flags = {
          startStepSubmitted: trip.startStepSubmitted,
          farmStepSubmitted: trip.farmStepSubmitted,
          pickupStepSubmitted: trip.pickupStepSubmitted,
          deliveryStepSubmitted: trip.deliveryStepSubmitted,
          expensesStepSubmitted: trip.expensesStepSubmitted,
          status: trip.status,
          deleted: trip.deleted,
        };
        return {
          ...trip,
          resumeStep: getResumeStep(flags) ?? "start",
          resumeStepLabel: getResumeLabel(flags) ?? "Step 1 â€” Trip Header",
          wizardProgress: getWizardProgress(flags),
          stepStatuses: computeStepStatuses(trip, {
            boxCount: trip.boxDetails.length,
            deliveryCount: trip.deliveries.length,
            dieselCount: (trip.dieselEntries ?? []).length,
          }),
        };
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Autosave engine â€” partial upsert with optimistic locking */
  async save(id: number | null, body: Partial<Trip> & Record<string, unknown>) {
    parseTripAutosave(body);

    // Deletion is permanent and atomic: whenever a write marks a trip deleted
    // (via `status` or the `deleted` flag), keep both in lockstep so a soft-
    // deleted trip can never partially un-delete and reappear in Trip List.
    if (body.status === "Deleted" || body.deleted === true) {
      body.status = "Deleted";
      body.deleted = true;
    }

    return withTransaction(async (client) => {
      try {
        let tripId = id;
        let existing: {
          rowCount: number | null;
          rows: Array<Record<string, unknown>>;
        } | null = null;

        if (tripId) {
          existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
          if (!existing.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
          if (existing.rows[0].deleted) {
            throw new AppError(422, "Cannot modify a deleted trip", { tripId });
          }
          await assertOptimisticLock(
            client,
            tripId,
            (body.expectedUpdatedAt as string) ?? (body.updatedAt as string)
          );
        }

        // Trip numbers are always server-generated. Creation allocates against
        // the selected date; a Step 1 date edit allocates a fresh number for
        // the new date. Old numbers remain consumed because allocation is
        // MAX+1 across every status (including soft-deleted rows).
        await validateTripForeignKeys(body, client);
        // Inactive vehicles accept no new trip activity (historical rows keep working).
        if (body.vehicleId != null) {
          await assertVehicleActive(numOrNull(body.vehicleId), client);
        }

        // Meter-lock enforcement (Steps 1/2/5, diesel table, trip-date moves).
        // Runs on every meter-CHANGING write — including autosave, which
        // bypasses submit-time validation — so a stale page can never
        // overwrite meters after a later same-vehicle approval. Writes that
        // change no meter value are never blocked here.
        if (tripId && existing) {
          const prev = existing.rows[0];
          const meterTouched =
            (body.openingMeter !== undefined &&
              numOrNull(body.openingMeter) !== numOrNull(prev.opening_meter)) ||
            (body.closingMeter !== undefined &&
              numOrNull(body.closingMeter) !== numOrNull(prev.closing_meter)) ||
            (body.endMeter !== undefined &&
              numOrNull(body.endMeter) !== numOrNull(prev.end_meter)) ||
            body.destMeter !== undefined ||
            (body.tripDate != null &&
              (dateOnly(str(body.tripDate)) ?? "") !== (dateOnly(prev.trip_date) ?? "")) ||
            extractDieselFromBody(body).length > 0;
          if (meterTouched) {
            const lockVehicleId =
              numOrNull(body.vehicleId) ?? numOrNull(prev.vehicle_id);
            if (lockVehicleId != null) {
              await lockVehicleForMeterWrite(client, lockVehicleId);
            }
            await assertTripMetersEditable(client, tripId);
          }
        }
        await enrichMasterDenorm(client, body);

        // Resource availability is DB-backed and transaction-safe. A single
        // trip occupies its resources while Step 1 is submitted through Step 5
        // (status 'Draft'); Step 5 success flips status to 'Pending' and frees
        // them. The current trip is excluded so an edit never conflicts with
        // itself. Throws 409 with a clear message on conflict.
        if (body.vehicleId != null || body.driverId != null || body.supervisorId != null ||
            body.helpers?.length || body.loaders?.length) {
          await assertTripResourcesAvailable(
            {
              tripId: tripId ?? 0,
              vehicleId: body.vehicleId ?? null,
              driverId: body.driverId ?? null,
              supervisorId: body.supervisorId ?? null,
              helpers: (body.helpers as string[] | undefined) ?? [],
              loaders: (body.loaders as string[] | undefined) ?? [],
            },
            client
          );
        }

        if (!tripId) {
          // Selected Step 1 date drives both trip_date and TR-YYYYMMDD-NNN.
          // Client tripNo is ignored; deleted / draft / pending / completed all count.
          const tripDate = resolveTripDateForNumbering(body.tripDate, { required: true });
          const tripNo = await generateTripNo(client, tripDate);
          const inserted = await client.query(
            `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,$3) RETURNING id`,
            [tripNo, tripDate, body.status ?? "Draft"]
          );
          tripId = num(inserted.rows[0].id);
          await ensureTripLeg1(client, tripId);
        } else if (body.tripDate != null) {
          const existingDate = existing ? dateOnly(existing.rows[0].trip_date) : null;
          const requested = resolveTripDateForNumbering(body.tripDate, { required: true });
          if (existingDate && requested && requested !== existingDate) {
            const oldTripNo = str(existing?.rows[0]?.trip_no);
            const tripNo = await generateTripNo(client, requested);
            await client.query(
              `UPDATE trips SET trip_date = $2::date, trip_no = $3, updated_at = NOW() WHERE id = $1`,
              [tripId, requested, tripNo]
            );
            await client.query(
              `UPDATE trip_deliveries
                  SET sale_no = $2 || substring(sale_no from '-S[0-9]+$')
                WHERE trip_id = $1
                  AND sale_no LIKE $3 || '-S%'`,
              [tripId, tripNo, oldTripNo]
            );
          }
        }

        const dieselEntries = extractDieselFromBody(body);
        const boxDetails = (body.boxDetails as BoxDetail[]) ?? [];
        const deliveries = (body.deliveries as ShopDelivery[]) ?? [];
        const legIndex = resolveLegIndex(body);
        await ensureTripLeg1(client, tripId!);
        const activeLeg = await requireTripLeg(client, tripId!, legIndex);
        // Keep a copy for trip_legs writes before stripping Load-1 trip-row fields.
        const legBody: Record<string, unknown> = { ...body };

        // Loads beyond #1 must not overwrite the trip-row mirror of Load 1.
        if (legIndex > 1) {
          delete body.sourceFarmId;
          delete body.sourceFarm;
          delete body.destMeter;
          delete body.pickupTolls;
          delete body.farmAddress;
          delete body.avgBirdWeight;
          delete body.farmRemarks;
          delete body.farmBirdTypeId;
          delete body.farmBirdType;
          delete body.farmBirdCount;
          delete body.farmLoadWeight;
          delete body.farmGpsLat;
          delete body.farmGpsLon;
          delete body.farmGpsAccuracy;
          delete body.farmGpsTime;
          delete body.farmStepSubmitted;
          delete body.dcWeight;
          delete body.totalBirds;
          delete body.boxes;
          delete body.avgWeight;
          delete body.dcPhotoKey;
          delete body.pickupStepSubmitted;
          delete body.deliveryStepSubmitted;
        }

        // ---- Universal vehicle meter validation ----
        // Only runs on a real step submission (start/expenses), never on
        // "Save Progress" autosave (submitStep already strips these flags for
        // autosave bodies before calling save() â€” see submitStep below), so
        // partial in-progress drafts are never blocked mid-entry.
        if (body.startStepSubmitted === true || body.expensesStepSubmitted === true) {
          const vehicleIdForMeter =
            numOrNull(body.vehicleId) ?? (existing ? numOrNull(existing.rows[0].vehicle_id) : null);
          if (vehicleIdForMeter == null) {
            throw new AppError(422, "A vehicle must be selected before submitting this step.");
          }
          // The trip's business date â€” primary chronological key (see the
          // vehicle_meter_events view's comment for why date, not timestamp,
          // is primary: it keeps same-day cross-module comparisons fair).
          // After create, trip_date is locked to the numbered date.
          const tripBusinessDate =
            (existing ? dateOnly(existing.rows[0].trip_date) : null) ??
            dateOnly(body.tripDate);
          if (!tripBusinessDate) {
            throw new AppError(422, "Trip date is required before submitting this step.");
          }
          // Row lock makes "read latest -> validate -> write" atomic for this
          // vehicle: a concurrent request for the same vehicle blocks here
          // until this transaction commits or rolls back.
          await lockVehicleForMeterWrite(client, vehicleIdForMeter);

          if (body.startStepSubmitted === true) {
            const effectiveOpening =
              numOrNull(body.openingMeter) ??
              (existing ? numOrNull(existing.rows[0].opening_meter) : null);
            if (effectiveOpening != null) {
              // On a re-submit/edit, prefer the trip's own already-persisted
              // instant over "now" â€” matches the view's own COALESCE so a
              // re-validated edit is compared against the SAME neighbors it
              // originally had, not shoved past every same-day record created
              // since (see fleetMaintenanceService.update() for the same fix).
              const openingInstant =
                normalizeTripTimestamp(body.startTime) ??
                (existing
                  ? (preciseIsoOrUndefined(existing.rows[0].start_step_submitted_at) ??
                     preciseIsoOrUndefined(existing.rows[0].start_time) ??
                     preciseIsoOrUndefined(existing.rows[0].created_at))
                  : undefined);
              await validateVehicleMeter(client, {
                vehicleId: vehicleIdForMeter,
                newMeter: effectiveOpening,
                eventDate: tripBusinessDate,
                eventInstant: openingInstant,
                exclude: { sourceType: ["TRIP_START", "TRIP_END"], recordId: tripId },
                excludeTripId: tripId,
                context: "Trip start meter",
              });
            }
          }

          if (body.expensesStepSubmitted === true) {
            const effectiveOpening =
              numOrNull(body.openingMeter) ??
              (existing ? numOrNull(existing.rows[0].opening_meter) : null);
            const effectiveClosing =
              numOrNull(body.closingMeter) ??
              numOrNull(body.endMeter) ??
              (existing
                ? (numOrNull(existing.rows[0].closing_meter) ??
                   numOrNull(existing.rows[0].end_meter))
                : null);
            // Same "preserve the original instant on an edit" reasoning as
            // the opening-meter block above.
            const closingEventInstant =
              normalizeTripTimestamp(body.endTime) ??
              (existing
                ? (preciseIsoOrUndefined(existing.rows[0].expenses_step_submitted_at) ??
                   preciseIsoOrUndefined(existing.rows[0].end_time) ??
                   preciseIsoOrUndefined(existing.rows[0].created_at))
                : undefined);

            if (effectiveClosing != null) {
              if (effectiveOpening != null && effectiveClosing < effectiveOpening) {
                throw new AppError(
                  422,
                  `Trip closing meter (${effectiveClosing} KM) cannot be less than the trip's own opening meter (${effectiveOpening} KM).`
                );
              }
              await validateVehicleMeter(client, {
                vehicleId: vehicleIdForMeter,
                newMeter: effectiveClosing,
                eventDate: tripBusinessDate,
                eventInstant: closingEventInstant,
                exclude: { sourceType: ["TRIP_START", "TRIP_END"], recordId: tripId },
                excludeTripId: tripId,
                context: "Trip closing meter",
              });
            }

            // Trip-generated diesel/fuel entries follow the same universal
            // rule where a meter reading is actually persisted. Self-excluded
            // via the diesel row's own already-synced fuel_expenses record
            // (identity: trip_id + trip_fuel_entry_index, source_type='TRIP'
            // â€” see tripFuelSync.ts) so re-submitting the same value never
            // compares a reading against itself.
            for (const entry of dieselEntries) {
              const meter = numOrNull(entry.meter);
              if (meter == null || meter <= 0) continue;
              await validateVehicleMeter(client, {
                vehicleId: vehicleIdForMeter,
                newMeter: meter,
                eventDate: tripBusinessDate,
                eventInstant: closingEventInstant,
                excludeTripId: tripId,
                context: `Diesel entry #${entry.rowIndex} meter reading`,
              });
            }
          }
        }
        // ---- end universal vehicle meter validation ----

        if (boxDetails.length || deliveries.length) {
          applyComputedFields(body, boxDetails, deliveries);
          // Keep trip_legs in sync with derived pickup/delivery totals.
          legBody.dcWeight = body.dcWeight;
          legBody.totalBirds = body.totalBirds;
          legBody.boxes = body.boxes;
          legBody.avgWeight = body.avgWeight;
          legBody.farmBirdCount = body.farmBirdCount ?? body.totalBirds;
          legBody.farmLoadWeight = body.farmLoadWeight ?? body.dcWeight;
        } else if (body.openingMeter != null && (body.closingMeter != null || body.endMeter != null)) {
          body.totalKm = computeTotalKm(
            body.openingMeter as number,
            body.closingMeter as number | null,
            body.endMeter as number | null
          );
        }

        if (dieselEntries.length) {
          body.fuel = sumDieselFuel(dieselEntries);
        }

        const expenseParts = computeTripExpense({
          fuel: body.fuel as number | undefined,
          pickupTolls: body.pickupTolls as number | undefined,
          deliveryTolls: body.deliveryTolls as number | undefined,
          destinationTolls: body.destinationTolls as number | undefined,
          meals: body.meals as number | undefined,
          mealsTiffin: body.mealsTiffin as number | undefined,
          driverBata: body.driverBata as number | undefined,
          helperBata: body.helperBata as number | undefined,
          loading: body.loading as number | undefined,
          vehicleMaintenance: body.vehicleMaintenance as number | undefined,
          othersRC: body.othersRC as number | undefined,
          others1Amt: body.others1Amt as number | undefined,
          others2Amt: body.others2Amt as number | undefined,
          others3Amt: body.others3Amt as number | undefined,
          others4Amt: body.others4Amt as number | undefined,
          others5Amt: body.others5Amt as number | undefined,
          expense: body.expense as number | undefined,
        });

        if (
          body.fuel != null ||
          body.driverBata != null ||
          body.meals != null ||
          body.expense != null
        ) {
          body.totalTripExpense = body.totalTripExpense ?? expenseParts.totalTripExpense;
        }

        await client.query(
          `UPDATE trips SET
            trip_date = COALESCE($2, trip_date),
            status = COALESCE($3, status),
            -- start_time is NEVER taken from the client: the official Step 1
            -- timestamp is captured server-side (DB NOW()) on first submission
            -- in the guarded block below, and is immutable on edit.
            start_time = COALESCE($4, start_time),
            vehicle_id = COALESCE($5, vehicle_id),
            vehicle_no = COALESCE($6, vehicle_no),
            driver_id = COALESCE($7, driver_id),
            driver_name = COALESCE($8, driver_name),
            supervisor_id = COALESCE($9, supervisor_id),
            supervisor_name = COALESCE($10, supervisor_name),
            -- A Step 1 submit always carries opening_meter / advance_amount
            -- (number or NULL when left empty). $67/$68 flag "explicitly
            -- provided" so an empty field actually CLEARS the column (writes
            -- NULL) instead of COALESCE silently keeping the old/default value.
            opening_meter = CASE WHEN $67::boolean THEN $11 ELSE opening_meter END,
            advance_amount = CASE WHEN $68::boolean THEN $12 ELSE advance_amount END,
            start_step_submitted = COALESCE($13, start_step_submitted),
            source_farm_id = COALESCE($14, source_farm_id),
            source_farm = COALESCE($15, source_farm),
            reached_time = COALESCE($16, reached_time),
            dest_meter = COALESCE($17, dest_meter),
            pickup_tolls = COALESCE($18, pickup_tolls),
            farm_address = COALESCE($19, farm_address),
            avg_bird_weight = COALESCE($20, avg_bird_weight),
            farm_remarks = COALESCE($21, farm_remarks),
            farm_step_submitted = COALESCE($22, farm_step_submitted),
            dc_weight = COALESCE($23, dc_weight),
            total_birds = COALESCE($24, total_birds),
            boxes = COALESCE($25, boxes),
            avg_weight = COALESCE($26, avg_weight),
            pickup_load_time = COALESCE($27, pickup_load_time),
            dc_photo_key = COALESCE($28, dc_photo_key),
            pickup_step_submitted = COALESCE($29, pickup_step_submitted),
            delivery_step_submitted = COALESCE($30, delivery_step_submitted),
            closing_meter = COALESCE($31, closing_meter),
            end_meter = COALESCE($32, end_meter),
            end_time = COALESCE($33, end_time),
            delivery_tolls = COALESCE($34, delivery_tolls),
            destination_tolls = COALESCE($35, destination_tolls),
            meals = COALESCE($36, meals),
            loading = COALESCE($37, loading),
            meals_tiffin = COALESCE($38, meals_tiffin),
            vehicle_maintenance = COALESCE($39, vehicle_maintenance),
            others_rc = COALESCE($40, others_rc),
            others1_amt = COALESCE($41, others1_amt),
            others2_amt = COALESCE($42, others2_amt),
            others3_amt = COALESCE($43, others3_amt),
            others4_amt = COALESCE($44, others4_amt),
            others5_amt = COALESCE($45, others5_amt),
            fuel = COALESCE($46, fuel),
            expense = COALESCE($47, expense),
            remarks = COALESCE($48, remarks),
            -- Guarded like expenses_step_submitted_at below: a plain COALESCE($49, ...)
            -- let two concurrent Step 5 submits race, since the "first submission" check
            -- happened in JS before either transaction committed, so whichever request's
            -- UPDATE landed last silently overwrote the other's timestamp.
            submitted_at = CASE
              WHEN COALESCE($51::boolean, FALSE) AND submitted_at IS NULL THEN COALESCE($49, NOW())
              ELSE submitted_at END,
            end_step_submitted = COALESCE($50, end_step_submitted),
            expenses_step_submitted = COALESCE($51, expenses_step_submitted),
            total_km = COALESCE($52, total_km),
            total_shops = COALESCE($53, total_shops),
            total_weight = COALESCE($54, total_weight),
            total_delivered_weight = COALESCE($55, total_delivered_weight),
            total_birds_delivered = COALESCE($56, total_birds_delivered),
            total_mortality = COALESCE($57, total_mortality),
            total_mortality_count = COALESCE($58, total_mortality_count),
            total_mortality_weight = COALESCE($59, total_mortality_weight),
            weight_loss = COALESCE($60, weight_loss),
            survival_rate = COALESCE($61, survival_rate),
            last_shop = COALESCE($62, last_shop),
            rate_completed = COALESCE($63, rate_completed),
            deleted = COALESCE($64, deleted),
            deleted_reason = COALESCE($65, deleted_reason),
            -- Step 2 (Farm Loading): GPS capture + completed-trips count.
            -- reached_time itself is NEVER taken from the client — the official
            -- Step 2 timestamp is captured server-side on first submission (see
            -- the guarded first-submission block below).
            farm_gps_lat = COALESCE($69, farm_gps_lat),
            farm_gps_lon = COALESCE($70, farm_gps_lon),
            farm_gps_accuracy = COALESCE($71, farm_gps_accuracy),
            farm_gps_time = COALESCE($72, farm_gps_time),
            farm_completed_trips = COALESCE($73, farm_completed_trips),
            approved_by = COALESCE($66, approved_by)
           WHERE id = $1`,
          [
            tripId,
            // trip_date is immutable after create (number embeds YYYYMMDD).
            null,
            body.status ?? null,
            // start_time is never trusted from the client — the official Step 1
            // timestamp is set server-side on first submission (guarded block).
            null,
            body.vehicleId ?? null,
            body.vehicleNo ?? null,
            body.driverId ?? null,
            body.driverName ?? null,
            body.supervisorId ?? null,
            body.supervisorName ?? null,
            body.openingMeter ?? null,
            body.advanceAmount ?? null,
            body.startStepSubmitted ?? null,
            body.sourceFarmId ?? null,
            body.sourceFarm ?? null,
            // reached_time is never trusted from the client — the official Step 2
            // timestamp is set server-side on first submission (guarded block).
            null,
            body.destMeter ?? null,
            body.pickupTolls ?? null,
            body.farmAddress ?? null,
            body.avgBirdWeight ?? null,
            body.farmRemarks ?? null,
            body.farmStepSubmitted ?? null,
            body.dcWeight ?? null,
            body.totalBirds ?? null,
            body.boxes ?? null,
            body.avgWeight ?? null,
            // pickup_load_time is never trusted from the client — the official
            // Step 3 timestamp is set server-side on first submission (guarded
            // block) and is immutable on edit.
            null,
            body.dcPhotoKey ?? null,
            body.pickupStepSubmitted ?? null,
            body.deliveryStepSubmitted ?? null,
            body.closingMeter ?? body.endMeter ?? null,
            body.endMeter ?? body.closingMeter ?? null,
            normalizeTripTimestamp(body.endTime),
            body.deliveryTolls ?? body.destinationTolls ?? null,
            body.destinationTolls ?? body.deliveryTolls ?? null,
            body.meals ?? null,
            body.loading ?? null,
            body.mealsTiffin ?? null,
            body.vehicleMaintenance ?? null,
            body.othersRC ?? null,
            body.others1Amt ?? null,
            body.others2Amt ?? null,
            body.others3Amt ?? null,
            body.others4Amt ?? null,
            body.others5Amt ?? null,
            body.fuel ?? null,
            body.expense ?? null,
            body.remarks ?? null,
            normalizeTripTimestamp(body.submittedAt),
            body.endStepSubmitted ?? null,
            body.expensesStepSubmitted ?? null,
            body.totalKm ?? null,
            body.totalShops ?? null,
            body.totalWeight ?? null,
            body.totalDeliveredWeight ?? null,
            body.totalBirdsDelivered ?? null,
            body.totalMortality ?? null,
            body.totalMortalityCount ?? null,
            body.totalMortalityWeight ?? null,
            body.weightLoss ?? null,
            body.survivalRate ?? null,
            body.lastShop ?? null,
            // rate_completed is never accepted from the client here â€” it is
            // exclusively written by rateEntryService.lock() (in sync with
            // rate_entry.locked), so a generic trip save can never
            // independently declare a trip "rate complete". Always passing
            // null preserves the existing DB value via the COALESCE below.
            null,
            body.deleted ?? null,
            body.deletedReason ?? null,
            body.approvedBy ?? null,
            // Explicitly-provided flags for the nullable meter/advance fields.
            body.openingMeter !== undefined,
            body.advanceAmount !== undefined,
            // Step 2 (Farm Loading) fields — GPS + completed-trips count.
            body.farmGpsLat ?? null,
            body.farmGpsLon ?? null,
            body.farmGpsAccuracy ?? null,
            normalizeTripTimestamp(body.farmGpsTime),
            numOrNull(body.farmCompletedTrips),
          ]
        );

        try {
          await client.query(
            `UPDATE trips SET
               farm_bird_type_id = COALESCE($2, farm_bird_type_id),
               farm_bird_type = COALESCE($3, farm_bird_type),
               farm_bird_count = COALESCE($4, farm_bird_count),
               farm_load_weight = COALESCE($5, farm_load_weight),
               farm_rate = COALESCE($6, farm_rate),
               farm_amount = COALESCE($7, farm_amount),
               driver_bata = COALESCE($8, driver_bata),
               helper_bata = COALESCE($9, helper_bata),
               total_trip_expense = COALESCE($10, total_trip_expense)
             WHERE id = $1`,
            [
              tripId,
              body.farmBirdTypeId ?? null,
              body.farmBirdType ?? null,
              body.farmBirdCount ?? null,
              body.farmLoadWeight ?? null,
              body.farmRate ?? null,
              body.farmAmount ?? null,
              body.driverBata ?? null,
              body.helperBata ?? null,
              body.totalTripExpense ?? null,
            ]
          );
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code !== "42703") throw err;
        }

        // First-submission timestamps (idempotent: first write wins, DB server time).
        // Guarded so code keeps working if the 011 migration hasn't been applied yet.
        try {
          await client.query(
            `UPDATE trips SET
               -- Official Step 1 timestamp: captured server-side (DB NOW()) ONLY
               -- on the first successful Submit Start Details (Save Progress strips
               -- the step flag, so this never fires for a partial save). Immutable
               -- on edit; the client clock is never the source of truth.
               start_time = CASE
                 WHEN COALESCE($2::boolean, FALSE) AND start_time IS NULL THEN NOW()
                 ELSE start_time END,
               start_step_submitted_at = CASE
                 WHEN COALESCE($2::boolean, FALSE) AND start_step_submitted_at IS NULL THEN NOW()
                 ELSE start_step_submitted_at END,
               farm_step_submitted_at = CASE
                 WHEN COALESCE($3::boolean, FALSE) AND farm_step_submitted_at IS NULL THEN NOW()
                 ELSE farm_step_submitted_at END,
               -- Official Step 2 timestamp: captured server-side ONLY on the first
               -- successful Submit Farm Details (Save Progress strips the step
               -- flag, so this never fires for a partial save). Immutable on edit.
               reached_time = CASE
                 WHEN COALESCE($3::boolean, FALSE) AND reached_time IS NULL THEN NOW()
                 ELSE reached_time END,
               pickup_step_submitted_at = CASE
                 WHEN COALESCE($4::boolean, FALSE) AND pickup_step_submitted_at IS NULL THEN NOW()
                 ELSE pickup_step_submitted_at END,
               -- Official Step 3 (Pickup) time: server NOW() only on the first
               -- successful Submit; immutable on edit; never captured by Save
               -- Progress (the step flag is stripped in save mode).
               pickup_load_time = CASE
                 WHEN COALESCE($4::boolean, FALSE) AND pickup_load_time IS NULL THEN NOW()
                 ELSE pickup_load_time END,
               deliveries_step_submitted_at = CASE
                 WHEN COALESCE($5::boolean, FALSE) AND deliveries_step_submitted_at IS NULL THEN NOW()
                 ELSE deliveries_step_submitted_at END,
               expenses_step_submitted_at = CASE
                 WHEN COALESCE($6::boolean, FALSE) AND expenses_step_submitted_at IS NULL THEN NOW()
                 ELSE expenses_step_submitted_at END
             WHERE id = $1`,
            [
              tripId,
              body.startStepSubmitted ?? null,
              body.farmStepSubmitted ?? null,
              body.pickupStepSubmitted ?? null,
              body.deliveryStepSubmitted ?? null,
              body.expensesStepSubmitted ?? null,
            ]
          );
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code !== "42703") throw err;
        }

        if (body.helpers || body.loaders) {
          await replaceCrew(
            client,
            tripId,
            (body.helpers as string[]) ?? [],
            (body.loaders as string[]) ?? []
          );
        }

        // Write load scalars (incl. pickup totals) before boxes/deliveries so
        // capacity checks read the correct farm_bird_count / dc_weight.
        await upsertLegFields(client, activeLeg.id, legBody, {
          farmStepSubmitted:
            typeof legBody.farmStepSubmitted === "boolean"
              ? (legBody.farmStepSubmitted as boolean)
              : undefined,
          pickupStepSubmitted:
            typeof legBody.pickupStepSubmitted === "boolean"
              ? (legBody.pickupStepSubmitted as boolean)
              : undefined,
          deliveryStepSubmitted:
            typeof legBody.deliveryStepSubmitted === "boolean"
              ? (legBody.deliveryStepSubmitted as boolean)
              : undefined,
        });

        if (body.boxDetails) {
          await replaceBoxes(client, tripId, body.boxDetails as BoxDetail[], activeLeg.id);
        }
        if (body.deliveries) {
          if (existing && existing.rowCount && Boolean(existing.rows[0].rate_completed)) {
            throw new AppError(
              409,
              "Cannot modify deliveries — trip rates are locked by Rate Entry",
              { tripId }
            );
          }
          await replaceDeliveries(
            client,
            tripId,
            body.deliveries as ShopDelivery[],
            activeLeg.id
          );
        }

        await syncTripStepFlagsFromLegs(client, tripId!);

        if (dieselEntries.length > 0) {
          await replaceDiesel(client, tripId, dieselEntries);
        } else if (body.dieselEntries === null || body.clearDiesel === true) {
          // Explicit clear only — never wipe diesel because Step 5 expense
          // payloads omit diesel (bills live on /diesel) and an empty
          // `dieselEntries: []` used to delete every row.
          await replaceDiesel(client, tripId, []);
        }

        // Step 3 photos — up to 2, stored in trip_media (base64). Persist the
        // submitted set, then remove any image row no longer referenced so a
        // removed photo never resurrects on reload.
        const persistPhoto = async (key: unknown, mime: unknown, data: unknown) => {
          if (data && key) {
            await client.query(
              `INSERT INTO trip_media (trip_id, leg_id, media_key, media_type, mime_type, data_base64)
               VALUES ($1,$2,$3,'image',$4,$5)
               ON CONFLICT (trip_id, media_key) DO UPDATE
                 SET leg_id = EXCLUDED.leg_id,
                     data_base64 = EXCLUDED.data_base64,
                     mime_type = EXCLUDED.mime_type`,
              [tripId, activeLeg.id, str(key), mime ? str(mime) : "image/jpeg", str(data)]
            );
          }
        };
        await persistPhoto(body.dcPhotoKey, body.dcPhotoMime, body.dcPhotoData);
        await persistPhoto(body.dcPhotoKey2, body.dcPhotoMime2, body.dcPhotoData2);
        if (body.dcPhotoKey || body.dcPhotoData || body.dcPhotoKey2 || body.dcPhotoData2) {
          await client.query(
            `DELETE FROM trip_media
              WHERE trip_id = $1 AND leg_id = $2 AND media_type = 'image'
                AND media_key NOT IN ($3, $4)`,
            [
              tripId,
              activeLeg.id,
              body.dcPhotoKey ? str(body.dcPhotoKey) : "__none__",
              body.dcPhotoKey2 ? str(body.dcPhotoKey2) : "__none__",
            ]
          );
        }

        const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
        const tripRow = row.rows[0];

        // Fuel sync always reads trip_diesel_entries (source of truth). Step 5
        // expense bodies intentionally omit diesel fields, so body-based sync
        // never created Fuel Expense rows for many completed trips.
        if (body.expensesStepSubmitted || body.syncFuel || body.endStepSubmitted) {
          await syncTripFuelFromDb(client, tripId, {
            approveIfCompleted: str(tripRow.status) === "Completed",
            createdBy: str(body.createdBy ?? "trip-step5-sync"),
          });
        } else if (dieselEntries.length > 0) {
          const tripDate = dateOnly(tripRow.trip_date) ?? "";
          await syncDieselToFuelExpenses(client, tripId, tripDate, dieselEntries, {
            vehicleId: numOrNull(tripRow.vehicle_id),
            vehicleNo: tripRow.vehicle_no ? str(tripRow.vehicle_no) : null,
            driverId: numOrNull(tripRow.driver_id),
            driverName: tripRow.driver_name ? str(tripRow.driver_name) : null,
            supervisorId: numOrNull(tripRow.supervisor_id),
            supervisorName: tripRow.supervisor_name ? str(tripRow.supervisor_name) : null,
            createdBy: str(body.createdBy ?? "trip-autosave"),
          });
        }

        const trip = await hydrateTrip(client, tripRow, {
          includeDcPhoto: true,
          viewLegIndex: resolveLegIndex(legBody),
        });
        const flags = {
          startStepSubmitted: trip.startStepSubmitted,
          farmStepSubmitted: trip.farmStepSubmitted,
          pickupStepSubmitted: trip.pickupStepSubmitted,
          deliveryStepSubmitted: trip.deliveryStepSubmitted,
          expensesStepSubmitted: trip.expensesStepSubmitted,
          status: trip.status,
          deleted: trip.deleted,
        };
        return {
          ...trip,
          ...flattenDiesel(trip.dieselEntries ?? []),
          resumeStep: getResumeStep(flags),
          resumeStepLabel: getResumeLabel(flags),
          wizardProgress: getWizardProgress(flags),
          stepStatuses: computeStepStatuses(trip, {
            boxCount: trip.boxDetails.length,
            deliveryCount: trip.deliveries.length,
            dieselCount: (trip.dieselEntries ?? []).length,
          }),
          activeLegIndex: resolveLegIndex(legBody),
        };
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /**
   * Step 4 per-shop persistence (PUT /trips/:id/deliveries).
   *
   * Save Progress / single-shop save ONLY — never submits Step 4, never
   * captures the official Step 4 timestamp, and never runs final-submit
   * validation. Final submit still goes through submitStep → replaceDeliveries
   * (full-replace + strict completeness + server NOW() timestamp).
   *
   * Upserts the submitted deliveries idempotently:
   *  - a row matching (trip_id, client_key) is UPDATED — a double-click,
   *    network timeout, browser retry or repeated Save never creates a
   *    duplicate (the partial unique index is the DB-level backstop);
   *  - a row without a client_key is matched by its server id when present;
   *  - anything else is INSERTed.
   *
   * Rows NOT present in the payload are left untouched — saving one shop
   * never wipes shops already saved (per-shop persistence requirement).
   *
   * Runs inside one transaction with the trip row locked FOR UPDATE so
   * concurrent saves for the same trip serialize, and every capacity /
   * box-availability / active-shop check is re-run against the LIVE
   * persisted rows — never trusted from the client.
   */
  async saveDeliveries(tripId: number, body: { deliveries?: ShopDelivery[]; legIndex?: number } = {}) {
    const { deliveries } = parseDeliverySave(body);
    const legIndex = resolveLegIndex(body as Record<string, unknown>);

    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
      if (!existing.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
      const tripRow = existing.rows[0];
      if (Boolean(tripRow.deleted)) {
        throw new AppError(422, "Cannot modify a deleted trip", { tripId });
      }
      if (Boolean(tripRow.rate_completed)) {
        throw new AppError(409, "Cannot modify deliveries — trip rates are locked by Rate Entry", { tripId });
      }

      // Serialize concurrent saves for this trip (read-modify-write below).
      await client.query(`SELECT id FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
      await ensureTripLeg1(client, tripId);
      const activeLeg = await requireTripLeg(client, tripId, legIndex);

      // Step 3 capacity from this load (farm_load_weight ?? dc_weight, farm_bird_count ?? total_birds).
      const capacityBirds =
        num(activeLeg.farmBirdCount) > 0 ? num(activeLeg.farmBirdCount) : num(activeLeg.totalBirds);
      const capacityWeight =
        num(activeLeg.farmLoadWeight) > 0 ? num(activeLeg.farmLoadWeight) : num(activeLeg.dcWeight);
      if (capacityBirds <= 0 && capacityWeight <= 0) {
        throw new AppError(422, "Step 3 (Pickup) must be completed before saving shop deliveries.");
      }

      // Live pickup boxes for this load only.
      const boxRes = await client.query(
        `SELECT box_no, birds, weight FROM trip_boxes WHERE trip_id = $1 AND leg_id = $2 ORDER BY box_no`,
        [tripId, activeLeg.id]
      );
      const boxesByNo = new Map<number, { birds: number; weight: number }>();
      for (const r of boxRes.rows) {
        boxesByNo.set(num(r.box_no), { birds: num(r.birds), weight: num(r.weight) });
      }

      // Live deliveries for this load.
      const delRes = await client.query(
        `SELECT id, client_key, shop_id, serial_no, box_no, birds, weight,
                mortality, mort_kg, remarks, auto_capture_time
           FROM trip_deliveries WHERE trip_id = $1 AND leg_id = $2`,
        [tripId, activeLeg.id]
      );
      const existingRows = delRes.rows.map((r) => ({
        id: num(r.id),
        clientKey: r.client_key == null ? null : str(r.client_key),
        shopId: numOrNull(r.shop_id),
        serialNo: numOrNull(r.serial_no),
        boxNo: num(r.box_no),
        birds: num(r.birds),
        weight: num(r.weight),
        mortality: num(r.mortality),
        mortKg: num(r.mort_kg),
        remarks: str(r.remarks),
        autoCaptureTime: r.auto_capture_time == null ? null : str(r.auto_capture_time),
      }));

      const findBy = (d: ShopDelivery) => {
        const key = d.clientKey ? str(d.clientKey) : null;
        if (key) {
          const byKey = existingRows.find((r) => r.clientKey === key);
          if (byKey) return byKey;
        }
        if (d.id != null) {
          const byId = existingRows.find((r) => r.id === Number(d.id));
          if (byId) return byId;
        }
        return null;
      };

      // Dedupe the payload by stable identity — the resolved existing row id
      // first (two rows that both map to the same DB row must collapse), then
      // clientKey, then server id, then position. Keeps the last occurrence so
      // a retry that repeats a row must not double-count birds/weight.
      const deduped: ShopDelivery[] = [];
      const seenKeys = new Set<string>();
      for (let i = deliveries.length - 1; i >= 0; i--) {
        const d = deliveries[i] as unknown as ShopDelivery;
        const match = findBy(d);
        const key = match
          ? `m:${match.id}`
          : d.clientKey
            ? `k:${str(d.clientKey)}`
            : d.id != null
              ? `i:${Number(d.id)}`
              : `x:${i}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        deduped.unshift(d);
      }

      const excludedIds = new Set<number>();
      for (const d of deduped) {
        const match = findBy(d);
        if (match) excludedIds.add(match.id);
      }

      // Orders delivery captures are append-only partials beside one
      // uncaptured assignment-plan row. Rebuild the prospective persisted
      // state while the trip row is locked and reject any direct/stale/
      // concurrent request whose captures exceed that plan. This is backend
      // business truth; the browser's pending-box maximum is only UX.
      const prospectiveOrderRows = [
        ...existingRows
          .filter((row) => !excludedIds.has(row.id))
          .map((row) => ({
            shopId: row.shopId,
            boxNo: row.boxNo,
            remarks: row.remarks,
            captured: Boolean(row.autoCaptureTime),
          })),
        ...deduped.map((row) => ({
          shopId: row.shopId == null ? null : Number(row.shopId),
          boxNo: Number(row.boxNo ?? 0),
          remarks: String(row.remarks ?? ""),
          captured: Boolean(
            row.autoCaptureTime ||
              (row as { deliveredAt?: string }).deliveredAt ||
              (row as { deliveryTime?: string }).deliveryTime
          ),
        })),
      ].filter((row) => row.remarks.startsWith("[ORDER]") && row.shopId != null);

      const orderBalances = new Map<string, { planned: number; captured: number }>();
      for (const row of prospectiveOrderRows) {
        const orderRef = row.remarks.match(/\bO:([^|\s]+)/)?.[1] ?? "unknown";
        const key = `${orderRef}:${row.shopId}`;
        const balance = orderBalances.get(key) ?? { planned: 0, captured: 0 };
        if (row.captured) balance.captured += row.boxNo;
        else balance.planned += row.boxNo;
        orderBalances.set(key, balance);
      }
      for (const [key, balance] of orderBalances) {
        if (balance.captured > balance.planned) {
          throw new AppError(
            422,
            `Delivered boxes exceed the assigned quantity for order/shop ${key} (${balance.captured} > ${balance.planned}).`
          );
        }
      }

      // Boxes already committed to deliveries NOT being overwritten (this load only).
      const excluded = [...excludedIds];
      const exclClause = excluded.length ? `AND d.id <> ALL($3::int[])` : "";
      const boxParams: unknown[] = [tripId, activeLeg.id];
      if (excluded.length) boxParams.push(excluded);
      const otherBoxes = await client.query(
        `SELECT db.box_no
           FROM trip_delivery_boxes db
           JOIN trip_deliveries d ON d.id = db.delivery_id
          WHERE d.trip_id = $1 AND d.leg_id = $2 AND d.deleted = FALSE ${exclClause}`,
        boxParams
      );
      const usedBoxes = new Set<number>();
      for (const r of otherBoxes.rows) usedBoxes.add(num(r.box_no));

      // Cross-shop totals from live persisted rows on THIS load, minus rows we replace.
      let totalBirds = 0;
      let totalWeight = 0;
      for (const r of existingRows) {
        totalBirds += r.birds + r.mortality;
        totalWeight += r.weight + r.mortKg;
      }
      // Assignment-plan rows carry proportional birds/weight for reporting,
      // but are not physical deliveries. sumActiveDeliveries sees every live
      // row, so remove uncaptured Orders plans before applying real-capture
      // capacity checks below.
      // (existingRows is already scoped to this load's leg_id.)
      for (const r of existingRows) {
        const isUncapturedOrderPlan =
          r.remarks.startsWith("[ORDER]") && !r.autoCaptureTime;
        if (!isUncapturedOrderPlan) continue;
        totalBirds -= r.birds + r.mortality;
        totalWeight -= r.weight + r.mortKg;
      }
      for (const id of excludedIds) {
        const r = existingRows.find((x) => x.id === id);
        if (!r) continue;
        if (r.remarks.startsWith("[ORDER]") && !r.autoCaptureTime) continue;
        totalBirds -= r.birds + r.mortality;
        totalWeight -= r.weight + r.mortKg;
      }

      const tripNo = tripRow.trip_no ? str(tripRow.trip_no) : `TR-${tripId}`;
      let maxSerial = 0;
      for (const r of existingRows) {
        if (r.serialNo != null && r.serialNo > maxSerial) maxSerial = r.serialNo;
      }

      for (const d of deduped) {
        const match = findBy(d);
        const mode = d.deliveryMode === "weight" ? "weight" : "box";
        const birds = Number(d.birds ?? 0);
        const weight = Number(Number(d.weight ?? 0).toFixed(2));
        const mortality = Number(d.mortality ?? 0);
        const mortKg = Number(Number(d.mortKg ?? 0).toFixed(2));
        const shopId = d.shopId != null ? Number(d.shopId) : null;
        const selectedBoxIds = Array.isArray(d.selectedBoxIds)
          ? [...new Set((d.selectedBoxIds as number[]).map(Number))]
          : [];
        const perBoxData = Array.isArray(d.perBoxData) ? (d.perBoxData as BoxDetail[]) : [];
        const remarks = String(d.remarks ?? "").trim();
        const isUncapturedOrderPlan =
          remarks.startsWith("[ORDER]") &&
          !(
            d.autoCaptureTime ||
            (d as { deliveredAt?: string }).deliveredAt ||
            (d as { deliveryTime?: string }).deliveryTime
          );

        // Basic type/safety (Save Progress): non-negative whole birds,
        // non-negative weight. Never accept impossible negative values.
        if (!Number.isInteger(birds) || birds < 0) {
          throw new AppError(422, `Shop delivery birds must be a non-negative whole number (got ${d.birds}).`);
        }
        if (!Number.isFinite(weight) || weight < 0) {
          throw new AppError(422, `Shop delivery weight must be a non-negative number (got ${d.weight}).`);
        }
        if (!Number.isInteger(mortality) || mortality < 0) {
          throw new AppError(422, `Mortality birds must be a non-negative whole number (got ${d.mortality}).`);
        }
        if (!Number.isFinite(mortKg) || mortKg < 0) {
          throw new AppError(422, `Mortality weight must be a non-negative number (got ${d.mortKg}).`);
        }
        if (shopId == null) {
          throw new AppError(422, "Shop is required for a delivery.");
        }

        // Active-shop rule: a new selection must be Active. Editing an existing
        // row that keeps the SAME shop stays allowed even if the shop later
        // became Inactive (historical data must remain viewable). Changing the
        // shop is a new selection and requires an Active shop.
        const shopRes = await client.query(`SELECT status FROM shops WHERE id = $1`, [shopId]);
        if (!shopRes.rowCount) {
          throw new AppError(422, `Shop ${shopId} does not exist.`);
        }
        const shopStatus = str(shopRes.rows[0].status);
        const shopChanged = match ? match.shopId !== shopId : true;
        if (shopChanged && shopStatus !== "Active") {
          throw new AppError(422, "Shop is no longer available for new selection.");
        }

        // Pending `[ORDER]` plan stubs are reference-only (may carry assigned
        // boxes + planned birds/weight from Order Assignment). Skip
        // delivery-vs-box capacity checks until Step 4 actually captures.
        const enforceBoxCapacity = !isUncapturedOrderPlan;

        // Box availability: every selected box must be a Step 3 pickup box and
        // must not already be assigned to another (not-being-overwritten) shop.
        for (const boxNo of selectedBoxIds) {
          if (!boxesByNo.has(boxNo)) {
            throw new AppError(422, `Selected box #${boxNo} is not part of this trip's Step 3 pickup.`);
          }
          if (usedBoxes.has(boxNo)) {
            throw new AppError(422, `Selected box #${boxNo} is already used by another shop delivery.`);
          }
        }
        // Box allocation is exclusive per shop — commit to the used set.
        for (const boxNo of selectedBoxIds) usedBoxes.add(boxNo);

        const farmBirds = selectedBoxIds.reduce((s, n) => s + (boxesByNo.get(n)?.birds ?? 0), 0);
        const farmWeight = selectedBoxIds.reduce((s, n) => s + (boxesByNo.get(n)?.weight ?? 0), 0);

        // Shop-level bounds: delivery + mortality can never exceed what the
        // selected pickup boxes represent (a box may hold MORE weight than the
        // delivery — that is allowed; the reverse is not).
        // Allow 0.05 kg tolerance for 2-decimal rounding of weight + mortKg.
        const WEIGHT_TOLERANCE_KG = 0.05;
        if (enforceBoxCapacity && farmBirds > 0 && birds + mortality > farmBirds) {
          throw new AppError(422, `Delivered birds plus mortality cannot exceed available birds (${farmBirds}).`);
        }
        if (enforceBoxCapacity && farmWeight > 0 && weight + mortKg > farmWeight + WEIGHT_TOLERANCE_KG) {
          throw new AppError(
            422,
            `Delivery weight cannot exceed the selected box available weight (${farmWeight.toFixed(2)} kg).`
          );
        }

        // Weight-mode per-box breakdown must stay within each box's capacity.
        if (enforceBoxCapacity && mode === "weight") {
          for (const pb of perBoxData) {
            const box = boxesByNo.get(Number(pb.boxNo));
            if (!box) {
              throw new AppError(422, `Per-box entry #${pb.boxNo} is not part of this trip's Step 3 pickup.`);
            }
            if (Number(pb.birds) > box.birds) {
              throw new AppError(422, `Box #${pb.boxNo} delivered birds exceed its available birds (${box.birds}).`);
            }
            if (Number(pb.weight) > box.weight) {
              throw new AppError(
                422,
                `Box #${pb.boxNo} delivered weight exceeds its available weight (${box.weight.toFixed(2)} kg).`
              );
            }
          }
        }

        // Cross-shop totals — only real captures count against pickup capacity.
        if (enforceBoxCapacity) {
          totalBirds += birds + mortality;
          totalWeight = Number((totalWeight + weight + mortKg).toFixed(2));
          assertWithinCapacity({ label: "birds", available: capacityBirds, alreadyAllocated: 0, requested: totalBirds });
          assertWithinCapacity({ label: "weight", available: capacityWeight, alreadyAllocated: 0, requested: totalWeight });
        }
        // Ignore client-calculated totals; this prevents tampering and keeps
        // retries/edits consistent with the persisted weight and rate.
        const amount = computeDeliveryAmount(weight, d.rate);
        const autoCaptureTime = normalizeTripTimestamp(d.autoCaptureTime);

        let deliveryId: number;
        if (match) {
          deliveryId = match.id;
          await client.query(
            `UPDATE trip_deliveries SET
               serial_no = $2,
               box_no = $3,
               shop_id = $4,
               shop_name = $5,
               bird_type_id = $6,
               bird_type = $7,
               birds = $8,
               weight = $9,
               mortality = $10,
               mort_kg = $11,
               rate = $12,
               amount = $13,
               remarks = $14,
               delivery_mode = $15,
               farm_birds = $16,
               farm_weight = $17,
               auto_capture_time = $18,
               client_key = $19,
               sub_shop_name = $20
             WHERE id = $1`,
            [
              deliveryId,
              d.serialNo ?? match.serialNo,
              selectedBoxIds.length,
              shopId,
              d.shopName ?? "",
              d.birdTypeId != null ? Number(d.birdTypeId) : null,
              d.birdType ?? "",
              birds,
              weight,
              mortality,
              mortKg,
              d.rate != null ? Number(d.rate) : null,
              amount,
              d.remarks ?? "",
              mode,
              farmBirds,
              farmWeight,
              autoCaptureTime,
              d.clientKey ? str(d.clientKey) : null,
              d.subShopName ?? "",
            ]
          );
        } else {
          const saleNo = await generateSaleNo(client, tripId, tripNo);
          maxSerial += 1;
          const inserted = await client.query(
            `INSERT INTO trip_deliveries (
               trip_id, leg_id, sale_no, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
               birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
               farm_birds, farm_weight, auto_capture_time, client_key, sub_shop_name
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING id`,
            [
              tripId,
              activeLeg.id,
              saleNo,
              d.serialNo ?? maxSerial,
              selectedBoxIds.length,
              shopId,
              d.shopName ?? "",
              d.birdTypeId != null ? Number(d.birdTypeId) : null,
              d.birdType ?? "",
              birds,
              weight,
              mortality,
              mortKg,
              d.rate != null ? Number(d.rate) : null,
              amount,
              d.remarks ?? "",
              mode,
              farmBirds,
              farmWeight,
              autoCaptureTime,
              d.clientKey ? str(d.clientKey) : null,
              d.subShopName ?? "",
            ]
          );
          deliveryId = num(inserted.rows[0].id);
        }

        // Replace the delivery's child rows (selected boxes + per-box breakdown).
        await client.query(`DELETE FROM trip_delivery_boxes WHERE delivery_id = $1`, [deliveryId]);
        for (const boxNo of selectedBoxIds) {
          await client.query(
            `INSERT INTO trip_delivery_boxes (delivery_id, box_no) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [deliveryId, boxNo]
          );
        }
        await client.query(`DELETE FROM trip_delivery_per_box WHERE delivery_id = $1`, [deliveryId]);
        for (const pb of perBoxData) {
          await client.query(
            `INSERT INTO trip_delivery_per_box (delivery_id, box_no, birds, weight) VALUES ($1,$2,$3,$4)`,
            [deliveryId, Number(pb.boxNo), Number(pb.birds ?? 0), Number(pb.weight ?? 0)]
          );
        }
      }

      // Recompute delivery-side KPIs from the live rows (source of truth).
      await recalcTripDeliveryTotals(client, tripId);

      const finalRow = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
      const trip = await hydrateTrip(client, finalRow.rows[0], { includeDcPhoto: true });
      const flags = {
        startStepSubmitted: trip.startStepSubmitted,
        farmStepSubmitted: trip.farmStepSubmitted,
        pickupStepSubmitted: trip.pickupStepSubmitted,
        deliveryStepSubmitted: trip.deliveryStepSubmitted,
        expensesStepSubmitted: trip.expensesStepSubmitted,
        endStepSubmitted: trip.endStepSubmitted,
        status: trip.status,
        deleted: trip.deleted,
      };
      return {
        ...trip,
        ...flattenDiesel(trip.dieselEntries ?? []),
        resumeStep: getResumeStep(flags),
        resumeStepLabel: getResumeLabel(flags),
        wizardProgress: getWizardProgress(flags),
        stepStatuses: computeStepStatuses(trip, {
          boxCount: trip.boxDetails.length,
          deliveryCount: trip.deliveries.length,
          dieselCount: (trip.dieselEntries ?? []).length,
        }),
      };
    });
  },

  async submitStep(
    id: number,
    step: TripWizardStep,
    body: Partial<Trip> & Record<string, unknown>
  ) {
    const isSaveMode = body.mode === "save";
    const legIndex = resolveLegIndex(body);

    if (!isSaveMode) {
      validateStepSubmit(step, body);
    }

    const existing = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (!existing.rowCount) throw new AppError(404, `Trip ${id} not found`);
    const current = existing.rows[0];

    // Ensure Load 1 exists for legacy trips created before multi-load.
    await withTransaction(async (client) => {
      await ensureTripLeg1(client, id);
    });

    const legsRes = await query(
      `SELECT * FROM trip_legs WHERE trip_id = $1 ORDER BY leg_index`,
      [id]
    );
    const legRows = legsRes.rows.map((r) => ({
      farmStepSubmitted: Boolean(r.farm_step_submitted),
      pickupStepSubmitted: Boolean(r.pickup_step_submitted),
      deliveryStepSubmitted: Boolean(r.delivery_step_submitted),
      destMeter: numOrNull(r.dest_meter),
      legIndex: num(r.leg_index),
    }));
    const activeLegRow = legRows.find((l) => l.legIndex === legIndex);
    if (!activeLegRow && ["farm", "pickup", "deliveries"].includes(step)) {
      throw new AppError(404, `Load ${legIndex} not found on trip ${id}`);
    }

    const flags = {
      startStepSubmitted: Boolean(current.start_step_submitted),
      // Trip-level flags for Step 5 / resume across all loads.
      farmStepSubmitted: Boolean(current.farm_step_submitted),
      pickupStepSubmitted: Boolean(current.pickup_step_submitted),
      deliveryStepSubmitted: Boolean(current.delivery_step_submitted),
      expensesStepSubmitted: Boolean(current.expenses_step_submitted),
      endStepSubmitted: Boolean(current.end_step_submitted),
      status: str(current.status),
      deleted: Boolean(current.deleted),
    };

    // "Save Progress" is a permissive autosave: it must never run strict step
    // validation, enforce step order, or lock/submit a step.
    if (isSaveMode) {
      const autosaveBody: Partial<Trip> & Record<string, unknown> = { ...body, legIndex };
      delete autosaveBody.mode;
      delete autosaveBody.startStepSubmitted;
      delete autosaveBody.farmStepSubmitted;
      delete autosaveBody.pickupStepSubmitted;
      delete autosaveBody.deliveryStepSubmitted;
      delete autosaveBody.expensesStepSubmitted;
      delete autosaveBody.endStepSubmitted;
      return this.save(id, autosaveBody);
    }

    // Per-load step order for Farm / Pickup / Deliveries; trip-level for start/expenses.
    if (step === "farm" || step === "pickup" || step === "deliveries") {
      if (!flags.startStepSubmitted) {
        throw new AppError(422, "Complete Step 1 — Trip Header before Farm Loading", {
          resumeStep: "start",
          requestedStep: step,
        });
      }
      const legFlags = {
        startStepSubmitted: true,
        farmStepSubmitted: Boolean(activeLegRow?.farmStepSubmitted),
        pickupStepSubmitted: Boolean(activeLegRow?.pickupStepSubmitted),
        deliveryStepSubmitted: Boolean(activeLegRow?.deliveryStepSubmitted),
        expensesStepSubmitted: flags.expensesStepSubmitted,
        endStepSubmitted: flags.endStepSubmitted,
        status: flags.status,
        deleted: flags.deleted,
      };
      assertStepOrder(step, legFlags);
    } else if (step === "expenses") {
      // Every load must finish deliveries before final expenses submit.
      const incomplete = legRows.find((l) => !l.deliveryStepSubmitted);
      if (incomplete) {
        throw new AppError(
          422,
          `Complete deliveries for Load ${incomplete.legIndex} before Step 5 — Diesel & Expenses`,
          { resumeStep: "deliveries", requestedStep: step, legIndex: incomplete.legIndex }
        );
      }
      assertStepOrder(step, {
        ...flags,
        farmStepSubmitted: true,
        pickupStepSubmitted: true,
        deliveryStepSubmitted: true,
      });
    } else {
      assertStepOrder(step, flags);
    }

    // Backend-authoritative Step 2 (Farm) validation — never trust the frontend.
    // Farm Meter must be present and STRICTLY greater than the prior floor
    // (opening meter for Load 1; prior farm dest / diesel for later loads).
    if (step === "farm") {
      // Normalize negative tolls to 0 (tolls may legitimately be zero).
      const tolls = numOrNull(body.pickupTolls);
      if (tolls != null && tolls < 0) {
        body.pickupTolls = 0;
      }
      // Farm address is optional (masters may not have one yet).
      if (body.farmAddress != null) {
        body.farmAddress = str(body.farmAddress).trim();
      }
      const farmMeter = numOrNull(body.destMeter);
      if (farmMeter == null || farmMeter <= 0) {
        throw new AppError(422, "Farm meter is required for Step 2 submission.");
      }
      const floorInfo = await withTransaction(async (client) =>
        farmMeterFloor(client, id, legIndex, numOrNull(current.opening_meter))
      );
      if (floorInfo.floor > 0 && farmMeter <= floorInfo.floor) {
        throw new AppError(
          422,
          `Farm meter (${farmMeter} KM) must be strictly greater than the ${floorInfo.label} (${floorInfo.floor} KM).`
        );
      }
      const nextReading = await withTransaction(async (client) => {
        const result = await client.query<{ meter: string | null }>(
          `WITH active AS (
             SELECT farm_step_submitted_at
               FROM trip_legs WHERE trip_id = $1 AND leg_index = $2
           ), later_readings AS (
             SELECT dest_meter AS meter
               FROM trip_legs
              WHERE trip_id = $1 AND leg_index > $2 AND dest_meter IS NOT NULL
             UNION ALL
             SELECT d.meter
               FROM trip_diesel_entries d, active a
              WHERE d.trip_id = $1 AND d.meter IS NOT NULL
                AND a.farm_step_submitted_at IS NOT NULL
                AND d.submitted_at > a.farm_step_submitted_at
             UNION ALL
             SELECT closing_meter FROM trips
              WHERE id = $1 AND closing_meter IS NOT NULL
           ) SELECT MIN(meter) AS meter FROM later_readings`,
          [id, legIndex]
        );
        return num(result.rows[0]?.meter);
      });
      if (nextReading > 0 && farmMeter >= nextReading) {
        throw new AppError(
          422,
          `Farm meter (${farmMeter} KM) must be less than the next entered meter (${nextReading} KM).`
        );
      }
    }

    // Backend-authoritative Step 3 (Pickup) validation — never trust the frontend.
    // Vehicle Master box capacity + box-number integrity are enforced here on
    // submit; Save Progress (mode save) intentionally bypasses this.
    if (step === "pickup") {
      const boxDetails = (body.boxDetails as BoxDetail[] | undefined) ?? [];
      const boxNos = boxDetails.map((b) => Number(b.boxNo));
      for (const n of boxNos) {
        if (!Number.isInteger(n) || n <= 0) {
          throw new AppError(422, `Invalid box number: ${n}. Box numbers must be positive whole numbers.`);
        }
      }
      for (let i = 0; i < boxNos.length; i++) {
        if (boxNos[i] !== i + 1) {
          const msg =
            i > 0 && boxNos[i] === boxNos[i - 1]
              ? `Duplicate box number: ${boxNos[i]}.`
              : "Box numbers must be sequential (1, 2, 3…).";
          throw new AppError(422, msg);
        }
      }
      for (const b of boxDetails) {
        const birds = Number(b.birds ?? 0);
        const weight = Number(b.weight ?? 0);
        if (!Number.isInteger(birds) || birds < 0) {
          throw new AppError(422, `Box ${b.boxNo} bird count must be a valid non-negative whole number.`);
        }
        if (!Number.isFinite(weight) || weight < 0) {
          throw new AppError(422, `Box ${b.boxNo} weight must be a valid non-negative number.`);
        }
      }
      // Derived totals must be meaningful (existing Step 3 mandatory rule).
      const totalBirds = boxDetails.reduce((s, b) => s + Number(b.birds ?? 0), 0);
      const totalWeight = boxDetails.reduce((s, b) => s + Number(b.weight ?? 0), 0);
      if (totalBirds <= 0 || totalWeight <= 0) {
        throw new AppError(422, "At least one box with birds and weight is required to submit Pickup.");
      }
      if (current.vehicle_id != null) {
        const veh = await query(`SELECT no_of_boxes FROM vehicles WHERE id = $1`, [
          current.vehicle_id,
        ]);
        if (veh.rowCount) {
          const capacity = num(veh.rows[0].no_of_boxes);
          if (capacity > 0 && boxDetails.length > capacity) {
            throw new AppError(
              422,
              `Vehicle box capacity exceeded. Maximum boxes for this vehicle: ${capacity}.`
            );
          }
        }
      }
    }

    if (step === "expenses") {
      const closing =
        numOrNull(body.closingMeter) ?? numOrNull(body.endMeter) ?? numOrNull(current.closing_meter);
      if (closing != null) {
        const maxDest = Math.max(0, ...legRows.map((l) => l.destMeter ?? 0));
        const dieselMax = await withTransaction(async (client) => maxDieselMeter(client, id));
        const opening = numOrNull(current.opening_meter) ?? 0;
        const floor = Math.max(opening, maxDest, dieselMax);
        if (floor > 0 && closing < floor) {
          throw new AppError(
            422,
            `End meter (${closing} KM) must be greater than or equal to the last entered meter (${floor} KM).`
          );
        }
      }
    }

    const stepFlags: Record<string, Partial<Trip> & Record<string, unknown>> = {
      start: { startStepSubmitted: true, status: (body.status as TripStatus) ?? "Draft" },
      farm: { farmStepSubmitted: true, legIndex },
      pickup: { pickupStepSubmitted: true, legIndex },
      deliveries: { deliveryStepSubmitted: true, legIndex },
      expenses: {
        expensesStepSubmitted: true,
        endStepSubmitted: true,
        status: "Pending" as TripStatus,
        // submitted_at is a first-submission marker: never overwrite it.
        submittedAt: current.expenses_step_submitted
          ? undefined
          : (body.submittedAt ?? new Date().toISOString()),
        syncFuel: true,
      },
    };

    return this.save(id, { ...body, legIndex, ...stepFlags[step] });
  },

  /** Add Load 2–4 on the same Draft trip (max 4). */
  async addLeg(id: number) {
    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [id]);
      if (!existing.rowCount) throw new AppError(404, `Trip ${id} not found`);
      await ensureTripLeg1(client, id);
      const leg = await addTripLeg(client, id);
      const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [id]);
      const trip = await hydrateTrip(client, row.rows[0], {
        includeDcPhoto: true,
        viewLegIndex: leg.legIndex,
      });
      return {
        ...trip,
        ...flattenDiesel(trip.dieselEntries ?? []),
        activeLegIndex: leg.legIndex,
      };
    });
  },

  /** Remove only the last, completely unsubmitted load opened by mistake. */
  async removeEmptyLeg(id: number, legIndex: number) {
    return withTransaction(async (client) => {
      const tripRes = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE`, [id]);
      if (!tripRes.rowCount) throw new AppError(404, `Trip ${id} not found`);
      if (str(tripRes.rows[0].status) !== "Draft") {
        throw new AppError(422, "Loads can only be closed while the trip is Draft");
      }
      const legs = await listTripLegs(client, id);
      const last = legs[legs.length - 1];
      if (!last || legIndex <= 1 || last.legIndex !== legIndex) {
        throw new AppError(422, "Only the latest additional load can be closed");
      }
      if (last.farmStepSubmitted || last.pickupStepSubmitted || last.deliveryStepSubmitted) {
        throw new AppError(422, `Load ${legIndex} already has submitted steps and cannot be closed`);
      }
      const childRows = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM trip_boxes WHERE trip_id = $1 AND leg_id = $2) AS has_boxes,
           EXISTS (SELECT 1 FROM trip_deliveries WHERE trip_id = $1 AND leg_id = $2) AS has_deliveries`,
        [id, last.id]
      );
      if (childRows.rows[0]?.has_boxes || childRows.rows[0]?.has_deliveries) {
        throw new AppError(422, `Load ${legIndex} has saved data and cannot be closed`);
      }
      await client.query(`DELETE FROM trip_legs WHERE id = $1`, [last.id]);
      const previous = legs[legs.length - 2];
      await client.query(
        `UPDATE trips SET leg_count = $2,
           farm_step_submitted = $3,
           pickup_step_submitted = $4,
           delivery_step_submitted = $5,
           updated_at = NOW()
         WHERE id = $1`,
        [id, previous.legIndex, previous.farmStepSubmitted, previous.pickupStepSubmitted, previous.deliveryStepSubmitted]
      );
      const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [id]);
      const trip = await hydrateTrip(client, row.rows[0], { includeDcPhoto: true, viewLegIndex: previous.legIndex });
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []), activeLegIndex: previous.legIndex };
    });
  },

  async softDelete(id: number, reason?: string) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE trips SET deleted = TRUE, deleted_reason = $2, status = 'Deleted'
         WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
         RETURNING id`,
        [id, reason ?? null]
      );
      if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);
      await client.query(`UPDATE fuel_expenses SET deleted = TRUE WHERE trip_id = $1 AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE`, [id]);
      return { id, deleted: true };
    });
  },

  async updateStatus(
    id: number,
    body: {
      status: string;
      approvedBy?: string;
      rejectedBy?: string;
      rejectedReason?: string;
      reason?: string;
    }
  ) {
    assertTripStatus(body.status);
    const status = body.status;

    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [id]);
      if (!existing.rowCount) throw new AppError(404, `Trip ${id} not found`);

      const currentStatus = str(existing.rows[0].status);
      const currentDeleted = Boolean(existing.rows[0].deleted);
      assertTripStatusTransition(currentStatus, status);

      // A deleted trip is deleted forever. Guard against the legacy generic
      // branch (which resets `deleted = FALSE`) ever resurrecting a row that
      // is already flagged as deleted but whose `status` was left inconsistent.
      if (currentDeleted && status !== "Deleted") {
        throw new AppError(422, "Cannot restore a deleted trip", { tripId: id });
      }

      if (status === "Completed") {
        assertTripReadyForCompletion({
          startStepSubmitted: Boolean(existing.rows[0].start_step_submitted),
          farmStepSubmitted: Boolean(existing.rows[0].farm_step_submitted),
          pickupStepSubmitted: Boolean(existing.rows[0].pickup_step_submitted),
          deliveryStepSubmitted: Boolean(existing.rows[0].delivery_step_submitted),
          expensesStepSubmitted: Boolean(existing.rows[0].expenses_step_submitted),
        });
      }

      let result;
      try {
        if (status === "Completed") {
          // Serialize against concurrent same-vehicle approvals/updates: the
          // fuel sync below WRITES meter events, so completion must queue
          // behind (and observe) any in-flight approval for this vehicle.
          const completionVehicleId = numOrNull(existing.rows[0].vehicle_id);
          if (completionVehicleId != null) {
            await lockVehicleForMeterWrite(client, completionVehicleId);
          }
          // Prerequisite approvals (manual fuel + maintenance) gate completion.
          await assertTripCompletionGates(client, id, completionVehicleId);
          // Close the submit-to-complete stale window: re-validate every meter
          // against the current cross-module timeline before finalizing.
          await revalidateTripMetersForCompletion(client, existing.rows[0]);
          result = await client.query(
            `UPDATE trips SET status = $2, approved_by = $3, approved_at = NOW(), deleted = FALSE
             WHERE id = $1 RETURNING *`,
            [id, status, body.approvedBy ?? "system"]
          );
        } else if (status === "Deleted") {
          result = await client.query(
            `UPDATE trips SET status = 'Deleted', deleted = TRUE, deleted_reason = $2
             WHERE id = $1 RETURNING *`,
            [id, body.reason ?? body.rejectedReason ?? null]
          );
          await client.query(`UPDATE fuel_expenses SET deleted = TRUE WHERE trip_id = $1 AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE`, [id]);
        } else {
          result = await client.query(
            `UPDATE trips SET status = $2::trip_status, deleted = FALSE WHERE id = $1 RETURNING *`,
            [id, status]
          );
        }
      } catch (err) {
        rethrowIfAppError(err);
        if ((err as { code?: string }).code === "42703" && status === "Completed") {
          result = await client.query(
            `UPDATE trips SET status = $2, approved_by = $3, deleted = FALSE WHERE id = $1 RETURNING *`,
            [id, status, body.approvedBy ?? "system"]
          );
        } else {
          throw err;
        }
      }

      // Diesel → Fuel Expenses from the live diesel table, then approve when
      // the trip enters Trip List (Completed).
      if (status === "Completed") {
        await syncTripFuelFromDb(client, id, {
          approveIfCompleted: true,
          createdBy: body.approvedBy ?? "trip-complete-sync",
        });
      }

      const trip = await hydrateTrip(client, result!.rows[0], { includeDcPhoto: true });
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  /** Backs GET /trips/vehicle/:vehicleId/last-meter â€” the Trip Step 1 opening
   * meter hint. Upgraded to the universal cross-module latest (trips + fuel +
   * maintenance), not just trip closing meters, while keeping the same
   * response shape the frontend already consumes. */
  async lastClosingMeter(vehicleId: number, excludeTripId?: number | null) {
    await validateTripForeignKeys({ vehicleId });
    const latest = await getLatestVehicleMeter(null, vehicleId, excludeTripId);
    if (!latest) return null;

    const ref = String(latest.ref || "").trim();
    // Display label for Step 1 hint — trip number when from a trip, otherwise
    // fuel/maintenance source (never raw JSON null in the UI).
    let tripNo: string | null = null;
    if (latest.sourceType === "TRIP_END" || latest.sourceType === "TRIP_START") {
      tripNo = ref || null;
    } else if (latest.sourceType === "FUEL") {
      tripNo = ref ? `Fuel ${ref}` : "Fuel";
    } else if (latest.sourceType === "MAINTENANCE") {
      tripNo = ref ? `Maintenance ${ref}` : "Maintenance";
    }

    return {
      closingMeter: latest.meter,
      source: latest.sourceType,
      ref: latest.ref,
      tripNo,
      tripDate: latest.eventDate,
    };
  },

  /**
   * Available masters for Step 1 — the dropdown source of truth.
   * Returns only resources NOT currently occupied by an active trip (status
   * 'Draft' + start_step_submitted = TRUE, matching the resource lock rule).
   * Pass tripId when editing so the trip's own resources stay selectable.
   */
  async availableResources(tripId?: number | null) {
    const excludeId = tripId && tripId > 0 ? tripId : 0;

    const occupied = `
      WHERE status = 'Draft'
        AND start_step_submitted = TRUE
        AND deleted = FALSE
        AND id <> $1`;

    const vehicles = await query(
      `SELECT id, vehicle_number, no_of_boxes
         FROM vehicles
        WHERE id NOT IN (
          SELECT vehicle_id FROM trips
          ${occupied} AND vehicle_id IS NOT NULL
        )
        ORDER BY vehicle_number`,
      [excludeId]
    );

    const drivers = await query(
      `SELECT id, employee_name, department
         FROM employees
        WHERE department = 'Driver'
          AND id NOT IN (
            SELECT driver_id FROM trips
            ${occupied} AND driver_id IS NOT NULL
          )
        ORDER BY employee_name`,
      [excludeId]
    );

    const supervisors = await query(
      `SELECT id, employee_name, department
         FROM employees
        WHERE department = 'Supervisor'
          AND id NOT IN (
            SELECT supervisor_id FROM trips
            ${occupied} AND supervisor_id IS NOT NULL
          )
        ORDER BY employee_name`,
      [excludeId]
    );

    // Helpers/loaders are persisted by NAME in trip_crew. Return every master
    // row so the Step 1 dropdown can still *show* occupied names (disabled),
    // with lockedByTripNo explaining why they cannot be selected again.
    const helpers = await query(
      `SELECT e.id, e.employee_name, e.department,
              occ.trip_no AS locked_by_trip_no
         FROM employees e
         LEFT JOIN LATERAL (
           SELECT t.trip_no
             FROM trip_crew tc
             JOIN trips t ON t.id = tc.trip_id
            WHERE tc.employee_name = e.employee_name
              AND tc.role = 'helper'
              AND t.status = 'Draft'
              AND t.start_step_submitted = TRUE
              AND t.deleted = FALSE
              AND t.id <> $1
            ORDER BY t.id DESC
            LIMIT 1
         ) occ ON TRUE
        WHERE e.department IN ('Helper', 'Labor')
        ORDER BY e.employee_name`,
      [excludeId]
    );

    const loaders = await query(
      `SELECT e.id, e.employee_name, e.department,
              occ.trip_no AS locked_by_trip_no
         FROM employees e
         LEFT JOIN LATERAL (
           SELECT t.trip_no
             FROM trip_crew tc
             JOIN trips t ON t.id = tc.trip_id
            WHERE tc.employee_name = e.employee_name
              AND tc.role = 'loader'
              AND t.status = 'Draft'
              AND t.start_step_submitted = TRUE
              AND t.deleted = FALSE
              AND t.id <> $1
            ORDER BY t.id DESC
            LIMIT 1
         ) occ ON TRUE
        WHERE e.department = 'Loader'
        ORDER BY e.employee_name`,
      [excludeId]
    );

    return {
      vehicles: vehicles.rows.map((r) => ({
        id: num(r.id),
        vehicleNumber: str(r.vehicle_number),
        noOfBoxes: num(r.no_of_boxes),
      })),
      drivers: drivers.rows.map((r) => ({
        id: num(r.id),
        employeeName: str(r.employee_name),
        department: str(r.department),
      })),
      supervisors: supervisors.rows.map((r) => ({
        id: num(r.id),
        employeeName: str(r.employee_name),
        department: str(r.department),
      })),
      helpers: helpers.rows.map((r) => ({
        id: num(r.id),
        employeeName: str(r.employee_name),
        department: str(r.department),
        lockedByTripNo: r.locked_by_trip_no == null ? null : str(r.locked_by_trip_no),
      })),
      loaders: loaders.rows.map((r) => ({
        id: num(r.id),
        employeeName: str(r.employee_name),
        department: str(r.department),
        lockedByTripNo: r.locked_by_trip_no == null ? null : str(r.locked_by_trip_no),
      })),
    };
  },

  /**
   * Upsert one Step 5 diesel bill (POST /trips/:id/diesel).
   * Idempotent on (trip_id, client_key) when clientKey is provided.
   */
  async upsertDieselEntry(tripId: number, body: Record<string, unknown>) {
    return withTransaction(async (client) => {
      const existing = await client.query(`SELECT id, trip_date, closing_meter, vehicle_id FROM trips WHERE id = $1 AND deleted = FALSE`, [
        tripId,
      ]);
      if (!existing.rowCount) throw new AppError(404, `Trip ${tripId} not found`);

      const litres = numOrNull(body.litres);
      const rate = numOrNull(body.rate);
      const meter = numOrNull(body.meter);
      if (!(litres != null && litres > 0)) throw new AppError(422, "Diesel litres must be greater than zero");
      if (!(rate != null && rate > 0)) throw new AppError(422, "Diesel rate must be greater than zero");
      if (!(meter != null && meter > 0)) throw new AppError(422, "Diesel meter reading is required");
      const destMax = await client.query<{ m: string | null }>(
        `SELECT MAX(dest_meter) AS m FROM trip_legs
          WHERE trip_id = $1 AND farm_step_submitted = TRUE AND dest_meter IS NOT NULL`,
        [tripId]
      );
      const farmFloor = num(destMax.rows[0]?.m);
      const imageData = body.imageData != null ? str(body.imageData) : "";
      if (!imageData || imageData.length < 40) {
        throw new AppError(422, "Diesel bill image is required");
      }

      let rowIndex = numOrNull(body.rowIndex);
      const clientKey = body.clientKey != null && String(body.clientKey).trim()
        ? str(body.clientKey).trim()
        : null;

      if (clientKey) {
        const byKey = await client.query(
          `SELECT id, row_index FROM trip_diesel_entries WHERE trip_id = $1 AND client_key = $2`,
          [tripId, clientKey]
        );
        if (byKey.rowCount) {
          rowIndex = num(byKey.rows[0].row_index);
        }
      }

      if (rowIndex == null || rowIndex < 1) {
        const maxRow = await client.query(
          `SELECT COALESCE(MAX(row_index), 0) AS m FROM trip_diesel_entries WHERE trip_id = $1`,
          [tripId]
        );
        rowIndex = num(maxRow.rows[0].m) + 1;
      }

      // Serialize per vehicle and enforce the meter lock: a stale Step 5 page
      // that validated before a later same-vehicle approval must fail here,
      // and inactive vehicles are rejected by the lock itself.
      const upsertVehicleId = numOrNull(existing.rows[0].vehicle_id);
      if (upsertVehicleId != null) {
        await lockVehicleForMeterWrite(client, upsertVehicleId);
      }
      await assertTripMetersEditable(client, tripId);
      const priorDiesel = await client.query<{ meter: string; row_index: number }>(
        `SELECT meter, row_index FROM trip_diesel_entries
          WHERE trip_id = $1 AND row_index < $2 AND meter IS NOT NULL
          ORDER BY row_index DESC LIMIT 1`,
        [tripId, rowIndex]
      );
      const meterFloor = Math.max(farmFloor, num(priorDiesel.rows[0]?.meter));
      if (meterFloor > 0 && meter <= meterFloor) {
        throw new AppError(422, `Diesel meter (${meter} KM) must be greater than the last entered meter (${meterFloor} KM).`);
      }

      const laterDiesel = await client.query<{ meter: string; row_index: number }>(
        `SELECT meter, row_index FROM trip_diesel_entries
          WHERE trip_id = $1 AND row_index > $2 AND meter IS NOT NULL
          ORDER BY row_index ASC LIMIT 1`,
        [tripId, rowIndex]
      );
      const nextMeter = num(laterDiesel.rows[0]?.meter);
      // Universal cross-module meter validation for this diesel reading (the
      // checks above are trip-local only). Self-excluded via the already-synced
      // fuel row so resubmitting the same value never compares against itself.
      const upsertTripDate = dateOnly(existing.rows[0].trip_date) ?? "";
      if (upsertVehicleId != null && upsertTripDate) {
        const syncedFuel = await client.query<{ id: string }>(
          `SELECT id FROM fuel_expenses WHERE trip_id = $1 AND trip_fuel_entry_index = $2 AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE LIMIT 1`,
          [tripId, rowIndex]
        );
        await validateVehicleMeter(client, {
          vehicleId: upsertVehicleId,
          newMeter: meter,
          eventDate: upsertTripDate,
          exclude: syncedFuel.rowCount
            ? { sourceType: "FUEL" as const, recordId: str(syncedFuel.rows[0].id) }
            : undefined,
          excludeTripId: tripId,
          context: `Diesel entry #${rowIndex} meter reading`,
        });
      }
      if (nextMeter > 0 && meter >= nextMeter) {
        throw new AppError(422, `Diesel meter (${meter} KM) must be less than the next entered meter (${nextMeter} KM).`);
      }
      const duplicateBill = await client.query(
        `SELECT row_index FROM trip_diesel_entries
          WHERE trip_id = $1 AND row_index <> $2 AND image_data = $3
          LIMIT 1`,
        [tripId, rowIndex, imageData]
      );
      if (duplicateBill.rowCount) {
        throw new AppError(422, `Diesel bill image is already used in row ${num(duplicateBill.rows[0].row_index)}.`);
      }
      const closingMeter = num(existing.rows[0].closing_meter);
      if (closingMeter > 0 && meter > closingMeter) {
        throw new AppError(422, `Diesel meter (${meter} KM) cannot exceed the end meter (${closingMeter} KM).`);
      }

      const {
        bunkName,
        bunkSource,
        fuelBunkId,
        gpsLat,
        gpsLon,
        gpsAccuracy,
        gpsCapturedAt,
      } = await resolveDieselBunk(client, body);
      const bunkGps = `${gpsLat.toFixed(6)},${gpsLon.toFixed(6)}`;
      const imageName = body.imageName != null ? str(body.imageName) : null;

      await client.query(
        `INSERT INTO trip_diesel_entries (
           trip_id, row_index, litres, rate, meter, bunk_name, bunk_source, fuel_bunk_id,
           bunk_gps, image_data, image_name, client_key, gps_lat, gps_lon, gps_accuracy,
           gps_captured_at, submitted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         ON CONFLICT (trip_id, row_index) DO UPDATE SET
           litres = EXCLUDED.litres,
           rate = EXCLUDED.rate,
           meter = EXCLUDED.meter,
           bunk_name = EXCLUDED.bunk_name,
           bunk_source = EXCLUDED.bunk_source,
           fuel_bunk_id = EXCLUDED.fuel_bunk_id,
           bunk_gps = EXCLUDED.bunk_gps,
           image_data = EXCLUDED.image_data,
           image_name = EXCLUDED.image_name,
           client_key = COALESCE(EXCLUDED.client_key, trip_diesel_entries.client_key),
           gps_lat = EXCLUDED.gps_lat,
           gps_lon = EXCLUDED.gps_lon,
           gps_accuracy = EXCLUDED.gps_accuracy,
           gps_captured_at = EXCLUDED.gps_captured_at,
           submitted_at = NOW()`,
        [
          tripId,
          rowIndex,
          litres,
          rate,
          meter,
          bunkName,
          bunkSource,
          fuelBunkId,
          bunkGps,
          imageData,
          imageName,
          clientKey,
          gpsLat,
          gpsLon,
          gpsAccuracy,
          gpsCapturedAt,
        ]
      );

      // Mirror into Fuel Expenses immediately so Trip List completion only has
      // to approve — bills are never "missing" after a successful Step 5 diesel submit.
      await syncTripFuelFromDb(client, tripId, {
        approveIfCompleted: true,
        createdBy: "diesel-upsert",
      });

      const tripRow = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
      const trip = await hydrateTrip(client, tripRow.rows[0], { includeDcPhoto: true });
      const dieselEntries = slimDieselEntriesForWriteResponse(trip.dieselEntries ?? [], rowIndex!);
      return {
        ...trip,
        dieselEntries,
        ...flattenDiesel(dieselEntries),
      };
    });
  },

  async updateDieselEntry(tripId: number, entryId: number, body: Record<string, unknown>) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT d.id, d.row_index, t.closing_meter, t.vehicle_id, t.trip_date
           FROM trip_diesel_entries d
           JOIN trips t ON t.id = d.trip_id
          WHERE d.id = $1 AND d.trip_id = $2`,
        [entryId, tripId]
      );
      if (!existing.rowCount) throw new AppError(404, `Diesel entry ${entryId} not found`);

      const litres = numOrNull(body.litres);
      const rate = numOrNull(body.rate);
      const meter = numOrNull(body.meter);
      if (!(litres != null && litres > 0)) throw new AppError(422, "Diesel litres must be greater than zero");
      if (!(rate != null && rate > 0)) throw new AppError(422, "Diesel rate must be greater than zero");
      if (!(meter != null && meter > 0)) throw new AppError(422, "Diesel meter reading is required");
      const destMax = await client.query<{ m: string | null }>(
        `SELECT MAX(dest_meter) AS m FROM trip_legs
          WHERE trip_id = $1 AND farm_step_submitted = TRUE AND dest_meter IS NOT NULL`,
        [tripId]
      );
      const farmFloor = num(destMax.rows[0]?.m);
      const rowIndex = num(existing.rows[0].row_index);
      const neighbors = await client.query<{ meter: string; row_index: number }>(
        `SELECT meter, row_index FROM trip_diesel_entries
          WHERE trip_id = $1 AND id <> $2 AND meter IS NOT NULL
            AND (row_index < $3 OR row_index > $3)
          ORDER BY row_index`,
        [tripId, entryId, rowIndex]
      );
      const priorMeter = Math.max(
        farmFloor,
        ...neighbors.rows.filter((r) => num(r.row_index) < rowIndex).map((r) => num(r.meter))
      );
      // Serialize per vehicle and enforce the meter lock (stale Step 5 edits
      // after a later same-vehicle approval fail here).
      const updateVehicleId = numOrNull(existing.rows[0].vehicle_id);
      if (updateVehicleId != null) {
        await lockVehicleForMeterWrite(client, updateVehicleId);
      }
      await assertTripMetersEditable(client, tripId);
      const next = neighbors.rows.find((r) => num(r.row_index) > rowIndex);
      const nextMeter = next ? num(next.meter) : 0;
      // Universal cross-module meter validation, excluding this row's own
      // synced fuel bill and preserving its original instant so an unchanged
      // resubmit never compares against newer same-day neighbors.
      const updateTripDate = dateOnly(existing.rows[0].trip_date) ?? "";
      if (updateVehicleId != null && updateTripDate) {
        const ownFuel = await client.query<{ id: string; created_at: unknown }>(
          `SELECT id, created_at FROM fuel_expenses WHERE trip_id = $1 AND trip_fuel_entry_index = $2 AND source_type = 'TRIP' AND COALESCE(deleted, FALSE) = FALSE LIMIT 1`,
          [tripId, rowIndex]
        );
        await validateVehicleMeter(client, {
          vehicleId: updateVehicleId,
          newMeter: meter,
          eventDate: updateTripDate,
          eventInstant: ownFuel.rowCount
            ? preciseIsoOrUndefined(ownFuel.rows[0].created_at)
            : undefined,
          exclude: ownFuel.rowCount
            ? { sourceType: "FUEL" as const, recordId: str(ownFuel.rows[0].id) }
            : undefined,
          excludeTripId: tripId,
          context: `Diesel entry #${rowIndex} meter reading`,
        });
      }
      if (priorMeter > 0 && meter <= priorMeter) {
        throw new AppError(422, `Diesel meter (${meter} KM) must be greater than the last entered meter (${priorMeter} KM).`);
      }
      if (nextMeter > 0 && meter >= nextMeter) {
        throw new AppError(422, `Diesel meter (${meter} KM) must be less than the next entered meter (${nextMeter} KM).`);
      }
      const closingMeter = num(existing.rows[0].closing_meter);
      if (closingMeter > 0 && meter > closingMeter) {
        throw new AppError(422, `Diesel meter (${meter} KM) cannot exceed the end meter (${closingMeter} KM).`);
      }
      const imageData = body.imageData != null ? str(body.imageData) : "";
      if (!imageData || imageData.length < 40) {
        throw new AppError(422, "Diesel bill image is required");
      }
      const duplicateBill = await client.query(
        `SELECT row_index FROM trip_diesel_entries
          WHERE trip_id = $1 AND id <> $2 AND image_data = $3
          LIMIT 1`,
        [tripId, entryId, imageData]
      );
      if (duplicateBill.rowCount) {
        throw new AppError(422, `Diesel bill image is already used in row ${num(duplicateBill.rows[0].row_index)}.`);
      }

      const {
        bunkName,
        bunkSource,
        fuelBunkId,
        gpsLat,
        gpsLon,
        gpsAccuracy,
        gpsCapturedAt,
      } = await resolveDieselBunk(client, body);
      const bunkGps = `${gpsLat.toFixed(6)},${gpsLon.toFixed(6)}`;
      const imageName = body.imageName != null ? str(body.imageName) : null;
      const clientKey = body.clientKey != null && String(body.clientKey).trim()
        ? str(body.clientKey).trim()
        : null;

      await client.query(
        `UPDATE trip_diesel_entries SET
           litres = $3,
           rate = $4,
           meter = $5,
           bunk_name = $6,
           bunk_source = $7,
           fuel_bunk_id = $8,
           bunk_gps = $9,
           image_data = $10,
           image_name = $11,
           client_key = COALESCE($12, client_key),
           gps_lat = $13,
           gps_lon = $14,
           gps_accuracy = $15,
           gps_captured_at = $16,
           submitted_at = NOW()
         WHERE id = $1 AND trip_id = $2`,
        [
          entryId,
          tripId,
          litres,
          rate,
          meter,
          bunkName,
          bunkSource,
          fuelBunkId,
          bunkGps,
          imageData,
          imageName,
          clientKey,
          gpsLat,
          gpsLon,
          gpsAccuracy,
          gpsCapturedAt,
        ]
      );

      await syncTripFuelFromDb(client, tripId, {
        approveIfCompleted: true,
        createdBy: "diesel-update",
      });

      const tripRow = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
      const trip = await hydrateTrip(client, tripRow.rows[0], { includeDcPhoto: true });
      const keepRow = num(existing.rows[0].row_index);
      const dieselEntries = slimDieselEntriesForWriteResponse(trip.dieselEntries ?? [], keepRow);
      return {
        ...trip,
        dieselEntries,
        ...flattenDiesel(dieselEntries),
      };
    });
  },

  async deleteDieselEntry(tripId: number, entryId: number) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, row_index FROM trip_diesel_entries WHERE id = $1 AND trip_id = $2`,
        [entryId, tripId]
      );
      if (!existing.rowCount) throw new AppError(404, `Diesel entry ${entryId} not found`);
      const rowIndex = num(existing.rows[0].row_index);

      // Serialize per vehicle and enforce the meter lock: removing a diesel row
      // (and its synced fuel bill) on a locked trip is rejected.
      const delTrip = await client.query(`SELECT vehicle_id FROM trips WHERE id = $1`, [tripId]);
      const delVehicleId = delTrip.rowCount ? numOrNull(delTrip.rows[0].vehicle_id) : null;
      if (delVehicleId != null) {
        await lockVehicleForMeterWrite(client, delVehicleId);
      }
      await assertTripMetersEditable(client, tripId);
      await client.query(`DELETE FROM trip_diesel_entries WHERE id = $1 AND trip_id = $2`, [
        entryId,
        tripId,
      ]);

      // Drop matching Pending trip-synced fuel bill if present.
      await client.query(
        `DELETE FROM fuel_expenses
          WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending' AND deleted = FALSE
            AND trip_fuel_entry_index = $2`,
        [tripId, rowIndex]
      );

      const tripRow = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
      if (!tripRow.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
      const trip = await hydrateTrip(client, tripRow.rows[0], { includeDcPhoto: true });
      return {
        ...trip,
        ...flattenDiesel(trip.dieselEntries ?? []),
      };
    });
  },
};
