import { query } from "../config/db.js";
import type { OperationsDashboard } from "../types/operations.js";

export type DashboardSummaryParams = {
  asOf?: string;
  fromDate?: string;
  toDate?: string;
};

/**
 * Dashboard KPIs from existing tables only:
 * trips, trip_deliveries, fuel_expenses, trip_diesel_entries
 * (vehicles/farms/shops available via FKs on those rows)
 *
 * fromDate/toDate (optional, inclusive) scope totals derived from completed
 * trips. todays/weekly/monthly stay relative to asOf (else toDate, else today).
 */
export const dashboardService = {
  async getSummary(params: DashboardSummaryParams | string = {}): Promise<OperationsDashboard> {
    // Back-compat: older callers passed a single asOf string.
    const opts: DashboardSummaryParams =
      typeof params === "string" ? { asOf: params } : params ?? {};
    const day =
      opts.asOf ?? opts.toDate ?? new Date().toISOString().slice(0, 10);
    const fromDate = opts.fromDate ?? null;
    const toDate = opts.toDate ?? null;

    const result = await query<{
      total_trips: string;
      total_weight: string;
      total_sales: string;
      total_collections: string;
      pending_collections: string;
      fuel_expenses: string;
      todays_trips: string;
      weekly_trips: string;
      monthly_trips: string;
      collections_by_mode: Array<{ name: string; value: number }> | string;
      collection_performance_by_shop: Array<{
        shopId: number | null;
        shopName: string;
        salesAmount: number;
        collectionAmount: number;
        outstandingAmount: number;
      }> | string;
    }>(
      `WITH completed_trips AS (
         SELECT *
         FROM trips t
         WHERE t.status = 'Completed'
           AND COALESCE(t.deleted, FALSE) = FALSE
       ),
       ranged_trips AS (
         -- Inclusive fromDate/toDate window for totals; unbound when both null.
         SELECT ct.*
         FROM completed_trips ct
         WHERE ($2::date IS NULL OR ct.trip_date >= $2::date)
           AND ($3::date IS NULL OR ct.trip_date <= $3::date)
       ),
       delivery_totals AS (
         -- The "is this trip's rate locked" signal is trips.rate_completed,
         -- written exclusively by rateEntryService.lock() - the exact signal
         -- Collections gates on, so this split can never disagree with
         -- Collections or Rate Entry/Shop Sales.
         SELECT
           COALESCE(SUM(d.amount), 0) AS total_sales,
           COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(rt.rate_completed, FALSE) = TRUE), 0) AS total_collections,
           COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(rt.rate_completed, FALSE) = FALSE), 0)
             AS pending_collections,
           COALESCE(SUM(d.weight), 0) AS delivery_weight
         FROM trip_deliveries d
         INNER JOIN ranged_trips rt ON rt.id = d.trip_id
         WHERE COALESCE(d.deleted, FALSE) = FALSE
       ),
       approved_collections AS (
         SELECT c.shop_id, COALESCE(NULLIF(BTRIM(c.shop_name), ''), s.shop_name, 'Unknown shop') AS shop_name,
                COALESCE(NULLIF(BTRIM(c.payment_mode), ''), 'Other') AS payment_mode,
                COALESCE(c.amount, c.amount_collected, 0)::numeric AS amount
         FROM collections c
         LEFT JOIN shops s ON s.id = c.shop_id
         WHERE c.status = 'Approved'
           AND COALESCE(c.deleted, FALSE) = FALSE
           AND COALESCE(c.is_financial, FALSE) = TRUE
           AND ($2::date IS NULL OR c.collection_date >= $2::date)
           AND ($3::date IS NULL OR c.collection_date <= $3::date)
       ),
       collection_totals AS (
         SELECT COALESCE(SUM(amount), 0) AS total_collections FROM approved_collections
       ),
       collections_by_mode AS (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('name', payment_mode, 'value', amount) ORDER BY amount DESC), '[]'::jsonb) AS rows
         FROM (SELECT payment_mode, SUM(amount)::float AS amount FROM approved_collections GROUP BY payment_mode) modes
       ),
       sales_by_shop AS (
         SELECT d.shop_id, COALESCE(NULLIF(BTRIM(d.shop_name), ''), s.shop_name, 'Unknown shop') AS shop_name,
                SUM(COALESCE(d.amount, 0))::numeric AS sales_amount
         FROM trip_deliveries d
         INNER JOIN ranged_trips rt ON rt.id = d.trip_id
         LEFT JOIN shops s ON s.id = d.shop_id
         WHERE COALESCE(d.deleted, FALSE) = FALSE
         GROUP BY d.shop_id, COALESCE(NULLIF(BTRIM(d.shop_name), ''), s.shop_name, 'Unknown shop')
       ),
       collections_by_shop AS (
         SELECT shop_id, shop_name, SUM(amount)::numeric AS collection_amount
         FROM approved_collections GROUP BY shop_id, shop_name
       ),
       collection_performance AS (
         SELECT COALESCE(sb.shop_id, cb.shop_id) AS shop_id,
                COALESCE(sb.shop_name, cb.shop_name) AS shop_name,
                COALESCE(sb.sales_amount, 0) AS sales_amount,
                COALESCE(cb.collection_amount, 0) AS collection_amount,
                GREATEST(COALESCE(sb.sales_amount, 0) - COALESCE(cb.collection_amount, 0), 0) AS outstanding_amount
         FROM sales_by_shop sb FULL OUTER JOIN collections_by_shop cb
           ON sb.shop_id IS NOT DISTINCT FROM cb.shop_id AND sb.shop_name = cb.shop_name
       ),
       collection_performance_json AS (
         SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'shopId', shop_id, 'shopName', shop_name, 'salesAmount', sales_amount,
           'collectionAmount', collection_amount, 'outstandingAmount', outstanding_amount
         ) ORDER BY sales_amount DESC, shop_name), '[]'::jsonb) AS rows
         FROM collection_performance
       ),
       trip_kpis AS (
         SELECT
           (SELECT COUNT(*)::text FROM ranged_trips) AS total_trips,
           (SELECT COALESCE(SUM(COALESCE(rt.total_weight, 0)), 0) FROM ranged_trips rt)
             AS weight_sum,
           COUNT(*) FILTER (WHERE ct.trip_date = $1::date)::text AS todays_trips,
           COUNT(*) FILTER (
             WHERE ct.trip_date >= ($1::date - INTERVAL '6 days')
               AND ct.trip_date <= $1::date
           )::text AS weekly_trips,
           COUNT(*) FILTER (
             WHERE date_trunc('month', ct.trip_date) = date_trunc('month', $1::date)
           )::text AS monthly_trips
         FROM completed_trips ct
       ),
       fuel_from_bills AS (
         SELECT COALESCE(SUM(f.amount), 0) AS amount
         FROM fuel_expenses f
         WHERE f.status = 'Approved'
           AND (
             -- No range: preserve all-time approved bills (prior behaviour).
             ($2::date IS NULL AND $3::date IS NULL)
             OR EXISTS (
               SELECT 1 FROM ranged_trips rt WHERE rt.id = f.trip_id
             )
             OR (
               f.trip_id IS NULL
               AND ($2::date IS NULL OR f.expense_date >= $2::date)
               AND ($3::date IS NULL OR f.expense_date <= $3::date)
             )
           )
       ),
       fuel_from_diesel AS (
         SELECT COALESCE(SUM(COALESCE(d.litres, 0) * COALESCE(d.rate, 0)), 0) AS amount
         FROM trip_diesel_entries d
         INNER JOIN ranged_trips rt ON rt.id = d.trip_id
         WHERE NOT EXISTS (
           SELECT 1 FROM fuel_expenses f WHERE f.trip_id = rt.id AND f.status = 'Approved'
         )
       )
       SELECT
         COALESCE(tk.total_trips, '0') AS total_trips,
         COALESCE(GREATEST(tk.weight_sum, dt.delivery_weight), 0)::text AS total_weight,
         COALESCE(dt.total_sales, 0)::text AS total_sales,
         COALESCE(ct.total_collections, 0)::text AS total_collections,
         GREATEST(COALESCE(dt.total_sales, 0) - COALESCE(ct.total_collections, 0), 0)::text AS pending_collections,
         (COALESCE(fb.amount, 0) + COALESCE(fd.amount, 0))::text AS fuel_expenses,
         COALESCE(tk.todays_trips, '0') AS todays_trips,
         COALESCE(tk.weekly_trips, '0') AS weekly_trips,
         COALESCE(tk.monthly_trips, '0') AS monthly_trips,
         cbm.rows AS collections_by_mode,
         cpj.rows AS collection_performance_by_shop
       FROM trip_kpis tk
       CROSS JOIN delivery_totals dt
       CROSS JOIN fuel_from_bills fb
       CROSS JOIN fuel_from_diesel fd
       CROSS JOIN collection_totals ct
       CROSS JOIN collections_by_mode cbm
       CROSS JOIN collection_performance_json cpj`,
      [day, fromDate, toDate]
    );

    const row = result.rows[0] ?? {
      total_trips: "0",
      total_weight: "0",
      total_sales: "0",
      total_collections: "0",
      pending_collections: "0",
      fuel_expenses: "0",
      todays_trips: "0",
      weekly_trips: "0",
      monthly_trips: "0",
      collections_by_mode: [],
      collection_performance_by_shop: [],
    };

    const parseRows = <T>(value: T[] | string): T[] => {
      if (Array.isArray(value)) return value;
      try {
        const parsed: unknown = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed as T[] : [];
      } catch {
        return [];
      }
    };

    return {
      totalTrips: Number(row.total_trips) || 0,
      totalWeight: Number(row.total_weight) || 0,
      totalSales: Number(row.total_sales) || 0,
      totalCollections: Number(row.total_collections) || 0,
      pendingCollections: Number(row.pending_collections) || 0,
      fuelExpenses: Number(row.fuel_expenses) || 0,
      todaysTrips: Number(row.todays_trips) || 0,
      weeklyTrips: Number(row.weekly_trips) || 0,
      monthlyTrips: Number(row.monthly_trips) || 0,
      collectionsByMode: parseRows<{ name: string; value: number }>(row.collections_by_mode).map((item) => ({
        name: String(item.name || "Other"), value: Number(item.value) || 0,
      })),
      collectionPerformanceByShop: parseRows<{
        shopId: number | null; shopName: string; salesAmount: number; collectionAmount: number; outstandingAmount: number;
      }>(row.collection_performance_by_shop).map((item) => ({
        shopId: item.shopId == null ? null : Number(item.shopId),
        shopName: String(item.shopName || "Unknown shop"),
        salesAmount: Number(item.salesAmount) || 0,
        collectionAmount: Number(item.collectionAmount) || 0,
        outstandingAmount: Number(item.outstandingAmount) || 0,
      })),
    };
  },
};
