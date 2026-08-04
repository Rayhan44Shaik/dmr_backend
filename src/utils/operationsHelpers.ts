import type { PoolClient } from "pg";
import { query } from "../config/db.js";

export async function nextDocNo(
  clientOrNull: PoolClient | null,
  prefix: string,
  table: string,
  column: string,
  date = new Date()
) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const like = `${prefix}-${ymd}-%`;
  const sql = `SELECT ${column} AS n FROM ${table}
               WHERE ${column} LIKE $1
               ORDER BY ${column} DESC LIMIT 1`;
  const result = clientOrNull
    ? await clientOrNull.query<{ n: string }>(sql, [like])
    : await query<{ n: string }>(sql, [like]);
  const last = result.rows[0]?.n;
  const seq = last ? Number(last.split("-").pop()) + 1 : 1;
  return `${prefix}-${ymd}-${String(seq).padStart(3, "0")}`;
}

export function computeTripExpense(row: {
  fuel?: number | null;
  pickupTolls?: number | null;
  deliveryTolls?: number | null;
  destinationTolls?: number | null;
  meals?: number | null;
  mealsTiffin?: number | null;
  driverBata?: number | null;
  helperBata?: number | null;
  loading?: number | null;
  vehicleMaintenance?: number | null;
  othersRC?: number | null;
  others1Amt?: number | null;
  others2Amt?: number | null;
  others3Amt?: number | null;
  others4Amt?: number | null;
  others5Amt?: number | null;
  expense?: number | null;
}) {
  const diesel = Number(row.fuel ?? 0);
  const toll =
    Number(row.pickupTolls ?? 0) +
    Number(row.deliveryTolls ?? 0) +
    Number(row.destinationTolls ?? 0);
  const food = Number(row.meals ?? 0) + Number(row.mealsTiffin ?? 0);
  const driverBata = Number(row.driverBata ?? 0);
  const helperBata = Number(row.helperBata ?? 0);
  const other =
    Number(row.loading ?? 0) +
    Number(row.vehicleMaintenance ?? 0) +
    Number(row.othersRC ?? 0) +
    Number(row.others1Amt ?? 0) +
    Number(row.others2Amt ?? 0) +
    Number(row.others3Amt ?? 0) +
    Number(row.others4Amt ?? 0) +
    Number(row.others5Amt ?? 0) +
    Number(row.expense ?? 0);

  return {
    diesel,
    toll,
    food,
    driverBata,
    helperBata,
    otherExpenses: other,
    totalTripExpense: diesel + toll + food + driverBata + helperBata + other,
  };
}
