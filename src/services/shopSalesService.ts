import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { ShopSale } from "../types/operations.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopActive } from "../utils/fkValidation.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import { evaluateRateLock } from "../utils/rateLock.js";
import {
  assertOpsStatus,
  assertShopSaleRateInRange,
  parseBody,
  shopSaleBodySchema,
  shopSalesLoadSaveSchema,
  shopSalesTripSaveSchema,
} from "../validation/operations.js";
import {
  assertShopSaleTripNotDeleted,
  assertShopSaleWindowOpen,
  isShopSaleWindowOpen,
  shopSaleEditExpiresAt,
} from "../utils/shopSaleEditWindow.js";
import {
  assertTripCompletedForShopSales,
  assertWithinCapacity,
  generateSaleNo,
  recalcTripDeliveryTotals,
  sumActiveDeliveries,
} from "../utils/tripDeliverySync.js";
import {
  applyCredit,
  applyDebit,
  recalcShopBalance,
  setLedgerNet,
} from "../utils/shopLedger.js";

type Client = pg.PoolClient;

interface TripRow {
  id: number;
  tripNo: string;
  status: string;
  deleted: boolean;
  approvedAt: string | null;
  tripDate: string;
  capacityBirds: number;
  capacityWeight: number;
  legId?: number | null;
}

function computeAmount(weight: number, rate: number): number {
  return Number((Number(weight) * Number(rate)).toFixed(2));
}

function protectedShopSaleFieldsChanged(
  row: Record<string, unknown>,
  next: { birds: number; weight: number; rate: number; amount: number }
): boolean {
  return (
    num(row.birds) !== next.birds ||
    Number(num(row.weight).toFixed(3)) !== Number(next.weight.toFixed(3)) ||
    Number(num(row.rate).toFixed(2)) !== Number(next.rate.toFixed(2)) ||
    Number(num(row.amount).toFixed(2)) !== Number(next.amount.toFixed(2))
  );
}

function assertRowEditWindow(row: Record<string, unknown>): void {
  assertShopSaleWindowOpen(
    row.created_at as string | Date | null | undefined,
    str(row.sale_no)
  );
}

function tripToOpsStatus(tripStatus: string, deleted: boolean): ShopSale["status"] {
  if (deleted || tripStatus === "Deleted") return "Deleted";
  if (tripStatus === "Completed") return "Approved";
  if (tripStatus === "Pending") return "Pending Approval";
  return "Draft";
}

function mapDeliverySale(row: Record<string, unknown>): ShopSale {
  const tripStatus = str(row.trip_status);
  const tripDeleted = Boolean(row.trip_deleted);
  const saleDeleted = Boolean(row.deleted);
  const approvedAt = isoOrNull(row.approved_at);
  const tripDate = dateOnly(row.trip_date) ?? "";

  const persistedRate = num(row.rate);
  const rate = persistedRate > 0 ? persistedRate : num(row.re_rate);
  const weight = num(row.weight);
  const persistedAmount = num(row.amount);
  const amount = persistedRate > 0 && persistedAmount > 0 ? persistedAmount : Number((weight * rate).toFixed(2));

  const rateCompleted = Boolean(row.rate_completed);
  const rateLockedAt =
    row.rate_locked_at == null ? null : new Date(str(row.rate_locked_at));
  const lock = evaluateRateLock({
    rate_completed: rateCompleted,
    rate_locked_at: rateLockedAt,
  });
  const insertedAt = row.created_at == null ? null : row.created_at;
  const editExpires = shopSaleEditExpiresAt(insertedAt as string | Date | null);
  const editOpen = isShopSaleWindowOpen(insertedAt as string | Date | null);

  return {
    id: num(row.id),
    saleNo: str(row.sale_no),
    saleDate: tripDate,
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    subShopName: str(row.sub_shop_name),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    tripNo: str(row.trip_no),
    load: Math.max(1, num(row.load_no, 1)),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    isRentedVehicle: Boolean(row.is_rented_vehicle),
    farmName: row.source_farm == null ? null : str(row.source_farm),
    birds: num(row.birds),
    weight,
    rate,
    amount,
    mortality: num(row.mortality),
    mortalityWeight: num(row.mort_kg),
    deliveryMode: str(row.delivery_mode) === "weight" ? "weight" : "box",
    selectedBoxCount: num(row.selected_box_count),
    dcBirds: num(row.dc_birds),
    dcWeight: num(row.dc_weight),
    remarks: str(row.remarks),
    status: tripToOpsStatus(tripStatus, tripDeleted),
    deleted: saleDeleted,
    deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
    tripDeleted,
    editable: !saleDeleted && !tripDeleted && editOpen,
    windowExpiresAt: editExpires ? editExpires.toISOString() : null,
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt,
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
    rateCompleted,
    rateLockedAt: lock.rateLockedAt,
    rateLockedBy: row.rate_locked_by == null ? null : str(row.rate_locked_by),
    correctionWindowExpired: !editOpen,
    correctionWindowClosesAt: editExpires ? editExpires.toISOString() : null,
  };
}

