import { query } from "../config/db.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import type { PaginatedResult, PaginationParams } from "../utils/pagination.js";

/**
 * Shop Ledger — authoritative read-side service over the single source of
 * truth (`shop_ledger`). Exposes the COMPLETE historical ledger for a shop
 * (or all shops) over a custom date range, with a backend-computed opening
 * balance and per-row running balance.
 *
 * Financial convention (unchanged from the write-side engine shopLedger.ts):
 *
 *     current_balance = opening_balance + Σ(debit) − Σ(credit)
 *
 * For a filtered range the "balance at the start of the range" is therefore:
 *
 *     opening = shop.opening_balance + Σ(debit − credit) with entry_date < fromDate
 *
 * Running balance then steps through the in-range rows in (entry_date, id)
 * order. The window runs over the FULL filtered dataset BEFORE pagination is
 * applied, so paged responses still carry financially correct balances
 * (Phase 10 — never computed from the 10/50/… displayed rows only).
 */

/**
 * Ledger entry types and reference types.
 */

export type LedgerEntryType = "sale" | "collection" | "correction";
export type LedgerReferenceType = "trip" | "shop_sale" | "collection";

/**
 * Reference information for a ledger entry.
 */

export interface LedgerRef {
  entryDate: string; // YYYY-MM-DD (authoritative server-derived date)
  entryType: LedgerEntryType;
  referenceType: LedgerReferenceType;
  referenceId: number;
  note?: string;
}

/**
 * Shop balance interface.
 */

export interface ShopBalance {
  shopId: number;
  shopName: string;
  status: string;
  openingBalance: number;
  currentBalance: number;
}

/**
 * Cumulative quantities per shop for the selected date range.
 * Identity always comes from shops.id; mutable delivery/ledger names are display data only.
 * Active shops are the driving table, so shops with no period activity remain visible
 * with zero quantities and a financially correct carried balance.
 * Ghost rows (e.g. Z.STOCK) are eliminated because we drive from shops WHERE status = 'Active'.
 */

export interface ShopLedgerLoadBreakdown {
  load: number;
  birds: number;
  weight: number;
  mortalityBirds: number;
  mortalityWeight: number;
  weightLoss: number;
}

export interface ShopLedgerCumulativeQuantity {
  shopId: number;
  shopName: string;
  birds: number;
  weight: number;
  mortalityBirds: number;
  mortalityWeight: number;
  weightLoss: number;
  mortalityByLoad: Array<{ load: number; boxBirds: number; boxWeight: number; weightModeBirds: number }>;
  /** Per-load delivered/mortality/weight-loss actuals. Same normalized rows
   *  as the shop totals, grouped by load — sums across loads equal the
   *  shop totals. Legacy (leg-less) deliveries always sit on Load 1. */
  deliveriesByLoad: ShopLedgerLoadBreakdown[];
}

/**
 * One row of the cumulative response, as seen by the caller (cumulative method).
 */

export interface ShopLedgerCumulativeRow {
  shopId: number;
  shopName: string;
  status: string;
  birds: number;
  weight: number;
  mortalityBirds: number;
  mortalityWeight: number;
  weightLoss: number;
  mortalityByLoad: Array<{ load: number; boxBirds: number; boxWeight: number; weightModeBirds: number }>;
  deliveriesByLoad: ShopLedgerLoadBreakdown[];
  openingBalance: number;
  sale: number;
  approvedCollection: number;
  closingBalance: number;
}

export interface ShopLedgerRow {
  id: number;
  shopId: number | null;
  shopName: string;
  subShopName: string;
  remarks: string;
  date: string;
  type: LedgerEntryType;
  referenceType: string;
  referenceId: number;
  referenceNo: string;
  loadLabel: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  birds: number;
  weight: number;
  farmBirds: number;
  farmWeight: number;
  mortalityBirds: number;
  mortalityWeight: number;
  weightLoss: number;
  rate: number;
  paymentMode: string | null;
  status: string | null;
  createdAt: string | null;
}

