import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { ShopSale } from "../types/operations.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { assertBirdTypeExists, assertShopExists } from "../utils/fkValidation.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  assertOpsStatus,
  parseBody,
  shopSaleBodySchema,
} from "../validation/operations.js";
import {
  assertTripCompletedForShopSales,
  assertTripEditable,
  assertWithinCapacity,
  editWindowExpiresAt,
  generateSaleNo,
  isTripEditable,
  recalcTripDeliveryTotals,
  sumActiveDeliveries,
} from "../utils/tripDeliverySync.js";

type Client = pg.PoolClient;

interface TripRow {
  id: number;
  tripNo: string;
  status: string;
  deleted: boolean;
  approvedAt: string | null;
  tripDate: string;
  /** Authoritative bird/weight capacity Shop Sales must never exceed. */
  capacityBirds: number;
  capacityWeight: number;
}

/** Map trip_status → ops-facing status for API contract */
function tripToOpsStatus(tripStatus: string, deleted: boolean): ShopSale["status"] {
  if (deleted || tripStatus === "Deleted") return "Deleted";
  if (tripStatus === "Completed") return "Approved";
  if (tripStatus === "Pending") return "Pending Approval";
  return "Draft";
}

function opsToTripStatus(status: string): string {
  if (status === "Approved") return "Completed";
  if (status === "Pending Approval") return "Pending";
  if (status === "Deleted") return "Deleted";
  if (status === "Rejected") return "Draft";
  return "Draft";
}

