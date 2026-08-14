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
  computeFarmAmount,
  computeTotalKm,
  computeTripKpis,
  sumDieselFuel,
} from "../utils/tripCalculations.js";
import { loadDcPhoto, syncDieselToFuelExpenses } from "../utils/tripFuelSync.js";
import { generateSaleNo } from "../utils/tripDeliverySync.js";
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
import { assertTripResourcesAvailable } from "../validation/tripResourceValidation.js";
import { assertTripStatus } from "../validation/operations.js";
import {
  assertTripReadyForCompletion,
  assertTripStatusTransition,
  parseTripAutosave,
  validateStepSubmit,
} from "../validation/trips.js";

type Client = pg.PoolClient;

function mapTripBase(row: Record<string, unknown>): Omit<
  Trip,
  "helpers" | "loaders" | "boxDetails" | "deliveries" | "dieselEntries"
> {
  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    tripDate: dateOnly(row.trip_date) ?? "",
    status: str(row.status) as TripStatus,

    startTime: isoOrNull(row.start_time),
    vehicleId: numOrNull(row.vehicle_id),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    driverId: numOrNull(row.driver_id),
    driverName: row.driver_name == null ? null : str(row.driver_name),
    supervisorId: numOrNull(row.supervisor_id),
    supervisorName: row.supervisor_name == null ? null : str(row.supervisor_name),
    openingMeter: numOrNull(row.opening_meter),
    advanceAmount: num(row.advance_amount),
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
 *  - "completed"    → step was successfully submitted (server flag)
 *  - "saved"        → partial data persisted but step not submitted
 *  - "not_started"  → no meaningful data for the step
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

async function loadTripExtras(client: Client, tripId: number) {
  const crew = await client.query(`SELECT * FROM trip_crew WHERE trip_id = $1`, [tripId]);
  const boxes = await client.query(
    `SELECT * FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`,
    [tripId]
  );
  const deliveries = await client.query(
    `SELECT * FROM trip_deliveries WHERE trip_id = $1 ORDER BY serial_no NULLS LAST, id`,
    [tripId]
  );
  const diesel = await client.query(
    `SELECT * FROM trip_diesel_entries WHERE trip_id = $1 ORDER BY row_index`,
    [tripId]
  );
  const deliveryBoxes = await client.query(
    `SELECT db.* FROM trip_delivery_boxes db
     JOIN trip_deliveries d ON d.id = db.delivery_id
     WHERE d.trip_id = $1`,
    [tripId]
  );
  const perBox = await client.query(
    `SELECT pb.* FROM trip_delivery_per_box pb
     JOIN trip_deliveries d ON d.id = pb.delivery_id
     WHERE d.trip_id = $1`,
    [tripId]
  );

  const helpers = crew.rows
    .filter((r) => r.role === "helper")
    .map((r) => str(r.employee_name));
  const loaders = crew.rows
    .filter((r) => r.role === "loader")
    .map((r) => str(r.employee_name));

  const boxDetails: BoxDetail[] = boxes.rows.map((r) => ({
    boxNo: num(r.box_no),
    birds: num(r.birds),
    weight: num(r.weight),
  }));

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
      shopId: numOrNull(r.shop_id),
      shopName: str(r.shop_name),
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
    };
  });

  const dieselEntries: DieselEntry[] = diesel.rows.map((r) => ({
    rowIndex: num(r.row_index),
    litres: numOrNull(r.litres),
    rate: numOrNull(r.rate),
    meter: numOrNull(r.meter),
    bunkName: r.bunk_name == null ? null : str(r.bunk_name),
    bunkGps: r.bunk_gps == null ? null : str(r.bunk_gps),
    imageData: r.image_data == null ? null : str(r.image_data),
    imageName: r.image_name == null ? null : str(r.image_name),
  }));

  return { helpers, loaders, boxDetails, deliveries: mappedDeliveries, dieselEntries };
}

