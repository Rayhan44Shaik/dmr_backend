import { query } from "../config/db.js";
import type { OperationsDashboard } from "../types/operations.js";

/**
 * Dashboard KPIs from existing tables only:
 * trips, trip_deliveries, fuel_expenses, trip_diesel_entries
 * (vehicles/farms/shops available via FKs on those rows)
 */
export const dashboardService = {
  async getSummary(asOf?: string): Promise<OperationsDashboard> {
    const day = asOf ?? new Date().toISOString().slice(0, 10);

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
    }>(
      `WITH completed_trips AS (
         SELECT *
         FROM trips t
         WHERE t.status = 'Completed'
           AND COALESCE(t.deleted, FALSE) = FALSE
       ),
       delivery_totals AS (
         -- Authoritative "is this trip's rate locked" signal is
         -- rate_entry.locked, never trips.rate_completed directly — joining
         -- here instead of trusting the (best-effort-synced) cache column
         -- guarantees this can never disagree with Rate Entry/Shop Sales.
         SELECT
           COALESCE(SUM(d.amount), 0) AS total_sales,
           COALESCE(SUM(d.amount) FILTER (WHERE re.locked = TRUE), 0) AS total_collections,
           COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(re.locked, FALSE) = FALSE), 0)
             AS pending_collections,
           COALESCE(SUM(d.weight), 0) AS delivery_weight
         FROM trip_deliveries d
         INNER JOIN completed_trips ct ON ct.id = d.trip_id
         LEFT JOIN rate_entry re ON re.trip_id = ct.id
       ),
       trip_kpis AS (
         SELECT
           COUNT(*)::text AS total_trips,
           COALESCE(SUM(COALESCE(ct.total_weight, 0)), 0) AS weight_sum,
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
       ),
       fuel_from_diesel AS (
         SELECT COALESCE(SUM(COALESCE(d.litres, 0) * COALESCE(d.rate, 0)), 0) AS amount
         FROM trip_diesel_entries d
         INNER JOIN completed_trips ct ON ct.id = d.trip_id
         WHERE NOT EXISTS (
           SELECT 1 FROM fuel_expenses f WHERE f.trip_id = ct.id AND f.status = 'Approved'
         )
       )
       SELECT
         COALESCE(tk.total_trips, '0') AS total_trips,
         COALESCE(GREATEST(tk.weight_sum, dt.delivery_weight), 0)::text AS total_weight,
         COALESCE(dt.total_sales, 0)::text AS total_sales,
         COALESCE(dt.total_collections, 0)::text AS total_collections,
         COALESCE(dt.pending_collections, 0)::text AS pending_collections,
         (COALESCE(fb.amount, 0) + COALESCE(fd.amount, 0))::text AS fuel_expenses,
         COALESCE(tk.todays_trips, '0') AS todays_trips,
         COALESCE(tk.weekly_trips, '0') AS weekly_trips,
         COALESCE(tk.monthly_trips, '0') AS monthly_trips
       FROM trip_kpis tk
       CROSS JOIN delivery_totals dt
       CROSS JOIN fuel_from_bills fb
       CROSS JOIN fuel_from_diesel fd`,
      [day]
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
    };
  },
};
