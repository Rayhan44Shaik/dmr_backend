// src/modules/accounts/types/summary.types.ts

import type { Trip } from '../../operations/vehicle-trips/types/trip';

/**
 * Metrics for a single week (or any period)
 */
export interface WeeklyMetrics {
  trips: number;
  birds: number;
  weight: number;
  mortality: number;
  sales: number;
  collection: number;
  pending: number;
}

/**
 * Breakdown of expenses by category
 */
export interface ExpenseBreakdown {
  farm: number;
  fuel: number;
  trip: number;
  salary: number;
  maintenance: number;
  office: number;
}

/**
 * Full data for one week (label, date range, trips, computed metrics + expenses)
 */
export interface WeeklyData {
  label: string;
  startDate: string;
  endDate: string;
  trips: Trip[];
  metrics: WeeklyMetrics;
  expenses: ExpenseBreakdown;
}

/**
 * Complete summary for the selected period
 */
export interface SummaryData {
  period: 'week' | 'month' | 'quarter' | 'custom';
  startDate: string;
  endDate: string;
  weeks: WeeklyData[];
  totals: WeeklyMetrics;
  totalExpenses: ExpenseBreakdown;
  netProfit: number;
  today: {
    trips: Trip[];
    sales: number;
    collection: number;
    pending: number;
  };
  alerts: string[];
}