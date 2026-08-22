// src/modules/accounts/services/marketRateService.ts
// Market Rate — PostgreSQL via shared Axios helpers. PostgreSQL (not
// localStorage) is the single source of truth. Rate Entry reads the same
// market_rates table through its own backend endpoint, so both screens share
// the exact same persisted data.

import { apiGet, apiPut } from "../../../api";

export interface MarketRateRow {
  id: number;
  businessDate: string;
  vij: number;
  gun: number;
  rp: number;
  sneha: number;
  vencobRate: number;
  vencobVii: number;
  vencobGun: number;
  associationVii: number;
  c17: number;
  c15: number;
  c13: number;
  c12: number;
  c10: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type MarketRateInput = {
  businessDate: string;
  vij?: number;
  gun?: number;
  rp?: number;
  sneha?: number;
  vencobRate?: number;
  vencobVii?: number;
  vencobGun?: number;
  associationVii?: number;
  c17?: number;
  c15?: number;
  c13?: number;
  c12?: number;
  c10?: number;
};

const MARKET_RATES_PATH = "/masters/market-rates";

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** GET /masters/market-rates?fromDate=&toDate= — backend PostgreSQL rows. */
export async function listMarketRates(
  fromDate?: string,
  toDate?: string
): Promise<MarketRateRow[]> {
  const { data } = await apiGet<MarketRateRow[]>(MARKET_RATES_PATH, {
    params: {
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
    },
  });
  return Array.isArray(data) ? data : [];
}

/** PUT /masters/market-rates/batch — upserts by business_date (one row per date). */
export async function saveMarketRates(rows: MarketRateInput[]): Promise<MarketRateRow[]> {
  const { data } = await apiPut<MarketRateRow[]>(`${MARKET_RATES_PATH}/batch`, rows);
  return Array.isArray(data) ? data : [];
}

/** Normalize any number-ish input (string from inputs, number from DB) to a number. */
export function marketRateNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  return num(value);
}