async function hydrateTrip(
  client: Client,
  row: Record<string, unknown>,
  options: { includeDcPhoto?: boolean } = {}
): Promise<Trip & { dcPhotoData?: string | null; dcPhotoMime?: string | null }> {
  const base = mapTripBase(row);
  const extras = await loadTripExtras(client, base.id);
  let dcPhoto: { dcPhotoData: string | null; dcPhotoMime: string | null } = {
    dcPhotoData: null,
    dcPhotoMime: null,
  };
  if (options.includeDcPhoto && base.dcPhotoKey) {
    dcPhoto = await loadDcPhoto(client, base.id, base.dcPhotoKey);
  }
  return { ...base, ...extras, ...dcPhoto };
}

async function generateTripNo(client: Client, tripDate: string): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`trip_no_${tripDate}`]);
  const ymd = tripDate.replace(/-/g, "");
  const result = await client.query<{ m: string }>(
    `SELECT COALESCE(MAX((substring(trip_no from '\\d{3}$'))::int), 0)::text AS m
       FROM trips
      WHERE trip_date = $1::date AND trip_no ~ '^TR-\\d{8}-\\d{3}$'`,
    [tripDate]
  );
  const seq = String(Number(result.rows[0].m) + 1).padStart(3, "0");
  return `TR-${ymd}-${seq}`;
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

async function replaceBoxes(client: Client, tripId: number, boxes: BoxDetail[] = []) {
  await client.query(`DELETE FROM trip_boxes WHERE trip_id = $1`, [tripId]);
  for (const box of boxes) {
    await client.query(
      `INSERT INTO trip_boxes (trip_id, box_no, birds, weight) VALUES ($1,$2,$3,$4)`,
      [tripId, box.boxNo, box.birds ?? 0, box.weight ?? 0]
    );
  }
}

async function replaceDeliveries(
  client: Client,
  tripId: number,
  deliveries: ShopDelivery[] = []
) {
  await client.query(`DELETE FROM trip_deliveries WHERE trip_id = $1`, [tripId]);
  if (deliveries.length === 0) return;

  // trip_deliveries.sale_no is NOT NULL (023_shop_sales_hardening.sql) in the
  // existing "<tripNo>-S<seq>" format also used by shopSalesService.ts for
  // post-completion Shop Sales edits. This wizard path (Step 4, Draft/Pending
  // trips) never populated it, which is exactly why new inserts here started
  // violating the constraint — reuse the same generateSaleNo() rather than
  // inventing a second numbering scheme. Full delete+reinsert (existing
  // behavior above) means the per-trip sequence restarts each save; that is
  // unchanged from how serial_no/id already behave for this same function.
  const tripRow = await client.query<{ trip_no: string }>(
    `SELECT trip_no FROM trips WHERE id = $1`,
    [tripId]
  );
  const tripNo = tripRow.rows[0]?.trip_no ?? `TR-${tripId}`;

  for (const [index, d] of deliveries.entries()) {
    const amount =
      d.amount != null && d.amount > 0
        ? d.amount
        : Number((Number(d.weight ?? 0) * Number(d.rate ?? 0)).toFixed(2));

    const saleNo = await generateSaleNo(client, tripId, tripNo);

    const inserted = await client.query(
      `INSERT INTO trip_deliveries (
         trip_id, sale_no, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
         birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
         farm_birds, farm_weight, auto_capture_time
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        tripId,
        saleNo,
        d.serialNo ?? index + 1,
        d.boxNo ?? null,
        d.shopId ?? null,
        d.shopName ?? "",
        d.birdTypeId ?? null,
        d.birdType ?? "",
        d.birds ?? 0,
        d.weight ?? 0,
        d.mortality ?? 0,
        d.mortKg ?? 0,
        d.rate ?? null,
        amount,
        d.remarks ?? "",
        d.deliveryMode ?? "box",
        d.farmBirds ?? null,
        d.farmWeight ?? null,
        normalizeTripTimestamp(d.autoCaptureTime),
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
        [deliveryId, pb.boxNo, pb.birds ?? 0, pb.weight ?? 0]
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
    await client.query(
      `INSERT INTO trip_diesel_entries (
         trip_id, row_index, litres, rate, meter, bunk_name, bunk_gps, image_data, image_name
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tripId,
        e.rowIndex,
        e.litres ?? null,
        e.rate ?? null,
        e.meter ?? null,
        e.bunkName ?? null,
        e.bunkGps ?? null,
        e.imageData ?? null,
        e.imageName ?? null,
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
      bunkGps: body[`dieselBunkGps${rowIndex}`]
        ? str(body[`dieselBunkGps${rowIndex}`])
        : null,
      imageData: body[`dieselImage${rowIndex}`]
        ? str(body[`dieselImage${rowIndex}`])
        : null,
      imageName: body[`dieselImageName${rowIndex}`]
        ? str(body[`dieselImageName${rowIndex}`])
        : null,
    }));
}