export interface ShopLedgerResponse {
  shopId: number | null;
  shopName: string;
  openingBalance: number;
  openingBalances?: Array<{ shopId: number; shopName: string; openingBalance: number }>;
  data: ShopLedgerRow[];
  meta?: PaginatedResult<unknown>["meta"];
}

function mapRow(row: Record<string, unknown>, openingBalance: number): ShopLedgerRow {
  const referenceType = str(row.reference_type);
  // Keep adjustments visible as adjustments.  Coercing them to "sale" made
  // an amount-only correction look like a second chicken delivery (0 birds,
  // 0 kg) in the Shop Ledger.
  const type = str(row.entry_type) as LedgerEntryType;
  const weight = num(row.weight);
  const mortalityWeight = num(row.mortality_weight);
  const farmWeight = Math.max(num(row.farm_weight), weight + mortalityWeight);
  return {
    id: num(row.id), shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name), subShopName: str(row.sub_shop_name),
    remarks: str(row.delivery_remarks), date: dateOnly(row.entry_date) ?? "",
    type, referenceType, referenceId: num(row.reference_id),
    referenceNo: str(row.ref_no), loadLabel: str(row.load_label),
    description: str(row.note), debit: num(row.debit), credit: num(row.credit),
    balance: openingBalance + num(row.running), birds: num(row.birds), weight,
    farmBirds: num(row.birds) + num(row.mortality_birds), farmWeight,
    mortalityBirds: num(row.mortality_birds), mortalityWeight,
    weightLoss: Math.max(0, farmWeight - weight - mortalityWeight), rate: num(row.rate),
    paymentMode: row.payment_mode == null ? null : str(row.payment_mode),
    status: row.collection_status == null ? null : str(row.collection_status),
    createdAt: row.created_at == null ? null : str(row.created_at),
  };
}

