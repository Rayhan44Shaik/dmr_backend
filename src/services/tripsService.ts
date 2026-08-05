import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  BoxDetail,
  DieselEntry,
  ShopDelivery,
  Trip,
  TripStatus,
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
import {
  assertStepOrder,
  getResumeLabel,
  getResumeStep,
  getWizardProgress,
  type TripWizardStep,
} from "../utils/tripResume.js";
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

    dcWeight: num(row.dc_weight),
    totalBirds: num(row.total_birds),
    boxes: num(row.boxes),
    avgWeight: num(row.avg_weight),
    pickupLoadTime: isoOrNull(row.pickup_load_time),
    dcPhotoKey: row.dc_photo_key == null ? null : str(row.dc_photo_key),
    pickupStepSubmitted: Boolean(row.pickup_step_submitted),

    deliveryStepSubmitted: Boolean(row.delivery_step_submitted),

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
  const result = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trips WHERE trip_date = $1::date`,
    [tripDate]
  );
  const seq = String(Number(result.rows[0].c) + 1).padStart(3, "0");
  return `TRP-${ymd}-${seq}`;
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

  const resolvedHelpers = await resolveEmployeeNames(client, helpers, "helper");
  for (const member of resolvedHelpers) {
    await client.query(
      `INSERT INTO trip_crew (trip_id, employee_id, employee_name, role)
       VALUES ($1,$2,$3,'helper')`,
      [tripId, member.employeeId, member.employeeName]
    );
  }

  const resolvedLoaders = await resolveEmployeeNames(client, loaders, "loader");
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

  for (const [index, d] of deliveries.entries()) {
    const amount =
      d.amount != null && d.amount > 0
        ? d.amount
        : Number((Number(d.weight ?? 0) * Number(d.rate ?? 0)).toFixed(2));

    const inserted = await client.query(
      `INSERT INTO trip_deliveries (
         trip_id, serial_no, box_no, shop_id, shop_name, bird_type_id, bird_type,
         birds, weight, mortality, mort_kg, rate, amount, remarks, delivery_mode,
         farm_birds, farm_weight, auto_capture_time
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        tripId,
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
        d.autoCaptureTime || null,
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

  if (!filters.includeDeleted) {
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
        `SELECT * FROM trips ${where}
         ORDER BY trip_date DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      const summaries = result.rows.map(toTripSummary);
      return paginatedResult(summaries, total, filters.pagination);
    }

    const result = await query(
      `SELECT * FROM trips ${where} ORDER BY trip_date DESC, id DESC`,
      params
    );

    if (filters.full) {
      return withTransaction(async (client) => {
        const trips: Trip[] = [];
        for (const row of result.rows) {
          const trip = await hydrateTrip(client, row);
          trips.push({ ...trip, ...flattenDiesel(trip.dieselEntries ?? []) });
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
      };
    });
  },

  async createDraft(body: Partial<Trip> = {}) {
    return withTransaction(async (client) => {
      try {
        const tripDate =
          dateOnly(body.tripDate) ??
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const tripNo = body.tripNo || (await generateTripNo(client, tripDate));

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

        if (tripId) {
          const existing = await client.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
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

        await validateTripForeignKeys(body, client);
        await enrichMasterDenorm(client, body);

        if (!tripId) {
          const tripDate =
            dateOnly(body.tripDate) ??
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const tripNo = body.tripNo || (await generateTripNo(client, tripDate));
          const inserted = await client.query(
            `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,$3) RETURNING id`,
            [tripNo, tripDate, body.status ?? "Draft"]
          );
          tripId = num(inserted.rows[0].id);
        }

        const dieselEntries = extractDieselFromBody(body);
        const boxDetails = (body.boxDetails as BoxDetail[]) ?? [];
        const deliveries = (body.deliveries as ShopDelivery[]) ?? [];

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
            submitted_at = COALESCE($49, submitted_at),
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
            body.startTime || null,
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
            body.reachedTime || null,
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
            body.pickupLoadTime || null,
            body.dcPhotoKey ?? null,
            body.pickupStepSubmitted ?? null,
            body.deliveryStepSubmitted ?? null,
            body.closingMeter ?? body.endMeter ?? null,
            body.endMeter ?? body.closingMeter ?? null,
            body.endTime || null,
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
            body.submittedAt || null,
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
    validateStepSubmit(step, body);

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
        submittedAt: body.submittedAt ?? new Date().toISOString(),
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

      const trip = await hydrateTrip(client, result!.rows[0], { includeDcPhoto: true });
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  async lastClosingMeter(vehicleId: number) {
    await validateTripForeignKeys({ vehicleId });
    const result = await query(
      `SELECT closing_meter, end_meter, trip_no, trip_date
       FROM trips
       WHERE vehicle_id = $1 AND deleted = FALSE AND closing_meter IS NOT NULL
       ORDER BY trip_date DESC, id DESC
       LIMIT 1`,
      [vehicleId]
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      closingMeter: num(row.closing_meter ?? row.end_meter),
      tripNo: str(row.trip_no),
      tripDate: dateOnly(row.trip_date),
    };
  },
};