const SALE_SELECT = `
  SELECT d.*,
         t.trip_no, t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.deleted_reason, t.approved_by, t.approved_at, t.vehicle_no, t.is_rented_vehicle, t.source_farm,
         t.rate_completed, t.rate_locked_at, t.rate_locked_by,
         (SELECT COUNT(*)::int FROM trip_delivery_boxes tdb WHERE tdb.delivery_id = d.id) AS selected_box_count,
         re.rate AS re_rate,
         COALESCE(tl.leg_index, 1) AS load_no,
         COALESCE(tl.total_birds, t.total_birds, 0) AS dc_birds,
         COALESCE(tl.dc_weight, t.dc_weight, 0) AS dc_weight
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN trip_legs tl ON tl.id = d.leg_id AND tl.trip_id = d.trip_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;

const PROTECTED_FIELDS = ["birds", "weight", "rate", "amount"] as const;

async function synchronizeShopSaleLedger(
  client: Client,
  opts: { trip: TripRow; saleId: number; oldShopId: number | null; newShopId: number | null; oldAmount: number; newAmount: number }
): Promise<void> {
  const { trip, saleId, oldShopId, newShopId, oldAmount, newAmount } = opts;
  const findLedger = async (shopId: number) => client.query<{ id: number; debit: string; credit: string }>(
    `SELECT l.id, l.debit, l.credit FROM shop_ledger l
      WHERE l.shop_id = $1 AND ((l.reference_type = 'shop_sale' AND l.reference_id = $2)
        OR (l.reference_type = 'trip' AND l.reference_id = $3))
      ORDER BY CASE WHEN l.reference_type = 'shop_sale' AND l.entry_type = 'correction' THEN 0
                    WHEN l.reference_type = 'shop_sale' THEN 1 ELSE 2 END, l.id DESC
      LIMIT 1 FOR UPDATE`, [shopId, saleId, trip.id]
  );
  if (oldShopId != null && oldShopId !== newShopId) {
    const oldLedger = await findLedger(oldShopId);
    if (oldLedger.rowCount) {
      const row = oldLedger.rows[0];
      const next = Number((num(row.debit) - num(row.credit) - oldAmount).toFixed(2));
      await setLedgerNet(client, num(row.id), oldShopId, next, "Shop sale reassigned to another shop");
    }
  }
  if (newShopId != null && oldShopId !== newShopId) {
    const ledger = await findLedger(newShopId);
    if (!ledger.rowCount) {
      await applyDebit(client, newShopId, {
        entryDate: dateOnly(trip.tripDate) ?? "", entryType: "sale", referenceType: "shop_sale",
        referenceId: saleId, note: "Shop sale debit (created via Shop Sales)",
      }, newAmount);
    } else {
      const row = ledger.rows[0];
      const baseline = oldShopId === newShopId ? oldAmount : 0;
      const next = Number((num(row.debit) - num(row.credit) - baseline + newAmount).toFixed(2));
      await setLedgerNet(client, num(row.id), newShopId, next, "Shop sale updated in Shop Sales");
    }
  }
}

async function lockTrip(client: Client, tripId: number, legId?: number | null): Promise<TripRow> {
  const result = await client.query(
    `SELECT id, trip_no, status, deleted, approved_at, trip_date,
            total_birds, dc_weight
       FROM trips WHERE id = $1 FOR UPDATE`,
    [tripId]
  );
  if (!result.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  const row = result.rows[0];
  let totalBirds = num(row.total_birds);
  let dcWeight = num(row.dc_weight);
  if (legId != null) {
    const leg = await client.query<{ total_birds: number | null; dc_weight: string | null }>(
      `SELECT total_birds, dc_weight
         FROM trip_legs
        WHERE id = $1 AND trip_id = $2`,
      [legId, tripId]
    );
    if (!leg.rowCount) throw new AppError(422, `Trip load for Shop Sale ${tripId} was not found`);
    totalBirds = num(leg.rows[0].total_birds);
    dcWeight = num(leg.rows[0].dc_weight);
  }
  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    status: str(row.status),
    deleted: Boolean(row.deleted),
    approvedAt: isoOrNull(row.approved_at),
    tripDate: dateOnly(row.trip_date) ?? "",
    // The Pickup step is authoritative for the Shop Sales ceiling: total_birds
    // (totalBirds) and dc_weight (dcWeight) are the mandatory-before-Completion
    // Step 3 values. Step 2 farm_load_* fields are NOT used as the Shop Sales cap.
    capacityBirds: totalBirds,
    capacityWeight: dcWeight,
    legId: legId ?? null,
  };
}

async function getDeliveryTripId(client: Client, saleId: number): Promise<number> {
  const result = await client.query<{ trip_id: number }>(
    `SELECT trip_id FROM trip_deliveries WHERE id = $1`,
    [saleId]
  );
  if (!result.rowCount) throw new AppError(404, "Shop sale not found");
  return num(result.rows[0].trip_id);
}

async function assertRateEntryLocked(
  client: Client,
  tripId: number,
  trip: { tripNo?: string }
): Promise<void> {
  const result = await client.query<{ rate_completed: boolean }>(
    `SELECT COALESCE(rate_completed, FALSE) AS rate_completed FROM trips WHERE id = $1`,
    [tripId]
  );
  if (!result.rowCount || !result.rows[0].rate_completed) {
    throw new AppError(
      409,
      `Trip ${trip.tripNo ?? ""} has no locked Rate Entry — ` +
        `Shop Sales requires the trip's Rate Entry to be saved & locked first.`.replace(
          /\s+/g,
          " "
        )
    );
  }
}