function mapDeliverySale(row: Record<string, unknown>): ShopSale {
  const tripStatus = str(row.trip_status);
  const tripDeleted = Boolean(row.trip_deleted);
  const saleDeleted = Boolean(row.deleted);
  const approvedAt = isoOrNull(row.approved_at);
  const tripDate = dateOnly(row.trip_date) ?? "";

  // Effective rate/amount: once an operator explicitly edits a sale's rate
  // it is persisted on the row (d.rate). Until then, a freshly-completed
  // trip's deliveries carry rate = 0 from Trip Entry — fall back to the
  // trip's single Rate Entry rate for display so Shop Sales shows a real
  // amount immediately after "Save & Lock", without ever writing to
  // rate_entry or trip_deliveries from here.
  const persistedRate = num(row.rate);
  const rate = persistedRate > 0 ? persistedRate : num(row.re_rate);
  const weight = num(row.weight);
  const persistedAmount = num(row.amount);
  const amount = persistedRate > 0 && persistedAmount > 0 ? persistedAmount : Number((weight * rate).toFixed(2));

  const tripForWindow = {
    status: tripStatus,
    deleted: tripDeleted,
    approvedAt,
    tripDate,
  };

  return {
    id: num(row.id),
    saleNo: str(row.sale_no),
    saleDate: tripDate,
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    birdTypeId: row.bird_type_id == null ? null : num(row.bird_type_id),
    birdType: str(row.bird_type),
    tripId: row.trip_id == null ? null : num(row.trip_id),
    tripNo: str(row.trip_no),
    vehicleNo: row.vehicle_no == null ? null : str(row.vehicle_no),
    farmName: row.source_farm == null ? null : str(row.source_farm),
    birds: num(row.birds),
    weight,
    rate,
    amount,
    mortality: num(row.mortality),
    remarks: str(row.remarks),
    status: tripToOpsStatus(tripStatus, tripDeleted),
    deleted: saleDeleted,
    deletedReason: row.deleted_reason == null ? null : str(row.deleted_reason),
    tripDeleted,
    editable: !saleDeleted && isTripEditable(tripForWindow),
    windowExpiresAt: tripStatus === "Completed" ? editWindowExpiresAt(tripForWindow).toISOString() : null,
    approvedBy: row.approved_by == null ? null : str(row.approved_by),
    approvedAt,
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

const SALE_SELECT = `
  SELECT d.*,
         t.trip_no, t.trip_date, t.status AS trip_status, t.deleted AS trip_deleted,
         t.approved_by, t.approved_at, t.vehicle_no, t.source_farm,
         re.rate AS re_rate
  FROM trip_deliveries d
  INNER JOIN trips t ON t.id = d.trip_id
  LEFT JOIN rate_entry re ON re.trip_id = t.id
`;

/**
 * The trip's bird/weight capacity for Shop Sales validation.
 *
 * Step 3 Pickup (`total_birds`, `dc_weight`) is the authoritative,
 * mandatory-before-Completion source — every Completed trip has these set
 * (pickup_step_submitted is required by assertTripReadyForCompletion). Step
 * 2 Farm-load fields (`farm_bird_count`, `farm_load_weight`) were added
 * later and are not consistently populated on older trips; when they ARE
 * genuinely set (>0) they take precedence, exactly mirroring the same
 * farmBirdCount ?? totalBirds / farmLoadWeight ?? dcWeight fallback
 * `computeTripKpis()` (tripCalculations.ts) already uses at Trip Entry
 * time — this is not a new business rule, just applying the existing one
 * consistently to Shop Sales.
 */
async function lockTrip(client: Client, tripId: number): Promise<TripRow> {
  const result = await client.query(
    `SELECT id, trip_no, status, deleted, approved_at, trip_date,
            farm_bird_count, farm_load_weight, total_birds, dc_weight
       FROM trips WHERE id = $1 FOR UPDATE`,
    [tripId]
  );
  if (!result.rowCount) throw new AppError(404, `Trip ${tripId} not found`);
  const row = result.rows[0];
  const farmBirdCount = num(row.farm_bird_count);
  const farmLoadWeight = num(row.farm_load_weight);
  const totalBirds = num(row.total_birds);
  const dcWeight = num(row.dc_weight);
  return {
    id: num(row.id),
    tripNo: str(row.trip_no),
    status: str(row.status),
    deleted: Boolean(row.deleted),
    approvedAt: isoOrNull(row.approved_at),
    tripDate: dateOnly(row.trip_date) ?? "",
    capacityBirds: farmBirdCount > 0 ? farmBirdCount : totalBirds,
    capacityWeight: farmLoadWeight > 0 ? farmLoadWeight : dcWeight,
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

/**
 * Shop sales are trip_deliveries rows (+ parent trip). No separate
 * shop_sales table — deliberately reusing the existing Trip → Delivery
 * relationship instead of duplicating it (see 023_shop_sales_hardening.sql).
 */
export const shopSalesService = {
  async list(
    filters: {
      shopId?: number;
      fromDate?: string;
      toDate?: string;
      status?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<ShopSale[] | PaginatedResult<ShopSale>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    // Historical requirement: sales for a deleted trip must remain visible
    // (they are the accounting record) — only a sale's own `deleted` flag
    // (soft-deleted within the edit window) is filtered by default.
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
    if (filters.status) {
      if (filters.status === "Approved") clauses.push(`t.status = 'Completed'`);
      else if (filters.status === "Pending Approval") clauses.push(`t.status = 'Pending'`);
      else if (filters.status === "Deleted") clauses.push(`(t.status = 'Deleted' OR t.deleted = TRUE)`);
      else if (filters.status === "Draft") clauses.push(`t.status = 'Draft'`);
      else if (filters.status === "Rejected") clauses.push(`FALSE`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

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
         ORDER BY t.trip_date DESC, d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapDeliverySale), total, filters.pagination);
    }

    const result = await query(
      `${SALE_SELECT} ${where} ORDER BY t.trip_date DESC, d.id DESC`,
      params
    );
    return result.rows.map(mapDeliverySale);
  },

  async getById(id: number) {
    const result = await query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
    if (!result.rowCount) throw new AppError(404, "Shop sale not found");
    return mapDeliverySale(result.rows[0]);
  },

  async create(body: unknown) {
    const data = parseBody(shopSaleBodySchema, body);
    if (!data.tripId) {
      throw new AppError(400, "tripId is required (sales are stored on trip_deliveries)");
    }

    return withTransaction(async (client) => {
      try {
        const trip = await lockTrip(client, data.tripId as number);
        assertTripEditable(trip);
        assertTripCompletedForShopSales(trip);
        // Shop is a mandatory reference — a sale with no shop is not a
        // valid accounting record (Shop is also immutable once created,
        // so it must be right from the start).
        if (data.shopId == null) {
          throw new AppError(400, "shopId is required to create a Shop Sale");
        }
        await assertShopExists(data.shopId, client);
        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        const birds = data.birds ?? 0;
        const weight = data.weight ?? 0;
        const mortalityCount = data.mortality ?? 0;
        // Shop Sales doesn't carry a mortality-weight input — a new row
        // starts at 0 mort_kg (only Trip Step 4 ever sets it).
        const mortalityWeight = 0;

        // Duplicate-submission guard: a network retry or accidental
        // double-click resubmitting the exact same create request must not
        // silently produce two Shop Sale rows for the same delivery.
        const duplicate = await client.query(
          `SELECT id FROM trip_deliveries
            WHERE trip_id = $1 AND shop_id = $2 AND birds = $3 AND weight = $4
              AND deleted = FALSE AND created_at > NOW() - INTERVAL '5 seconds'
            LIMIT 1`,
          [trip.id, data.shopId, birds, weight]
        );
        if (duplicate.rowCount) {
          throw new AppError(
            409,
            `A matching Shop Sale was just created for this shop (id ${duplicate.rows[0].id}) — ` +
              `not creating a duplicate. Refresh and edit the existing sale instead.`
          );
        }

        // Farm capacity is consumed by delivered birds/weight AND
        // mortality together — a bird either reaches a shop or is recorded
        // as mortality, but either way it came out of the farm load.
        const existing = await sumActiveDeliveries(client, trip.id);
        assertWithinCapacity({
          label: "birds",
          available: trip.capacityBirds,
          alreadyAllocated: existing.birds + existing.mortalityCount,
          requested: birds + mortalityCount,
        });
        assertWithinCapacity({
          label: "weight",
          available: trip.capacityWeight,
          alreadyAllocated: existing.weight + existing.mortalityWeight,
          requested: weight + mortalityWeight,
        });

        // Fall back to the persisted Rate Entry for this trip when the
        // caller doesn't supply a rate explicitly.
        let rate = data.rate;
        if (rate == null) {
          const rateRow = await client.query<{ rate: string }>(
            `SELECT rate FROM rate_entry WHERE trip_id = $1`,
            [trip.id]
          );
          rate = rateRow.rowCount ? Number(rateRow.rows[0].rate) : 0;
        }
        // amount is always server-computed — client-supplied amount is never read.
        const amount = Number((weight * rate).toFixed(2));
        const saleNo = await generateSaleNo(client, trip.id, trip.tripNo);

        const result = await client.query(
          `INSERT INTO trip_deliveries (
             trip_id, sale_no, shop_id, shop_name, bird_type_id, bird_type,
             birds, weight, mortality, rate, amount, remarks
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
            data.remarks ?? "",
          ]
        );
        const saleId = num(result.rows[0].id);
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

    return withTransaction(async (client) => {
      try {
        const tripId = await getDeliveryTripId(client, id);
        const trip = await lockTrip(client, tripId);
        assertTripEditable(trip);
        assertTripCompletedForShopSales(trip);

        const currentResult = await client.query<{
          birds: number;
          weight: number;
          rate: string;
          mortality: number;
          mort_kg: string;
        }>(
          `SELECT birds, weight, rate, mortality, mort_kg FROM trip_deliveries WHERE id = $1 AND deleted = FALSE FOR UPDATE`,
          [id]
        );
        if (!currentResult.rowCount) throw new AppError(404, "Shop sale not found");
        const current = currentResult.rows[0];

        if (data.birdTypeId != null) await assertBirdTypeExists(data.birdTypeId, client);

        const birds = data.birds ?? num(current.birds);
        const weight = data.weight ?? num(current.weight);
        const rate = data.rate ?? Number(current.rate ?? 0);
        const mortalityCount = data.mortality ?? num(current.mortality);
        // mort_kg isn't editable via Shop Sales — carry the row's existing
        // value forward into the capacity check unchanged.
        const mortalityWeight = num(current.mort_kg);

        // Exclude this row entirely from "others", then add back its own
        // (possibly edited) birds/weight/mortality — farm capacity is
        // consumed by delivered + mortality together, same as create().
        const others = await sumActiveDeliveries(client, trip.id, id);
        assertWithinCapacity({
          label: "birds",
          available: trip.capacityBirds,
          alreadyAllocated: others.birds + others.mortalityCount,
          requested: birds + mortalityCount,
        });
        assertWithinCapacity({
          label: "weight",
          available: trip.capacityWeight,
          alreadyAllocated: others.weight + others.mortalityWeight,
          requested: weight + mortalityWeight,
        });

        // amount is always server-computed — client-supplied amount is
        // never read. shopId/shopName are intentionally not accepted here:
        // the data model has no safe way to reassign a delivery to a
        // different shop, so Shop is immutable once created.
        const amount = Number((weight * rate).toFixed(2));

        const result = await client.query(
          `UPDATE trip_deliveries SET
             bird_type_id = COALESCE($2, bird_type_id),
             bird_type = COALESCE($3, bird_type),
             birds = $4,
             weight = $5,
             rate = $6,
             amount = $7,
             mortality = COALESCE($8, mortality),
             remarks = COALESCE($9, remarks)
           WHERE id = $1
           RETURNING id`,
          [
            id,
            data.birdTypeId ?? null,
            data.birdType ?? null,
            birds,
            weight,
            rate,
            amount,
            data.mortality ?? null,
            data.remarks ?? null,
          ]
        );
        if (!result.rowCount) throw new AppError(404, "Shop sale not found");

        await recalcTripDeliveryTotals(client, trip.id);
        const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
        return mapDeliverySale(row.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  async updateStatus(id: number, body: unknown) {
    const status = String((body as { status?: string })?.status ?? "");
    assertOpsStatus(status);
    const tripStatus = opsToTripStatus(status);
    const patch = body as { approvedBy?: string; reason?: string };

    return withTransaction(async (client) => {
      const tripId = await getDeliveryTripId(client, id);
      const trip = await lockTrip(client, tripId);
      assertTripEditable(trip);
      // NOTE: unlike create/update/softDelete, this legacy endpoint is not
      // gated on trip.status === 'Completed' — its "Completed"/other
      // branches exist specifically to transition a trip INTO those
      // statuses, so requiring Completed first would make that impossible.
      // See audit report: this endpoint is unused by the current frontend
      // and mutates the parent Trip's status rather than sale data.

      if (tripStatus === "Deleted") {
        await client.query(
          `UPDATE trip_deliveries SET deleted = TRUE, deleted_at = NOW(), deleted_reason = $2 WHERE id = $1`,
          [id, patch.reason ?? null]
        );
        await recalcTripDeliveryTotals(client, trip.id);
      } else if (tripStatus === "Completed") {
        await client.query(
          `UPDATE trips SET status = 'Completed', deleted = FALSE,
             approved_by = COALESCE($2, approved_by), approved_at = NOW()
           WHERE id = $1`,
          [tripId, patch.approvedBy ?? "system"]
        );
      } else {
        await client.query(`UPDATE trips SET status = $2::trip_status, deleted = FALSE WHERE id = $1`, [
          tripId,
          tripStatus,
        ]);
      }

      const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
      return mapDeliverySale(row.rows[0]);
    });
  },

  /** Soft-delete only — birds/weight/rate/amount are preserved for the
   * historical accounting record, never zeroed out. Allowed only within the
   * 10-day edit window. */
  async softDelete(id: number, reason?: string) {
    return withTransaction(async (client) => {
      const tripId = await getDeliveryTripId(client, id);
      const trip = await lockTrip(client, tripId);
      assertTripEditable(trip);
      assertTripCompletedForShopSales(trip);

      const result = await client.query(
        `UPDATE trip_deliveries SET deleted = TRUE, deleted_at = NOW(), deleted_reason = $2
         WHERE id = $1 AND deleted = FALSE
         RETURNING id`,
        [id, reason ?? null]
      );
      if (!result.rowCount) throw new AppError(404, "Shop sale not found");

      await recalcTripDeliveryTotals(client, trip.id);
      const row = await client.query(`${SALE_SELECT} WHERE d.id = $1`, [id]);
      return mapDeliverySale(row.rows[0]);
    });
  },
};
