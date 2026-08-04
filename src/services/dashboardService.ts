import { query } from "../config/db.js";
import type { OperationsDashboard } from "../types/operations.js";

export const dashboardService = {
  async getSummary(asOf?: string): Promise<OperationsDashboard> {
    const day = asOf ?? new Date().toISOString().slice(0, 10);

    const trips = await query<{
      total_trips: string;
      total_weight: string;
      todays_trips: string;
      weekly_trips: string;
      monthly_trips: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Completed' AND deleted = FALSE)::text AS total_trips,
         COALESCE(SUM(total_weight) FILTER (WHERE status = 'Completed' AND deleted = FALSE), 0)::text AS total_weight,
         COUNT(*) FILTER (
           WHERE status = 'Completed' AND deleted = FALSE AND trip_date = $1::date
         )::text AS todays_trips,
         COUNT(*) FILTER (
           WHERE status = 'Completed' AND deleted = FALSE
             AND trip_date >= ($1::date - INTERVAL '6 days')
             AND trip_date <= $1::date
         )::text AS weekly_trips,
         COUNT(*) FILTER (
           WHERE status = 'Completed' AND deleted = FALSE
             AND date_trunc('month', trip_date) = date_trunc('month', $1::date)
         )::text AS monthly_trips
       FROM trips`,
      [day]
    );

    const sales = await query<{ total_sales: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total_sales
       FROM shop_sales
       WHERE status = 'Approved' AND deleted = FALSE`
    );

    const collections = await query<{
      total_collections: string;
      pending_collections: string;
    }>(
      `SELECT
         COALESCE(SUM(amount_collected) FILTER (WHERE status = 'Approved' AND deleted = FALSE), 0)::text
           AS total_collections,
         COALESCE(
           SUM(GREATEST(amount_due - amount_collected, 0))
             FILTER (WHERE status = 'Approved' AND deleted = FALSE),
           0
         )::text AS pending_collections
       FROM collections`
    );

    const fuel = await query<{ fuel_expenses: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS fuel_expenses
       FROM fuel_expenses
       WHERE ops_status = 'Approved' AND deleted = FALSE`
    );

    const t = trips.rows[0];
    return {
      totalTrips: Number(t.total_trips),
      totalWeight: Number(t.total_weight),
      totalSales: Number(sales.rows[0].total_sales),
      totalCollections: Number(collections.rows[0].total_collections),
      pendingCollections: Number(collections.rows[0].pending_collections),
      fuelExpenses: Number(fuel.rows[0].fuel_expenses),
      todaysTrips: Number(t.todays_trips),
      weeklyTrips: Number(t.weekly_trips),
      monthlyTrips: Number(t.monthly_trips),
    };
  },
};