const DATA_SELECT = `
  WITH txs AS (
    SELECT l.id, l.shop_id, l.entry_date, l.entry_type, l.reference_type,
           l.reference_id, l.debit, l.credit, l.note, l.created_at, s.shop_name,
           COALESCE(NULLIF(dd.sale_no, ''), NULLIF(tt.trip_no, ''), NULLIF(c.collection_no, ''), '') AS ref_no,
           COALESCE(dd.sub_shop_name, '') AS sub_shop_name,
           COALESCE(dd.remarks, '') AS delivery_remarks,
           CASE WHEN dd.leg_id IS NULL THEN '' ELSE 'Load ' || COALESCE(tl.leg_index, 1)::text END AS load_label,
           COALESCE(dd.birds, dt.birds, 0)::numeric AS birds,
           COALESCE(dd.weight, dt.weight, 0)::numeric AS weight,
           COALESCE(dd.rate, dt.rate, 0)::numeric AS rate,
           COALESCE(dd.mortality, dt.mortality_birds, 0)::numeric AS mortality_birds,
           COALESCE(CASE WHEN dd.delivery_mode = 'weight' THEN 0 ELSE dd.mort_kg END, dt.mortality_weight, 0)::numeric AS mortality_weight,
           COALESCE(dd.farm_birds, tl.total_birds, dt.farm_birds, tt.total_birds, 0)::numeric AS farm_birds,
           COALESCE(dd.farm_weight, tl.dc_weight, dt.farm_weight, tt.dc_weight, 0)::numeric AS farm_weight,
           c.payment_mode, c.status AS collection_status
      FROM shop_ledger l
      JOIN shops s ON s.id = l.shop_id
      LEFT JOIN trips tt ON l.reference_type = 'trip' AND tt.id = l.reference_id
      -- A correction/reversal is a financial adjustment only.  It must not
      -- borrow the source delivery's birds/weight/rate, otherwise one Shop
      -- Sale appears again as a second delivery in the ledger totals.
      LEFT JOIN trip_deliveries dd ON l.reference_type = 'shop_sale'
        AND l.entry_type = 'sale' AND l.debit > 0
        AND dd.id = l.reference_id
      LEFT JOIN trip_legs tl ON tl.id = dd.leg_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(d3.birds), 0)::numeric AS birds,
               COALESCE(SUM(d3.weight), 0)::numeric AS weight,
               COALESCE(MAX(d3.rate), 0)::numeric AS rate,
               COALESCE(SUM(d3.mortality), 0)::numeric AS mortality_birds,
               COALESCE(SUM(CASE WHEN d3.delivery_mode = 'weight' THEN 0 ELSE d3.mort_kg END), 0)::numeric AS mortality_weight,
               COALESCE(SUM(d3.farm_birds), 0)::numeric AS farm_birds,
               COALESCE(SUM(d3.farm_weight), 0)::numeric AS farm_weight
          FROM trip_deliveries d3
         WHERE d3.trip_id = l.reference_id AND d3.shop_id = l.shop_id
           AND COALESCE(d3.deleted, FALSE) = FALSE
      ) dt ON l.reference_type = 'trip'
        AND l.entry_type = 'sale' AND l.debit > 0
        -- Legacy rate-lock rows have a trip reference rather than a delivery
        -- reference. Show that trip's delivery quantities only once for the
        -- shop; later debit/correction rows remain financial adjustments.
        AND l.id = (
          SELECT MIN(l2.id)
            FROM shop_ledger l2
           WHERE l2.shop_id = l.shop_id
             AND l2.reference_type = 'trip'
             AND l2.reference_id = l.reference_id
             AND l2.entry_type = 'sale'
             AND l2.debit > 0
        )
      LEFT JOIN collections c ON l.reference_type = 'collection' AND c.id = l.reference_id
     WHERE ($1::int IS NULL OR l.shop_id = $1::int)
       AND ($2::date IS NULL OR l.entry_date >= $2::date)
       AND ($3::date IS NULL OR l.entry_date <= $3::date)
       -- Legacy correction rows are deliberately excluded. Migration 097
       -- folds/removes them; this guard keeps a partially migrated database
       -- from displaying fake zero-quantity sales in the meantime.
       AND l.entry_type <> 'correction'
  )
  SELECT t.*, SUM(t.debit - t.credit) OVER (ORDER BY t.entry_date, t.id)::numeric AS running
    FROM txs t ORDER BY t.entry_date, t.id`;

const COUNT_SELECT = `SELECT COUNT(*)::text AS c FROM shop_ledger l
  WHERE ($1::int IS NULL OR l.shop_id = $1::int)
    AND ($2::date IS NULL OR l.entry_date >= $2::date)
    AND ($3::date IS NULL OR l.entry_date <= $3::date)
    AND l.entry_type <> 'correction'`;

async function computePerShopOpeningBalances(fromDate?: string) {
  const result = await query<{ shop_id: string; shop_name: string; opening_balance: string }>(
    `SELECT s.id::text AS shop_id, s.shop_name,
            (s.opening_balance + COALESCE(SUM(l.debit - l.credit), 0))::text AS opening_balance
       FROM shops s LEFT JOIN shop_ledger l ON l.shop_id = s.id
        AND ($1::date IS NULL OR l.entry_date < $1::date)
      GROUP BY s.id, s.shop_name, s.opening_balance ORDER BY s.shop_name, s.id`,
    [fromDate ?? null],
  );
  return result.rows.map((row) => ({ shopId: num(row.shop_id), shopName: str(row.shop_name), openingBalance: num(row.opening_balance) }));
}