function flattenDiesel(entries: DieselEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) {
    out[`dieselLtr${e.rowIndex}`] = e.litres;
    out[`dieselRate${e.rowIndex}`] = e.rate;
    out[`dieselMeter${e.rowIndex}`] = e.meter;
    out[`dieselBunk${e.rowIndex}`] = e.bunkName;
    out[`dieselImage${e.rowIndex}`] = e.imageData;
    out[`dieselImageName${e.rowIndex}`] = e.imageName;
  }
  return out;
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
  // "hide deleted" clause must not be ANDed in — otherwise the two clauses
  // contradict each other and the query always returns zero rows.
  if (!filters.includeDeleted && filters.status !== "Deleted") {
    clauses.push(`deleted = FALSE`);
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

export const tripsService = {
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

  async getById(id: number) {
    const result = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);

    return withTransaction(async (client) => {
      const trip = await hydrateTrip(client, result.rows[0], { includeDcPhoto: true });
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

  async createDraft(body: Partial<Trip> = {}) {
    return withTransaction(async (client) => {
      try {
        const tripDate =
          dateOnly(body.tripDate) ??
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        // Server-only numbering on create (see save()).
        const tripNo = await generateTripNo(client, tripDate);

        const inserted = await client.query(
          `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,'Draft') RETURNING *`,
          [tripNo, tripDate]
        );
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
          resumeStepLabel: getResumeLabel(flags) ?? "Step 1 — Trip Header",
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

  /** Autosave engine — partial upsert with optimistic locking */
  async save(id: number | null, body: Partial<Trip> & Record<string, unknown>) {
    parseTripAutosave(body);

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

        // Trip number is generated ONLY at creation, server-side, locked.
        // Editing a trip never generates a new number (BUG 2: sequence is
        // consumed per trip date and a deleted trip keeps its number).
        await validateTripForeignKeys(body, client);
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
          const tripDate =
            dateOnly(body.tripDate) ??
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          // A new trip is numbered ONLY by the server. Never trust a
          // client-supplied tripNo here: a stale value forwarded by the UI
          // collides with trips_trip_no_key (23505) and surfaces to the user
          // as the Generic "Duplicate record" 409 — even for a different vehicle.
          const tripNo = await generateTripNo(client, tripDate);
          const inserted = await client.query(
            `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,$3) RETURNING id`,
            [tripNo, tripDate, body.status ?? "Draft"]
          );
          tripId = num(inserted.rows[0].id);
        }

        const dieselEntries = extractDieselFromBody(body);
        const boxDetails = (body.boxDetails as BoxDetail[]) ?? [];
        const deliveries = (body.deliveries as ShopDelivery[]) ?? [];

        // ---- Universal vehicle meter validation ----
        // Only runs on a real step submission (start/expenses), never on
        // "Save Progress" autosave (submitStep already strips these flags for
        // autosave bodies before calling save() — see submitStep below), so
        // partial in-progress drafts are never blocked mid-entry.
        if (body.startStepSubmitted === true || body.expensesStepSubmitted === true) {
          const vehicleIdForMeter =
            numOrNull(body.vehicleId) ?? (existing ? numOrNull(existing.rows[0].vehicle_id) : null);
          if (vehicleIdForMeter == null) {
            throw new AppError(422, "A vehicle must be selected before submitting this step.");
          }
          // The trip's business date — primary chronological key (see the
          // vehicle_meter_events view's comment for why date, not timestamp,
          // is primary: it keeps same-day cross-module comparisons fair).
          const tripBusinessDate =
            dateOnly(body.tripDate) ?? (existing ? dateOnly(existing.rows[0].trip_date) : null);
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
              // instant over "now" — matches the view's own COALESCE so a
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
                context: "Trip closing meter",
              });
            }

            // Trip-generated diesel/fuel entries follow the same universal
            // rule where a meter reading is actually persisted. Self-excluded
            // via the diesel row's own already-synced fuel_expenses record
            // (identity: trip_id + trip_fuel_entry_index, source_type='TRIP'
            // — see tripFuelSync.ts) so re-submitting the same value never
            // compares a reading against itself.
            for (const entry of dieselEntries) {
              const meter = numOrNull(entry.meter);
              if (meter == null || meter <= 0) continue;
              const existingSynced = await client.query<{ id: string }>(
                `SELECT id FROM fuel_expenses
                 WHERE trip_id = $1 AND trip_fuel_entry_index = $2
                   AND source_type = 'TRIP' AND deleted = FALSE`,
                [tripId, entry.rowIndex]
              );
              await validateVehicleMeter(client, {
                vehicleId: vehicleIdForMeter,
                newMeter: meter,
                eventDate: tripBusinessDate,
                eventInstant: closingEventInstant,
                exclude: existingSynced.rowCount
                  ? { sourceType: "FUEL", recordId: existingSynced.rows[0].id }
                  : undefined,
                context: `Diesel entry #${entry.rowIndex} meter reading`,
              });
            }
          }
        }
        // ---- end universal vehicle meter validation ----

        if (boxDetails.length || deliveries.length) {
          applyComputedFields(body, boxDetails, deliveries);
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
            start_time = COALESCE($4, start_time),
            vehicle_id = COALESCE($5, vehicle_id),
            vehicle_no = COALESCE($6, vehicle_no),
            driver_id = COALESCE($7, driver_id),
            driver_name = COALESCE($8, driver_name),
            supervisor_id = COALESCE($9, supervisor_id),
            supervisor_name = COALESCE($10, supervisor_name),
            opening_meter = COALESCE($11, opening_meter),
            advance_amount = COALESCE($12, advance_amount),
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
            approved_by = COALESCE($66, approved_by)
           WHERE id = $1`,
          [
            tripId,
            dateOnly(body.tripDate),
            body.status ?? null,
            normalizeTripTimestamp(body.startTime),
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
            normalizeTripTimestamp(body.reachedTime),
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
            normalizeTripTimestamp(body.pickupLoadTime),
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
            body.rateCompleted ?? null,
            body.deleted ?? null,
            body.deletedReason ?? null,
            body.approvedBy ?? null,
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
               start_step_submitted_at = CASE
                 WHEN COALESCE($2::boolean, FALSE) AND start_step_submitted_at IS NULL THEN NOW()
                 ELSE start_step_submitted_at END,
               farm_step_submitted_at = CASE
                 WHEN COALESCE($3::boolean, FALSE) AND farm_step_submitted_at IS NULL THEN NOW()
                 ELSE farm_step_submitted_at END,
               pickup_step_submitted_at = CASE
                 WHEN COALESCE($4::boolean, FALSE) AND pickup_step_submitted_at IS NULL THEN NOW()
                 ELSE pickup_step_submitted_at END,
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
        if (body.boxDetails) {
          await replaceBoxes(client, tripId, body.boxDetails as BoxDetail[]);
        }
        if (body.deliveries) {
          await replaceDeliveries(client, tripId, body.deliveries as ShopDelivery[]);
        }
        if (dieselEntries.length || body.dieselEntries) {
          await replaceDiesel(client, tripId, dieselEntries);
        }

        if (body.dcPhotoData && body.dcPhotoKey) {
          await client.query(
            `INSERT INTO trip_media (trip_id, media_key, media_type, mime_type, data_base64)
             VALUES ($1,$2,'image',$3,$4)
             ON CONFLICT (trip_id, media_key) DO UPDATE
               SET data_base64 = EXCLUDED.data_base64, mime_type = EXCLUDED.mime_type`,
            [
              tripId,
              str(body.dcPhotoKey),
              body.dcPhotoMime ?? "image/jpeg",
              str(body.dcPhotoData),
            ]
          );
        }

        const row = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
        const tripRow = row.rows[0];
        const tripDate = dateOnly(tripRow.trip_date) ?? "";

        if (dieselEntries.length && (body.expensesStepSubmitted || body.syncFuel)) {
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

        const trip = await hydrateTrip(client, tripRow, { includeDcPhoto: true });
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
        };
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async submitStep(
    id: number,
    step: TripWizardStep,
    body: Partial<Trip> & Record<string, unknown>
  ) {
    const isSaveMode = body.mode === "save";

    if (!isSaveMode) {
      validateStepSubmit(step, body);
    }

    const existing = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (!existing.rowCount) throw new AppError(404, `Trip ${id} not found`);
    const current = existing.rows[0];

    const flags = {
      startStepSubmitted: Boolean(current.start_step_submitted),
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
      const autosaveBody: Partial<Trip> & Record<string, unknown> = { ...body };
      delete autosaveBody.mode;
      delete autosaveBody.startStepSubmitted;
      delete autosaveBody.farmStepSubmitted;
      delete autosaveBody.pickupStepSubmitted;
      delete autosaveBody.deliveryStepSubmitted;
      delete autosaveBody.expensesStepSubmitted;
      delete autosaveBody.endStepSubmitted;
      return this.save(id, autosaveBody);
    }

    assertStepOrder(step, flags);

    const stepFlags: Record<string, Partial<Trip> & Record<string, unknown>> = {
      start: { startStepSubmitted: true, status: (body.status as TripStatus) ?? "Draft" },
      farm: { farmStepSubmitted: true },
      pickup: { pickupStepSubmitted: true },
      deliveries: { deliveryStepSubmitted: true },
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

    return this.save(id, { ...body, ...stepFlags[step] });
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
      assertTripStatusTransition(currentStatus, status);

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

      // Diesel bills synced to fuel_expenses get Approved only when the whole
      // trip completion succeeds — same transaction, so failure rolls both back.
      if (status === "Completed") {
        await client.query(
          `UPDATE fuel_expenses
             SET status = 'Approved', approved_by = $2, approved_date = NOW(),
                 ops_status = 'Approved', updated_at = NOW()
           WHERE trip_id = $1 AND source_type = 'TRIP' AND status = 'Pending'
             AND COALESCE(deleted, FALSE) = FALSE`,
          [id, body.approvedBy ?? "system"]
        );
      }

      const trip = await hydrateTrip(client, result!.rows[0], { includeDcPhoto: true });
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  /** Backs GET /trips/vehicle/:vehicleId/last-meter — the Trip Step 1 opening
   * meter hint. Upgraded to the universal cross-module latest (trips + fuel +
   * maintenance), not just trip closing meters, while keeping the same
   * response shape the frontend already consumes. */
  async lastClosingMeter(vehicleId: number) {
    await validateTripForeignKeys({ vehicleId });
    const latest = await getLatestVehicleMeter(null, vehicleId);
    if (!latest) return null;
    return {
      closingMeter: latest.meter,
      source: latest.sourceType,
      ref: latest.ref,
      tripNo: latest.sourceType === "TRIP_END" || latest.sourceType === "TRIP_START" ? latest.ref : null,
      tripDate: latest.eventDate,
    };
  },
};