import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  BoxDetail,
  DieselEntry,
  ShopDelivery,
  Trip,
  TripStatus,
} from "../types/models.js";
import { dateOnly, isoOrNull, num, numOrNull, str } from "../utils/coerce.js";
import { computeTripExpense } from "../utils/operationsHelpers.js";
import { assertTripStatus } from "../validation/operations.js";

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

async function hydrateTrip(client: Client, row: Record<string, unknown>): Promise<Trip> {
  const base = mapTripBase(row);
  const extras = await loadTripExtras(client, base.id);
  return { ...base, ...extras };
}

async function generateTripNo(client: Client, tripDate: string): Promise<string> {
  const ymd = tripDate.replace(/-/g, "");
  const result = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM trips WHERE trip_date = $1`,
    [tripDate]
  );
  const seq = String(Number(result.rows[0].c) + 1).padStart(3, "0");
  return `TRP-${ymd}-${seq}`;
}

async function replaceCrew(
  client: Client,
  tripId: number,
  helpers: string[] = [],
  loaders: string[] = []
) {
  await client.query(`DELETE FROM trip_crew WHERE trip_id = $1`, [tripId]);
  for (const name of helpers) {
    if (!name) continue;
    await client.query(
      `INSERT INTO trip_crew (trip_id, employee_name, role) VALUES ($1,$2,'helper')`,
      [tripId, name]
    );
  }
  for (const name of loaders) {
    if (!name) continue;
    await client.query(
      `INSERT INTO trip_crew (trip_id, employee_name, role) VALUES ($1,$2,'loader')`,
      [tripId, name]
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
  await client.query(
    `DELETE FROM trip_deliveries WHERE trip_id = $1`,
    [tripId]
  );

  for (const [index, d] of deliveries.entries()) {
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
        d.amount ?? 0,
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

export const tripsService = {
  async list(filters: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    vehicleId?: number;
    supervisorId?: number;
    search?: string;
    includeDeleted?: boolean;
  } = {}) {
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

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM trips ${where} ORDER BY trip_date DESC, id DESC`,
      params
    );

    return withTransaction(async (client) => {
      const trips: Trip[] = [];
      for (const row of result.rows) {
        trips.push(await hydrateTrip(client, row));
      }
      return trips.map((t) => ({ ...t, ...flattenDiesel(t.dieselEntries ?? []) }));
    });
  },

  async getById(id: number) {
    const result = await query(`SELECT * FROM trips WHERE id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);
    return withTransaction(async (client) => {
      const trip = await hydrateTrip(client, result.rows[0]);
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  async createDraft(body: Partial<Trip> = {}) {
    return withTransaction(async (client) => {
      const tripDate =
        dateOnly(body.tripDate) ??
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tripNo = body.tripNo || (await generateTripNo(client, tripDate));

      const inserted = await client.query(
        `INSERT INTO trips (trip_no, trip_date, status) VALUES ($1,$2,'Draft') RETURNING *`,
        [tripNo, tripDate]
      );
      return hydrateTrip(client, inserted.rows[0]);
    });
  },

  /** Full upsert used by wizard autosave / step submits */
  async save(id: number | null, body: Partial<Trip> & Record<string, unknown>) {
    return withTransaction(async (client) => {
      let tripId = id;

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

      // Optional columns from later alters — ignore if not present on finalized schema
      const bodyRec = body as Partial<Trip> & Record<string, unknown>;
      const expenseParts = computeTripExpense({
        fuel: bodyRec.fuel as number | undefined,
        pickupTolls: bodyRec.pickupTolls as number | undefined,
        deliveryTolls: bodyRec.deliveryTolls as number | undefined,
        destinationTolls: bodyRec.destinationTolls as number | undefined,
        meals: bodyRec.meals as number | undefined,
        mealsTiffin: bodyRec.mealsTiffin as number | undefined,
        driverBata: bodyRec.driverBata as number | undefined,
        helperBata: bodyRec.helperBata as number | undefined,
        loading: bodyRec.loading as number | undefined,
        vehicleMaintenance: bodyRec.vehicleMaintenance as number | undefined,
        othersRC: bodyRec.othersRC as number | undefined,
        others1Amt: bodyRec.others1Amt as number | undefined,
        others2Amt: bodyRec.others2Amt as number | undefined,
        others3Amt: bodyRec.others3Amt as number | undefined,
        others4Amt: bodyRec.others4Amt as number | undefined,
        others5Amt: bodyRec.others5Amt as number | undefined,
        expense: bodyRec.expense as number | undefined,
      });

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
             total_trip_expense = CASE
               WHEN $10::boolean THEN $11
               ELSE total_trip_expense
             END
           WHERE id = $1`,
          [
            tripId,
            bodyRec.farmBirdTypeId ?? null,
            bodyRec.farmBirdType ?? null,
            bodyRec.farmBirdCount ?? null,
            bodyRec.farmLoadWeight ?? null,
            bodyRec.farmRate ?? null,
            bodyRec.farmAmount ?? null,
            bodyRec.driverBata ?? null,
            bodyRec.helperBata ?? null,
            Boolean(
              bodyRec.fuel != null ||
                bodyRec.driverBata != null ||
                bodyRec.helperBata != null ||
                bodyRec.meals != null ||
                bodyRec.pickupTolls != null ||
                bodyRec.deliveryTolls != null ||
                bodyRec.expense != null ||
                bodyRec.totalTripExpense != null
            ),
            bodyRec.totalTripExpense ?? expenseParts.totalTripExpense,
          ]
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== "42703") throw err; // undefined_column — finalized schema without ops alters
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
      const trip = await hydrateTrip(client, row.rows[0]);
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  async submitStep(
    id: number,
    step: "start" | "farm" | "pickup" | "deliveries" | "expenses",
    body: Partial<Trip> & Record<string, unknown>
  ) {
    const flags: Record<string, Partial<Trip>> = {
      start: { startStepSubmitted: true, status: (body.status as TripStatus) ?? "Draft" },
      farm: { farmStepSubmitted: true },
      pickup: { pickupStepSubmitted: true },
      deliveries: { deliveryStepSubmitted: true },
      expenses: {
        expensesStepSubmitted: true,
        endStepSubmitted: true,
        status: (body.status as TripStatus) ?? "Completed",
        submittedAt: body.submittedAt ?? new Date().toISOString(),
      },
    };

    return this.save(id, { ...body, ...flags[step] });
  },

  async softDelete(id: number, reason?: string) {
    const result = await query(
      `UPDATE trips SET deleted = TRUE, deleted_reason = $2, status = 'Deleted'
       WHERE id = $1 RETURNING id`,
      [id, reason ?? null]
    );
    if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);
    return { id, deleted: true };
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

    // Workflow: Draft -> Pending -> Completed; Deleted remains Deleted
    let sql = `UPDATE trips SET status = $2`;
    const params: unknown[] = [id, status];

    if (status === "Completed") {
      params.push(body.approvedBy ?? "system");
      // approved_at may be absent on older schemas
      sql += `, approved_by = $${params.length}`;
      try {
        // probe optional column in same statement; fallback below on undefined_column
        const probe = await query(
          `UPDATE trips SET status = $2, approved_by = $3, approved_at = NOW(), deleted = FALSE
           WHERE id = $1 RETURNING *`,
          [id, status, body.approvedBy ?? "system"]
        );
        if (!probe.rowCount) throw new AppError(404, `Trip ${id} not found`);
        return withTransaction(async (client) => {
          const trip = await hydrateTrip(client, probe.rows[0]);
          return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        });
      } catch (err) {
        if ((err as { code?: string }).code !== "42703") throw err;
        sql = `UPDATE trips SET status = $2, approved_by = $3, deleted = FALSE WHERE id = $1 RETURNING *`;
        const result = await query(sql, [id, status, body.approvedBy ?? "system"]);
        if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);
        return withTransaction(async (client) => {
          const trip = await hydrateTrip(client, result.rows[0]);
          return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
        });
      }
    } else if (status === "Deleted") {
      params.push(true);
      sql += `, deleted = $${params.length}`;
      params.push(body.reason ?? body.rejectedReason ?? null);
      sql += `, deleted_reason = $${params.length}`;
    } else if (status === "Pending" || status === "Draft") {
      sql += `, deleted = FALSE`;
    }

    sql += ` WHERE id = $1 RETURNING *`;
    const result = await query(sql, params);
    if (!result.rowCount) throw new AppError(404, `Trip ${id} not found`);
    return withTransaction(async (client) => {
      const trip = await hydrateTrip(client, result.rows[0]);
      return { ...trip, ...flattenDiesel(trip.dieselEntries ?? []) };
    });
  },

  async lastClosingMeter(vehicleId: number) {
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