async function computeOpeningBalance(shopId?: number, fromDate?: string) {
  if (shopId != null) {
    const shop = await query<{ id: string; shop_name: string; opening_balance: string }>(
      `SELECT id, shop_name, opening_balance FROM shops WHERE id = $1`, [shopId]);
    if (!shop.rowCount) return { shopId, shopName: "", openingBalance: 0 };
    const before = await query<{ n: string }>(
      `SELECT COALESCE(SUM(debit - credit), 0)::text AS n FROM shop_ledger
        WHERE shop_id = $1 AND ($2::date IS NULL OR entry_date < $2::date)`, [shopId, fromDate ?? null]);
    return { shopId, shopName: str(shop.rows[0].shop_name), openingBalance: num(shop.rows[0].opening_balance) + num(before.rows[0]?.n) };
  }
  const openings = await query<{ n: string }>(`SELECT COALESCE(SUM(opening_balance), 0)::text AS n FROM shops`);
  const before = await query<{ n: string }>(
    `SELECT COALESCE(SUM(debit - credit), 0)::text AS n FROM shop_ledger
      WHERE ($1::date IS NULL OR entry_date < $1::date)`, [fromDate ?? null]);
  return { shopId: null, shopName: "", openingBalance: num(openings.rows[0]?.n) + num(before.rows[0]?.n) };
}

/**
 * Shop Ledger — authoritative read-side service over the single source of
 * truth (`shop_ledger`). Exposes the COMPLETE historical ledger for a shop
 * (or all shops) over a custom date range, with a backend-computed opening
 * balance and per-row running balance.
 *
 * Financial convention (unchanged from the write-side engine shopLedger.ts):
 *
 *     current_balance = opening_balance + Σ(debit) − Σ(credit)
 *
 * For a filtered range the "balance at the start of the range" is therefore:
 *
 *     opening = shop.opening_balance + Σ(debit − credit) with entry_date < fromDate
 *
 * Running balance then steps through the in-range rows in (entry_date, id)
 * order. The window runs over the FULL filtered dataset BEFORE pagination is
 * applied, so paged responses still carry financially correct balances
 * (Phase 10 — never computed from the 10/50/… displayed rows only).
 */