export const shopSalesService = {
  async list(
    filters: {
      shopId?: number;
      fromDate?: string;
      toDate?: string;
      status?: string;
      search?: string;
      sortBy?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<ShopSale[] | PaginatedResult<ShopSale>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    clauses.push(`t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE AND COALESCE(t.rate_completed, FALSE) = TRUE`);

    if (!filters.includeDeleted) {
      clauses.push(`COALESCE(d.deleted, FALSE) = FALSE`);
    }
    if (filters.shopId) {
      params.push(filters.shopId);
      clauses.push(`d.shop_id = $${params.length}`);
    }
    if (filters.fromDate) {
      params.push(filters.fromDate);
      clauses.push(`t.trip_date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      clauses.push(`t.trip_date <= $${params.length}`);
    }
    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      clauses.push(`(
        d.sale_no ILIKE $${params.length}
        OR t.trip_no ILIKE $${params.length}
        OR d.shop_name ILIKE $${params.length}
        OR COALESCE(d.remarks, '') ILIKE $${params.length}
      )`);
    }
    if (filters.status) {
      if (filters.status === "Approved") clauses.push(`t.status = 'Completed'`);
      else if (filters.status === "Pending Approval") clauses.push(`t.status = 'Pending'`);
      else if (filters.status === "Deleted") clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
      else if (filters.status === "Draft") clauses.push(`t.status = 'Draft'`);
      else if (filters.status === "Rejected") clauses.push(`FALSE`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const orderBy: Record<string, string> = {
      latest: "t.trip_date DESC, d.id DESC",
      oldest: "t.trip_date ASC, d.id ASC",
      sale_asc: "d.sale_no ASC, d.id ASC",
      sale_desc: "d.sale_no DESC, d.id DESC",
      shop_asc: "d.shop_name ASC, t.trip_date DESC, d.id DESC",
      shop_desc: "d.shop_name DESC, t.trip_date DESC, d.id DESC",
      birds_asc: "d.birds ASC, t.trip_date DESC, d.id DESC",
      birds_desc: "d.birds DESC, t.trip_date DESC, d.id DESC",
      weight_asc: "d.weight ASC, t.trip_date DESC, d.id DESC",
      weight_desc: "d.weight DESC, t.trip_date DESC, d.id DESC",
      rate_asc: "COALESCE(NULLIF(d.rate, 0), re.rate, 0) ASC, t.trip_date DESC, d.id DESC",
      rate_desc: "COALESCE(NULLIF(d.rate, 0), re.rate, 0) DESC, t.trip_date DESC, d.id DESC",
      amount_asc: "d.amount ASC, t.trip_date DESC, d.id DESC",
      amount_desc: "d.amount DESC, t.trip_date DESC, d.id DESC",
      remark_asc: "COALESCE(d.remarks, '') ASC, t.trip_date DESC, d.id DESC",
      remark_desc: "COALESCE(d.remarks, '') DESC, t.trip_date DESC, d.id DESC",
    };
    const order = orderBy[filters.sortBy ?? "latest"] ?? orderBy.latest;

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM trip_deliveries d
         INNER JOIN trips t ON t.id = d.trip_id ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${SALE_SELECT} ${where}
         ORDER BY ${order}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapDeliverySale), total, filters.pagination);
    }

    const result = await query(
      `${SALE_SELECT} ${where} ORDER BY ${order}`,
      params
    );
    return result.rows.map(mapDeliverySale);
  },

  async getById(id: number) {
    const result = await query(
      `${SALE_SELECT} WHERE d.id = $1 AND t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE AND COALESCE(t.rate_completed, FALSE) = TRUE`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Shop sale not found");
    return mapDeliverySale(result.rows[0]);
  },

  async updateLoad(tripId: number, load: number, body: unknown) {
    const data = parseBody(shopSalesLoadSaveSchema, body);
    if (!Number.isInteger(load) || load < 1 || load > 3) throw new AppError(422, "Invalid trip load");
    return withTransaction(async (client) => {
      try {
      const trip = await lockTrip(client, tripId);
      assertShopSaleTripNotDeleted(trip);
      assertTripCompletedForShopSales(trip);
      await assertRateEntryLocked(client, trip.id, trip);
      const legResult = await client.query<{ id: number; total_birds: number; dc_weight: string }>(
        `SELECT id,total_birds,dc_weight FROM trip_legs WHERE trip_id=$1 AND leg_index=$2 FOR UPDATE`, [tripId, load]
      );
      if (!legResult.rowCount) throw new AppError(404, `Load ${load} not found`);
      const leg = legResult.rows[0];
      trip.legId = num(leg.id);
      trip.capacityBirds = num(leg.total_birds);
      trip.capacityWeight = num(leg.dc_weight);
      const existing = await client.query(`${SALE_SELECT} WHERE d.trip_id=$1 AND d.leg_id=$2 AND d.deleted=FALSE FOR UPDATE OF d`, [tripId, leg.id]);
      const existingById = new Map(existing.rows.map((row: Record<string, unknown>) => [num(row.id), row]));
      const submittedIds = new Set<number>();
      let birdsTotal = 0; let mortalityBirds = 0; let weightTotal = 0; let mortalityWeightTotal = 0;
      for (const row of data.deliveries) {
        if (row.id != null) {
          if (!existingById.has(row.id) || submittedIds.has(row.id)) throw new AppError(422, "Delivery rows changed. Refresh the trip and try again.");
          submittedIds.add(row.id);
        }
        await assertShopActive(row.shopId, client);
        birdsTotal += row.birds;
        mortalityBirds += row.mortality;
        weightTotal += row.weight;
        mortalityWeightTotal += row.mortalityWeight;
      }
      if (submittedIds.size !== existingById.size) throw new AppError(422, "Every existing shop delivery must be included before saving the load.");
      if (birdsTotal + mortalityBirds !== trip.capacityBirds) {
        throw new AppError(422, `Birds must reconcile exactly to DC pickup (${birdsTotal} delivered + ${mortalityBirds} mortality = ${trip.capacityBirds} DC).`);
      }
      assertWithinCapacity({ label: "weight", available: trip.capacityWeight, alreadyAllocated: 0, requested: weightTotal + mortalityWeightTotal });

      for (const row of data.deliveries) {
        const old = row.id == null ? null : existingById.get(row.id) as Record<string, unknown>;
        const amount = computeAmount(row.weight, row.rate);
        if (old) {
          if (
            protectedShopSaleFieldsChanged(old, {
              birds: row.birds,
              weight: row.weight,
              rate: row.rate,
              amount,
            })
          ) {
            assertRowEditWindow(old);
          }
          const oldShopId = old.shop_id == null ? null : num(old.shop_id);
          const oldAmount = num(old.amount);
          await client.query(
            `UPDATE trip_deliveries SET shop_id=$2, birds=$3, weight=$4, mortality=$5, mort_kg=$6, delivery_mode=$7, rate=$8, amount=$9, remarks=$10, updated_at=NOW() WHERE id=$1`,
            [row.id, row.shopId, row.birds, row.weight, row.mortality, row.mortalityWeight, row.deliveryMode, row.rate, amount, str(row.remarks ?? "").trim().toLocaleUpperCase("en-IN")]
          );
          if (oldShopId !== row.shopId) await synchronizeShopSaleLedger(client, { trip, saleId: row.id!, oldShopId, newShopId: row.shopId, oldAmount, newAmount: amount });
          else if (oldShopId != null && amount !== oldAmount) {
            const ledger = await client.query<{ id: number; debit: string; credit: string }>(`SELECT id,debit,credit FROM shop_ledger WHERE shop_id=$1 AND reference_type='shop_sale' AND reference_id=$2 ORDER BY id DESC LIMIT 1 FOR UPDATE`, [oldShopId, row.id]);
            if (ledger.rowCount) {
              const currentNet = num(ledger.rows[0].debit) - num(ledger.rows[0].credit);
              const adjusted = Number((currentNet + amount - oldAmount).toFixed(2));
              await setLedgerNet(client, num(ledger.rows[0].id), oldShopId, adjusted, "Shop sale updated from trip load editor");
            }
          }
        } else {
          const saleNo = await generateSaleNo(client, tripId, trip.tripNo);
          const inserted = await client.query<{ id: number }>(`INSERT INTO trip_deliveries(trip_id,leg_id,sale_no,shop_id,shop_name,birds,weight,mortality,mort_kg,delivery_mode,rate,amount,remarks) SELECT $1,$2,$3,$4,shop_name,$5,$6,$7,$8,$9,$10,$11,$12 FROM shops WHERE id=$4 RETURNING id`, [tripId, leg.id, saleNo, row.shopId, row.birds, row.weight, row.mortality, row.mortalityWeight, row.deliveryMode, row.rate, amount, str(row.remarks ?? "").trim().toLocaleUpperCase("en-IN")]);
          const newId = num(inserted.rows[0]?.id);
          await applyDebit(client, row.shopId, { entryDate: dateOnly(trip.tripDate) ?? "", entryType: "sale", referenceType: "shop_sale", referenceId: newId, note: "Shop sale debit (created via trip load editor)" }, amount);
        }
      }
      await recalcTripDeliveryTotals(client, tripId);
      const saved = await client.query(`${SALE_SELECT} WHERE d.trip_id=$1 AND d.leg_id=$2 AND d.deleted=FALSE ORDER BY d.id`, [tripId, leg.id]);
      return saved.rows.map(mapDeliverySale);
      } catch (error) {
        rethrowIfAppError(error);
        throw error;
      }
    });
  },

  async updateTrip(tripId: number, body: unknown) {
    const data = parseBody(shopSalesTripSaveSchema, body);
    return withTransaction(async (client) => {
      try {
      const trip = await lockTrip(client, tripId);
      assertShopSaleTripNotDeleted(trip);
      assertTripCompletedForShopSales(trip);
      await assertRateEntryLocked(client, trip.id, trip);

      const legResult = await client.query<{ id: number; leg_index: number; total_birds: number; dc_weight: string }>(
        `SELECT id,leg_index,total_birds,dc_weight FROM trip_legs WHERE trip_id=$1 ORDER BY leg_index FOR UPDATE`, [tripId]
      );
      if (!legResult.rowCount) throw new AppError(404, "Trip loads not found");
      const legs = new Map(legResult.rows.map((leg) => [Number(leg.leg_index), leg]));
      const existing = await client.query(`${SALE_SELECT} WHERE d.trip_id=$1 AND d.deleted=FALSE FOR UPDATE OF d`, [tripId]);
      const existingById = new Map(existing.rows.map((row: Record<string, unknown>) => [num(row.id), row]));
      const submittedIds = new Set<number>();
      const sums = new Map<number, { birds: number; mortality: number; weight: number; mortalityWeight: number }>();
      for (const row of data.deliveries) {
        if (!legs.has(row.load)) throw new AppError(422, `Load ${row.load} does not exist on this trip.`);
        if (row.id != null) {
          if (!existingById.has(row.id) || submittedIds.has(row.id)) throw new AppError(422, "Delivery rows changed. Refresh the trip and try again.");
          submittedIds.add(row.id);
        }
        await assertShopActive(row.shopId, client);
        const sum = sums.get(row.load) ?? { birds: 0, mortality: 0, weight: 0, mortalityWeight: 0 };
        sum.birds += row.birds; sum.mortality += row.mortality; sum.weight += row.weight; sum.mortalityWeight += row.mortalityWeight;
        sums.set(row.load, sum);
      }
      if (submittedIds.size !== existingById.size) throw new AppError(422, "Every existing shop delivery on this trip must be included before saving.");
      for (const [loadNo, leg] of legs) {
        const sum = sums.get(loadNo) ?? { birds: 0, mortality: 0, weight: 0, mortalityWeight: 0 };
        if (sum.birds + sum.mortality !== num(leg.total_birds)) throw new AppError(422, `Load ${loadNo}: delivered birds + mortality birds must equal DC birds (${num(leg.total_birds)}).`);
        assertWithinCapacity({ label: "weight", available: num(leg.dc_weight), alreadyAllocated: 0, requested: sum.weight + sum.mortalityWeight });
      }

      for (const row of data.deliveries) {
        const leg = legs.get(row.load)!;
        trip.legId = num(leg.id);
        const old = row.id == null ? null : existingById.get(row.id) as Record<string, unknown>;
        const amount = computeAmount(row.weight, row.rate);
        if (old) {
          if (
            protectedShopSaleFieldsChanged(old, {
              birds: row.birds,
              weight: row.weight,
              rate: row.rate,
              amount,
            })
          ) {
            assertRowEditWindow(old);
          }
          const oldShopId = old.shop_id == null ? null : num(old.shop_id);
          const oldAmount = num(old.amount);
          await client.query(`UPDATE trip_deliveries SET leg_id=$2,shop_id=$3,birds=$4,weight=$5,mortality=$6,mort_kg=$7,delivery_mode=$8,rate=$9,amount=$10,remarks=$11,updated_at=NOW() WHERE id=$1`, [row.id, leg.id, row.shopId, row.birds, row.weight, row.mortality, row.mortalityWeight, row.deliveryMode, row.rate, amount, str(row.remarks ?? "").trim().toLocaleUpperCase("en-IN")]);
          if (oldShopId !== row.shopId) await synchronizeShopSaleLedger(client, { trip, saleId: row.id!, oldShopId, newShopId: row.shopId, oldAmount, newAmount: amount });
          else if (oldShopId != null && amount !== oldAmount) {
            const ledger = await client.query<{ id: number; debit: string; credit: string }>(`SELECT id,debit,credit FROM shop_ledger WHERE shop_id=$1 AND reference_type='shop_sale' AND reference_id=$2 ORDER BY id DESC LIMIT 1 FOR UPDATE`, [oldShopId, row.id]);
            if (ledger.rowCount) {
              const currentNet = num(ledger.rows[0].debit) - num(ledger.rows[0].credit);
              const adjusted = Number((currentNet + amount - oldAmount).toFixed(2));
              await setLedgerNet(client, num(ledger.rows[0].id), oldShopId, adjusted, "Shop sale updated from trip editor");
            }
          }
        } else {
          const saleNo = await generateSaleNo(client, tripId, trip.tripNo);
          const inserted = await client.query<{ id: number }>(`INSERT INTO trip_deliveries(trip_id,leg_id,sale_no,shop_id,shop_name,birds,weight,mortality,mort_kg,delivery_mode,rate,amount,remarks) SELECT $1,$2,$3,$4,shop_name,$5,$6,$7,$8,$9,$10,$11,$12 FROM shops WHERE id=$4 RETURNING id`, [tripId, leg.id, saleNo, row.shopId, row.birds, row.weight, row.mortality, row.mortalityWeight, row.deliveryMode, row.rate, amount, str(row.remarks ?? "").trim().toLocaleUpperCase("en-IN")]);
          await applyDebit(client, row.shopId, { entryDate: dateOnly(trip.tripDate) ?? "", entryType: "sale", referenceType: "shop_sale", referenceId: num(inserted.rows[0]?.id), note: "Shop sale debit (created via trip editor)" }, amount);
        }
      }
      await recalcTripDeliveryTotals(client, tripId);
      const saved = await client.query(`${SALE_SELECT} WHERE d.trip_id=$1 AND d.deleted=FALSE ORDER BY d.leg_id,d.id`, [tripId]);
      return saved.rows.map(mapDeliverySale);
      } catch (error) {
        rethrowIfAppError(error);
        throw error;
      }
    });
  },

  async create(body: unknown) {
    const data = parseBody(shopSaleBodySchema, body);
    if (!data.tripId) {
      throw new AppError(400, "tripId is required (sales are stored on trip_deliveries)");
    }

    return withTransaction(async (client) => {
      try {
        const trip = await lockTrip(client, data.tripId as number);
        const legIndex = Number((data as { load?: number }).load ?? 1);
        if (legIndex > 1 || trip.legId == null) {
          const legResult = await client.query<{ id: number }>(`SELECT id FROM trip_legs WHERE trip_id=$1 AND leg_index=$2`, [trip.id, legIndex]);
          if (!legResult.rowCount) throw new AppError(422, `Trip load ${legIndex} not found`);
          trip.legId = num(legResult.rows[0].id);
          const cap = await client.query<{ total_birds: number; dc_weight: string }>(`SELECT total_birds, dc_weight FROM trip_legs WHERE id=$1`, [trip.legId]);
          trip.capacityBirds = num(cap.rows[0]?.total_birds);
          trip.capacityWeight = num(cap.rows[0]?.dc_weight);
        }
        assertShopSaleTripNotDeleted(trip);
        assertTripCompletedForShopSales(trip);
        await assertRateEntryLocked(client, trip.id, trip);
        if (data.shopId == null) {
          throw new AppError(400, "shopId is required to create a Shop Sale");
        }
        await assertShopActive(data.shopId, client);
        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        const birds = data.birds ?? 0;
        const weight = data.weight ?? 0;
        const mortalityCount = data.mortality ?? 0;
        const mortalityWeight = data.mortalityWeight ?? 0;
        if (birds + mortalityCount <= 0 && weight + mortalityWeight <= 0) {
          throw new AppError(422, "A shop delivery must allocate at least one bird or a positive weight.");
        }

        const duplicate = await client.query(
          `SELECT id FROM trip_deliveries
            WHERE trip_id = $1 AND shop_id = $2 AND birds = $3 AND weight = $4
              AND deleted = FALSE
            LIMIT 1`,
          [trip.id, data.shopId, birds, weight]
        );
        if (duplicate.rowCount) {
          throw new AppError(
            409,
            `A matching Shop Sale already exists for this shop (id ${duplicate.rows[0].id}) — ` +
              `not creating a duplicate. Edit the existing sale instead, or use a different ` +
              `birds/weight value if this is a genuinely separate delivery.`
          );
        }

        const existing = await sumActiveDeliveries(client, trip.id, undefined, trip.legId);
        assertWithinCapacity({
          label: "birds",
          available: trip.capacityBirds,
          alreadyAllocated: existing.birds + existing.mortalityCount,
          requested: birds + (data.deliveryMode === "weight" ? 0 : mortalityCount),
        });
        assertWithinCapacity({
          label: "weight",
          available: trip.capacityWeight,
          alreadyAllocated: existing.weight + existing.mortalityWeight,
          requested: weight + mortalityWeight,
        });

        let rate = data.rate;
        if (rate == null) {
          const rateRow = await client.query<{ rate: string }>(
            `SELECT rate FROM trip_deliveries WHERE trip_id = $1 AND rate IS NOT NULL ORDER BY id LIMIT 1`,
            [trip.id]
          );
          rate = rateRow.rowCount ? Number(rateRow.rows[0].rate) : 0;
        }
        const amount = Number((weight * rate).toFixed(2));
        const saleNo = await generateSaleNo(client, trip.id, trip.tripNo);

        const result = await client.query(
          `INSERT INTO trip_deliveries (
             trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type,
            birds, weight, mortality, rate, amount, remarks, leg_id, delivery_mode, mort_kg
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING id`,
          [
            trip.id,
            saleNo,
            data.shopId ?? null,
            data.shopName ?? "",
            data.birdTypeId ?? null,
            data.birdType ?? "",
            birds,
            weight,
            data.mortality ?? 0,
            rate,
            amount,
            data.remarks == null ? "" : str(data.remarks).trim().toLocaleUpperCase("en-IN"),
            trip.legId,
            data.deliveryMode ?? "box",
            data.mortalityWeight ?? 0,
          ]
        );
        const saleId = num(result.rows[0].id);
        if (data.shopId != null) {
          // Shop Sale = DEBIT on the shop's ledger + outstanding. Because a
          // Shop Sale is only creatable on a rate-locked Completed trip, this
          // new (post-lock) sale has its authoritative amount now.
          await applyDebit(
            client,
            data.shopId,
            {
              entryDate: dateOnly(trip.tripDate) ?? "",
              entryType: "sale",
              referenceType: "shop_sale",
              referenceId: saleId,
              note: "Shop sale debit (created via Shop Sales)",
            },
            amount
          );
        }
        await recalcTripDeliveryTotals(client, trip.id);
        const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [saleId]);
        return mapDeliverySale(row.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async update(id: number, body: unknown) {
    const data = parseBody(shopSaleBodySchema.partial(), body);

    const current = await query(
      `${SALE_SELECT} WHERE d.id = $1`,
      [id]
    );
    if (!current.rowCount) throw new AppError(404, "Shop sale not found");
    const cur = current.rows[0];

    // Shop Sales is only visible/editable once the trip's Rate Entry is locked
    // (trips.rate_completed = TRUE). A sale on a trip that was never rate-locked
    // must not be reachable or editable — same visibility rule as list/getById.
    if (!Boolean(cur.rate_completed)) {
      throw new AppError(404, "Shop sale not found");
    }

    const touchesProtected = PROTECTED_FIELDS.some(
      (f) => (data as Record<string, unknown>)[f] !== undefined
    );

    if (touchesProtected) {
      const nextBirds = data.birds ?? num(cur.birds);
      const nextWeight = data.weight ?? num(cur.weight);
      const nextRate = data.rate ?? num(cur.rate);
      const nextAmount = computeAmount(nextWeight, nextRate);
      if (
        protectedShopSaleFieldsChanged(cur, {
          birds: nextBirds,
          weight: nextWeight,
          rate: nextRate,
          amount: nextAmount,
        })
      ) {
        assertRowEditWindow(cur);
      }
    }

    if (data.rate != null) assertShopSaleRateInRange(data.rate);

    const effectiveWeight = data.weight ?? num(cur.weight);
    const effectiveRate = data.rate ?? num(cur.rate);
    const nextAmount = computeAmount(effectiveWeight, effectiveRate);
    const oldAmount = num(cur.amount);
    const saleShopId = num(cur.shop_id);

    return withTransaction(async (client) => {
      const tripId = await getDeliveryTripId(client, id);
      const legId = cur.leg_id == null ? null : num(cur.leg_id);
        const trip = await lockTrip(client, tripId, legId);
      assertShopSaleTripNotDeleted(trip);
      assertTripCompletedForShopSales(trip);
      await assertRateEntryLocked(client, trip.id, trip);

      const birds = data.birds ?? num(cur.birds);
      const weight = data.weight ?? num(cur.weight);
      const mortalityCount = data.mortality ?? num(cur.mortality);
      const oldDeliveryMode = str(cur.delivery_mode) === "weight" ? "weight" : "box";
      const nextDeliveryMode = data.deliveryMode ?? oldDeliveryMode;
      const oldMortalityWeight = num(cur.mort_kg ?? 0);
      const mortalityWeight = data.mortalityWeight ?? oldMortalityWeight;
      const nextShopId = data.shopId === undefined ? (cur.shop_id == null ? null : num(cur.shop_id)) : data.shopId;
      const nextShopName = data.shopId != null
        ? str((await client.query<{ shop_name: string }>(`SELECT shop_name FROM shops WHERE id=$1 AND status='Active'`, [data.shopId])).rows[0]?.shop_name ?? "")
        : str(cur.shop_name);
      if (data.shopId !== undefined && data.shopId != null) await assertShopActive(data.shopId, client);
      if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

      // Quantity constraints are relevant only when a quantity changes.
      // Re-validating unchanged quantities during a rate-only correction can
      // reject legitimate legacy/multi-load rows whose trip header contains
      // only the active load's pickup totals.
      {
        const others = await sumActiveDeliveries(client, trip.id, id, legId);
        const nextCountMortality = nextDeliveryMode === "box" ? mortalityCount : 0;
        assertWithinCapacity({
          label: "birds",
          available: trip.capacityBirds,
          alreadyAllocated: others.birds + others.mortalityCount,
          requested: birds + nextCountMortality,
        });
        assertWithinCapacity({
          label: "weight",
          available: trip.capacityWeight,
          alreadyAllocated: others.weight + others.mortalityWeight,
          requested: weight + mortalityWeight,
        });
      }

      const result = await client.query(
        `UPDATE trip_deliveries SET
           shop_id = $10,
           shop_name = $11,
           bird_type_id = COALESCE($2, bird_type_id),
           bird_type = COALESCE($3, bird_type),
           birds = $4,
           weight = $5,
           rate = $6,
           amount = $7,
           mortality = COALESCE($8, mortality),
           mort_kg = COALESCE($12, mort_kg),
           delivery_mode = COALESCE($13, delivery_mode),
           remarks = COALESCE($9, remarks)
         WHERE id = $1
         RETURNING id`,
        [
          id,
          data.birdTypeId ?? null,
          data.birdType ?? null,
          birds,
          weight,
          effectiveRate,
          nextAmount,
          data.mortality ?? null,
          data.remarks == null ? null : str(data.remarks).trim().toLocaleUpperCase("en-IN"),
          nextShopId,
          nextShopName,
          data.mortalityWeight ?? null,
          data.deliveryMode ?? null,
        ]
      );
      if (!result.rowCount) throw new AppError(404, "Shop sale not found");
      if (saleShopId !== nextShopId) await synchronizeShopSaleLedger(client, {
        trip, saleId: id, oldShopId: saleShopId > 0 ? saleShopId : null,
        newShopId: nextShopId, oldAmount, newAmount: nextAmount,
      });
      if (saleShopId > 0 && saleShopId === nextShopId && nextAmount !== oldAmount) {
        // Keep one financial row for one sale. Editing a Shop Sale changes the
        // existing ledger row in place instead of appending a second
        // "correction" row. This preserves the exact balance delta while the
        // Shop Ledger displays one sale with its current rate and amount.
        const diff = nextAmount - oldAmount;
        const ledgerRow = await client.query<{
          id: number;
          debit: string;
          credit: string;
        }>(
          `SELECT l.id, l.debit, l.credit
             FROM shop_ledger l
            WHERE l.shop_id = $1
              AND (
                (l.reference_type = 'shop_sale' AND l.reference_id = $2)
                OR
                (l.reference_type = 'trip' AND l.reference_id = $3)
              )
            ORDER BY
              CASE
                WHEN l.reference_type = 'shop_sale' AND l.entry_type = 'correction' THEN 0
                WHEN l.reference_type = 'shop_sale' THEN 1
                WHEN ABS((l.debit - l.credit) - $4::numeric) < 0.01 THEN 2
                ELSE 3
              END,
              l.id DESC
            LIMIT 1
            FOR UPDATE`,
          [saleShopId, id, trip.id, oldAmount]
        );
        if (!ledgerRow.rowCount) {
          // Repair legacy/incomplete deliveries that reached Shop Sales before
          // their financial row was created. The delivery update and this
          // authoritative debit share one transaction, so neither can persist
          // alone. Use the full new amount (not merely the rate-change delta),
          // because there is no prior ledger value to correct.
          await applyDebit(
            client,
            saleShopId,
            {
              entryDate: dateOnly(trip.tripDate) ?? "",
              entryType: "sale",
              referenceType: "shop_sale",
              referenceId: id,
              note: `Shop sale debit repaired during update (₹${nextAmount.toFixed(2)})`,
            },
            nextAmount
          );
        } else {
          const currentNet = num(ledgerRow.rows[0].debit) - num(ledgerRow.rows[0].credit);
          const correctedNet = Number((currentNet + diff).toFixed(2));
          await client.query(
            `UPDATE shop_ledger
                SET debit = $2, credit = $3,
                    note = $4
              WHERE id = $1`,
            [
              ledgerRow.rows[0].id,
              correctedNet > 0 ? correctedNet : 0,
              correctedNet < 0 ? -correctedNet : 0,
              `Shop sale updated (₹${oldAmount.toFixed(2)} → ₹${nextAmount.toFixed(2)})`,
            ]
          );
          await recalcShopBalance(client, saleShopId);
        }
      }
      if (saleShopId <= 0 && nextShopId != null) await synchronizeShopSaleLedger(client, {
        trip, saleId: id, oldShopId: null, newShopId: nextShopId, oldAmount: 0, newAmount: nextAmount,
      });
      await recalcTripDeliveryTotals(client, trip.id);
      const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
      return mapDeliverySale(row.rows[0]);
    });
  },
  async updateStatus(id: number, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const patch = body as { reason?: string };

    if (status !== "Deleted") {
      throw new AppError(
        409,
        `Shop Sales cannot set status to "${status}" — a Shop Sale has no independent status ` +
          `beyond deleted/active. Trip status can only be changed via the Trip status API, ` +
          `never through Shop Sales.`
      );
    }

    return this.softDelete(id, patch.reason);
  },

  async softDelete(id: number, reason?: string) {
    return withTransaction(async (client) => {
      const tripId = await getDeliveryTripId(client, id);
      const trip = await lockTrip(client, tripId);
      assertShopSaleTripNotDeleted(trip);
      assertTripCompletedForShopSales(trip);
      await assertRateEntryLocked(client, trip.id, trip);

      const deliveryRow = await client.query<{ shop_id: number | null; amount: string }>(
        `SELECT shop_id, amount FROM trip_deliveries WHERE id = $1`,
        [id]
      );
      const saleShopId = deliveryRow.rowCount ? num(deliveryRow.rows[0].shop_id) : 0;
      const saleAmount = deliveryRow.rowCount ? num(deliveryRow.rows[0].amount) : 0;

      // Permanent-lock rule (mirrors trg_trip_deliveries_rate_lock): a
      // delivery on a rate-locked trip may never be removed — the 2-week
      // insert window only ever permits in-place edits of
      // birds/weight/rate (and the derived amount), never deletion. This
      // soft-delete path performs an UPDATE (deleted = TRUE) rather than a
      // hard DELETE, so it would otherwise evade the trigger's DELETE arm.
      const rateRow = await client.query<{ rate_locked_at: string | null }>(
        `SELECT rate_locked_at FROM trips WHERE id = $1`,
        [tripId]
      );
      const rateLock = evaluateRateLock({
        rate_completed: true,
        rate_locked_at: rateRow.rows[0]?.rate_locked_at ?? null,
      });
      if (rateLock.rateCompleted) {
        throw new AppError(
          409,
          "Rate correction window expired - deleting locked after Rate Entry",
          {
            tripId: trip.id,
            rateLockedAt: rateLock.rateLockedAt,
            correctionWindowClosesAt: rateLock.correctionWindowClosesAt,
          }
        );
      }

      // Unreachable: assertRateEntryLocked already guarantees rate_completed =
      // TRUE for every reachable Shop Sale. Kept as the protective gate above
      // so the service layer cannot be tricked into deleting an unlocked trip.
      const result = await client.query(
        `UPDATE trip_deliveries SET deleted = TRUE, deleted_at = NOW(), deleted_reason = $2
         WHERE id = $1 AND deleted = FALSE
         RETURNING id`,
        [id, reason ?? null]
      );
      if (!result.rowCount) throw new AppError(404, "Shop sale not found");

      if (saleShopId > 0) {
        // Deleting a sale removes its DEBIT → credit the shop back by the full
        // amount so outstanding no longer includes this sale.
        await applyCredit(
          client,
          saleShopId,
          {
            entryDate: trip.tripDate,
            entryType: "correction",
            referenceType: "shop_sale",
            referenceId: id,
            note: "Shop sale debit reversed (deleted)",
          },
          saleAmount
        );
      }

      await recalcTripDeliveryTotals(client, trip.id);
      const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
      return mapDeliverySale(row.rows[0]);
    });
  },
};