export const shopLedgerService = {
  /**
   * One backend-authoritative cumulative response. Identity always comes from
   * shops.id; mutable delivery/ledger names are display data only. Active
   * shops are the driving table, so shops with no period activity remain
   * visible with zero quantities and a financially correct carried balance.
   */
  async cumulative(filters: {
    shopId?: number;
    fromDate?: string;
    toDate?: string;
    reportType?: "all" | "sales" | "collection";
  } = {}): Promise<ShopLedgerCumulativeRow[]> {
    const [shopsResult, ledger, quantities, salesResult] = await Promise.all([
      query<{ id: number; shop_name: string; status: string }>(
        `SELECT id, shop_name, status
           FROM shops
         WHERE ($1::bigint IS NULL OR id = $1::bigint)
           -- Retain current active shops plus shops with genuine report-period
           -- activity. A stale correction alone must never create a Z.STOCK
           -- row, but historical Shop Sales must not disappear if a master
           -- status changed after the sale.
           AND (
             status = 'Active'
             OR EXISTS (
               SELECT 1 FROM trip_deliveries d
                 JOIN trips t ON t.id = d.trip_id
                WHERE d.shop_id = shops.id
                  AND t.status = 'Completed'
                  AND COALESCE(t.deleted, FALSE) = FALSE
                  AND COALESCE(t.rate_completed, FALSE) = TRUE
                  AND COALESCE(d.deleted, FALSE) = FALSE
                  AND ($2::date IS NULL OR t.trip_date >= $2::date)
                  AND ($3::date IS NULL OR t.trip_date <= $3::date)
             )
           )
         ORDER BY LOWER(shop_name), id`,
        [filters.shopId ?? null, filters.fromDate ?? null, filters.toDate ?? null],
      ),
      this.list({
        shopId: filters.shopId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      }),
      this.cumulativeQuantities({
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      }),
      // Use the identical eligibility rules and current amount field as Shop
      // Sales. The cumulative sale total must never depend on an old ledger
      // amount left behind before a Shop Sale was edited.
      query<{ shop_id: string; sale: string }>(
        `SELECT d.shop_id::text, COALESCE(SUM(d.amount), 0)::text AS sale
           FROM trip_deliveries d
           JOIN trips t ON t.id = d.trip_id
          WHERE t.status = 'Completed'
            AND COALESCE(t.deleted, FALSE) = FALSE
            AND COALESCE(t.rate_completed, FALSE) = TRUE
            AND COALESCE(d.deleted, FALSE) = FALSE
            AND d.shop_id IS NOT NULL
            AND ($1::date IS NULL OR t.trip_date >= $1::date)
            AND ($2::date IS NULL OR t.trip_date <= $2::date)
            AND ($3::bigint IS NULL OR d.shop_id = $3::bigint)
          GROUP BY d.shop_id`,
        [filters.fromDate ?? null, filters.toDate ?? null, filters.shopId ?? null],
      ),
    ]);

    const openingByShop = new Map(
      (ledger.openingBalances ?? (ledger.shopId == null ? [] : [{
        shopId: ledger.shopId,
        shopName: ledger.shopName,
        openingBalance: ledger.openingBalance,
      }])).map((row) => [row.shopId, row.openingBalance]),
    );
    const activity = new Map<number, { collection: number }>();
    for (const row of ledger.data) {
      if (row.shopId == null) continue;
      const current = activity.get(row.shopId) ?? { collection: 0 };
      if (row.type === "collection" || row.referenceType === "collection") {
        current.collection += row.credit - row.debit;
      }
      activity.set(row.shopId, current);
    }
    const saleByShop = new Map(salesResult.rows.map((row) => [num(row.shop_id), num(row.sale)]));
    const quantityByShop = new Map(quantities.map((row) => [row.shopId, row]));
    const reportType = filters.reportType ?? "all";

    return shopsResult.rows.map((shop) => {
      const openingBalance = num(openingByShop.get(num(shop.id)));
      const period = activity.get(num(shop.id)) ?? { collection: 0 };
      const sale = reportType === "collection" ? 0 : (saleByShop.get(num(shop.id)) ?? 0);
      const approvedCollection = reportType === "sales" ? 0 : period.collection;
      const quantity = reportType === "collection" ? undefined : quantityByShop.get(num(shop.id));
      return {
        shopId: num(shop.id),
        shopName: str(shop.shop_name),
        status: str(shop.status),
        birds: quantity?.birds ?? 0,
        weight: quantity?.weight ?? 0,
        mortalityBirds: quantity?.mortalityBirds ?? 0,
        mortalityWeight: quantity?.mortalityWeight ?? 0,
        weightLoss: quantity?.weightLoss ?? 0,
        mortalityByLoad: quantity?.mortalityByLoad ?? [],
        deliveriesByLoad: quantity?.deliveriesByLoad ?? [],
        openingBalance,
        sale,
        approvedCollection,
        closingBalance: Math.round((openingBalance + sale - approvedCollection) * 100) / 100,
      };
    });
  },

  /**
   * Backend-authoritative cumulative quantities query.
   * Uses shops WHERE status = 'Active' as the driving table so that:
   *   - Every Active shop appears, even with zero activity (zero-activity shop)
   *   - Ghost rows like Z.STOCK cannot appear (driven by shop_id, not shop_name)
   *   - All quantities are grouped by trip's shop_id (authoritative), not shop_name from deliveries
   */
  async cumulativeQuantities(filters: { fromDate?: string; toDate?: string } = {}): Promise<ShopLedgerCumulativeQuantity[]> {
    // Step 1: Get all Active shops from the master — this is the authoritative
    // source of shop identity. Using shop_name from trip_deliveries would let
    // stale entries (e.g. Z.STOCK) appear even when the trip's shop_id is valid.
    const allShopsResult = await query<{ id: number; shop_name: string }>(
      `SELECT id, shop_name FROM shops WHERE status = 'Active' ORDER BY shop_name, id`
    );
    const activeShopRows = allShopsResult.rows;
    const activeShopIds = new Set(activeShopRows.map((r) => num(r.id)));
    const shopNameMap = new Map(
      activeShopRows.map((r) => [num(r.id), str(r.shop_name)])
    );

    // Step 2: Compute delivery quantities from trips/deliveries, grouped by
    // the trip's shop_id (authoritative), not by shop_name from deliveries.
    // The per-load breakdown reuses the exact same normalized CTE chain as
    // the shop totals, only grouped by (shop, load) — so per-load actuals
    // always sum back to the shop totals and nothing is double-counted.
    const deliveryCtes = (extraSelect: string, extraGroup: string) => `WITH delivery_by_load_shop AS (
           SELECT t.id AS trip_id, COALESCE(d.leg_id, 0) AS load_key,
                  COALESCE(tl.leg_index, 1)::int AS load_no,
                  d.shop_id AS trip_shop_id,
                  COALESCE(NULLIF(BTRIM(d.sub_shop_name), ''), '') AS sub_shop_name,
                  SUM(d.birds)::numeric AS raw_birds,
                  SUM(d.weight)::numeric AS raw_weight,
                  SUM(d.mortality)::numeric AS mortality_birds,
                  SUM(CASE WHEN d.delivery_mode = 'weight' THEN 0 ELSE d.mort_kg END)::numeric AS mortality_weight,
                  MAX(COALESCE(tl.total_birds, t.total_birds))::numeric AS farm_birds,
                  MAX(COALESCE(tl.dc_weight, t.dc_weight))::numeric AS farm_weight
            FROM trips t
            JOIN trip_deliveries d ON d.trip_id = t.id
            LEFT JOIN trip_legs tl ON tl.id = d.leg_id
           WHERE t.status = 'Completed' AND COALESCE(t.deleted, FALSE) = FALSE
             AND COALESCE(t.rate_completed, FALSE) = TRUE
             AND COALESCE(d.deleted, FALSE) = FALSE
             AND (d.leg_id IS NULL OR tl.pickup_step_submitted = TRUE)
             AND ($1::date IS NULL OR t.trip_date >= $1::date)
             AND ($2::date IS NULL OR t.trip_date <= $2::date)
           GROUP BY t.id, COALESCE(d.leg_id, 0), COALESCE(tl.leg_index, 1),
                    d.shop_id, COALESCE(NULLIF(BTRIM(d.sub_shop_name), ''), '')
        ), load_totals AS (
          SELECT trip_id, load_key,
                 SUM(raw_birds) AS raw_birds,
                 SUM(raw_weight) AS raw_weight,
                 SUM(mortality_birds) AS mortality_birds,
                 SUM(mortality_weight) AS mortality_weight,
                 MAX(farm_birds) AS farm_birds,
                 MAX(farm_weight) AS farm_weight
            FROM delivery_by_load_shop GROUP BY trip_id, load_key
        ), normalized AS (
          SELECT d.trip_id, d.load_key, d.load_no, d.trip_shop_id,
                 d.raw_birds, d.raw_weight, d.mortality_birds, d.mortality_weight,
                 GREATEST(t.farm_birds - t.mortality_birds, 0) *
                   CASE WHEN t.raw_birds > 0 THEN d.raw_birds / t.raw_birds ELSE 0 END AS birds,
                 LEAST(t.raw_weight, GREATEST(t.farm_weight - t.mortality_weight, 0)) *
                   CASE WHEN t.raw_weight > 0 THEN d.raw_weight / t.raw_weight ELSE 0 END AS weight,
                 d.mortality_birds AS per_load_mortality_birds,
                 d.mortality_weight AS per_load_mortality_weight,
                 GREATEST(t.farm_weight - t.mortality_weight -
                   LEAST(t.raw_weight, GREATEST(t.farm_weight - t.mortality_weight, 0)), 0) *
                   CASE WHEN t.raw_weight > 0 THEN d.raw_weight / t.raw_weight
                        WHEN COUNT(*) OVER (PARTITION BY d.trip_id, d.load_key) > 0
                        THEN 1::numeric / COUNT(*) OVER (PARTITION BY d.trip_id, d.load_key) ELSE 0 END AS weight_loss
            FROM delivery_by_load_shop d
            JOIN load_totals t USING (trip_id, load_key)
        )
        ${extraSelect}
        ${extraGroup}`;
    const [result, mortalityResult, perLoadResult] = await Promise.all([
      query<Record<string, unknown>>(
        deliveryCtes(
          `SELECT trip_shop_id AS shop_id,
               SUM(birds)::float AS birds, SUM(weight)::float AS weight,
               SUM(mortality_birds)::float AS mortality_birds,
               SUM(mortality_weight)::float AS mortality_weight,
               SUM(weight_loss)::float AS weight_loss
          FROM normalized`,
          `GROUP BY trip_shop_id`,
        ),
        [filters.fromDate ?? null, filters.toDate ?? null],
      ),
      query<Record<string, unknown>>(
        `SELECT d.shop_id,
                COALESCE(tl.leg_index, 1)::int AS load_no,
                COALESCE(SUM(CASE WHEN d.delivery_mode = 'weight' THEN 0 ELSE d.mortality END), 0)::float AS box_birds,
                COALESCE(SUM(CASE WHEN d.delivery_mode = 'weight' THEN 0 ELSE d.mort_kg END), 0)::float AS box_weight,
                COALESCE(SUM(CASE WHEN d.delivery_mode = 'weight' THEN d.mortality ELSE 0 END), 0)::float AS weight_mode_birds
           FROM trips t
           JOIN trip_deliveries d ON d.trip_id = t.id
           LEFT JOIN trip_legs tl ON tl.id = d.leg_id
          WHERE t.status = 'Completed'
            AND COALESCE(t.deleted, FALSE) = FALSE
            AND COALESCE(t.rate_completed, FALSE) = TRUE
            AND COALESCE(d.deleted, FALSE) = FALSE
            AND (d.leg_id IS NULL OR tl.pickup_step_submitted = TRUE)
            AND (\$1::date IS NULL OR t.trip_date >= \$1::date)
            AND (\$2::date IS NULL OR t.trip_date <= \$2::date)
          GROUP BY d.shop_id, COALESCE(tl.leg_index, 1)
          ORDER BY d.shop_id, load_no`,
        [filters.fromDate ?? null, filters.toDate ?? null],
      ),
      query<Record<string, unknown>>(
        deliveryCtes(
          `SELECT trip_shop_id AS shop_id, load_no,
               SUM(birds)::float AS birds, SUM(weight)::float AS weight,
               SUM(per_load_mortality_birds)::float AS mortality_birds,
               SUM(per_load_mortality_weight)::float AS mortality_weight,
               SUM(weight_loss)::float AS weight_loss
          FROM normalized`,
          `GROUP BY trip_shop_id, load_no ORDER BY trip_shop_id, load_no`,
        ),
        [filters.fromDate ?? null, filters.toDate ?? null],
      ),
    ]);

    // Step 3: Build a map from shop_id to computed quantities (from deliveries)
    const mortalityByShopMap = new Map<number, Array<{ load: number; boxBirds: number; boxWeight: number; weightModeBirds: number }>>();
    for (const row of mortalityResult.rows) {
      const shopId = num(row.shop_id);
      let loads = mortalityByShopMap.get(shopId) ?? [];
      loads.push({
        load: Math.max(1, num(row.load_no, 1)),
        boxBirds: Math.round(num(row.box_birds)),
        boxWeight: num(row.box_weight),
        weightModeBirds: Math.round(num(row.weight_mode_birds)),
      });
      mortalityByShopMap.set(shopId, loads);
    }

    const deliveriesByShopMap = new Map<number, ShopLedgerLoadBreakdown[]>();
    for (const row of perLoadResult.rows) {
      const shopId = num(row.shop_id);
      if (!activeShopIds.has(shopId)) continue; // skip non-active shop ids
      const loads = deliveriesByShopMap.get(shopId) ?? [];
      loads.push({
        load: Math.max(1, num(row.load_no, 1)),
        birds: Math.round(num(row.birds)),
        weight: num(row.weight),
        mortalityBirds: Math.round(num(row.mortality_birds)),
        mortalityWeight: num(row.mortality_weight),
        weightLoss: Math.max(0, num(row.weight_loss)),
      });
      deliveriesByShopMap.set(shopId, loads);
    }

    const quantitiesByShop = new Map<number, ShopLedgerCumulativeQuantity>();
    for (const row of result.rows) {
      const shopId = num(row.shop_id);
      if (!activeShopIds.has(shopId)) continue; // skip non-active shop ids
      quantitiesByShop.set(shopId, {
        shopId,
        shopName: shopNameMap.get(shopId) ?? "",
        birds: num(row.birds), weight: num(row.weight),
        mortalityBirds: Math.round(num(row.mortality_birds)), mortalityWeight: num(row.mortality_weight),
        weightLoss: num(row.weight_loss),
        mortalityByLoad: mortalityByShopMap.get(shopId) ?? [],
        deliveriesByLoad: deliveriesByShopMap.get(shopId) ?? [],
      });
    }

    // Step 4: Ensure every Active shop appears, even those with no deliveries.
    // Shops with no delivery activity get zero quantities and their current
    // master shop name.
    const rows = activeShopRows.map((row) => {
      const shopId = num(row.id);
      const existing = quantitiesByShop.get(shopId);
      if (existing) {
        return {
          shopId,
          shopName: existing.shopName,
          birds: existing.birds,
          weight: existing.weight,
          mortalityBirds: existing.mortalityBirds,
          mortalityWeight: existing.mortalityWeight,
          weightLoss: existing.weightLoss,
          mortalityByLoad: existing.mortalityByLoad,
          deliveriesByLoad: existing.deliveriesByLoad,
        };
      }
      // Shop with zero activity in the selected range
      return {
        shopId,
        shopName: row.shop_name,
        birds: 0,
        weight: 0,
        mortalityBirds: 0,
        mortalityWeight: 0,
        weightLoss: 0,
        mortalityByLoad: [],
        deliveriesByLoad: [],
      };
    });

    // Step 5: Sort by shop name (stable, deterministic)
    return rows.sort((a, b) =>
      a.shopName.localeCompare(b.shopName, "en", { sensitivity: "base" })
    );
  },

  async list(filters: {
    shopId?: number;
    fromDate?: string;
    toDate?: string;
    pagination?: PaginationParams | null;
  } = {}): Promise<ShopLedgerResponse> {
    const shopId = filters.shopId;
    const fromDate = filters.fromDate;
    const toDate = filters.toDate;
    const base = [shopId ?? null, fromDate ?? null, toDate ?? null];

    const opening = await computeOpeningBalance(shopId, fromDate);
    const openingBalances = shopId == null
      ? await computePerShopOpeningBalances(fromDate)
      : undefined;

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(COUNT_SELECT, base);
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...base, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${DATA_SELECT}
         LIMIT $4 OFFSET $5`,
        pagedParams
      );
      return {
        ...opening,
        openingBalances,
        data: result.rows.map((row) => mapRow(row, opening.openingBalance)),
        meta: {
          total,
          page: filters.pagination.page,
          limit: filters.pagination.limit,
          totalPages: Math.max(1, Math.ceil(total / filters.pagination.limit)),
        },
      };
    }

    const result = await query(DATA_SELECT, base);
    return {
      ...opening,
      openingBalances,
      data: result.rows.map((row) => mapRow(row, opening.openingBalance)),
    };
  },
};
