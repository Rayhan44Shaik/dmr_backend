import type pg from "pg";
import { AppError } from "../middleware/errorHandler.js";

type Client = pg.PoolClient;

function ymdFromDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, "Expense date must be a valid YYYY-MM-DD calendar date.");
  }
  return date.replace(/-/g, "");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Display bill number for a trip diesel row. Sequence is per trip (row_index). */
export function tripFuelBillNo(tripDate: string, rowIndex: number): string {
  const seq = rowIndex > 0 ? rowIndex : 1;
  return `TR-${ymdFromDate(tripDate)}-${pad3(seq)}`;
}

/**
 * Transaction-safe MANUAL bill numbers: BILL-YYYYMMDD-NNN.
 * Atomic upsert on fuel_manual_bill_seq (no frontend counters).
 */
export async function nextManualFuelBillNo(client: Client, expenseDate: string): Promise<string> {
  const ymd = ymdFromDate(expenseDate);
  const result = await client.query<{ last_seq: number }>(
    `INSERT INTO fuel_manual_bill_seq (ymd, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (ymd) DO UPDATE
       SET last_seq = fuel_manual_bill_seq.last_seq + 1
     RETURNING last_seq`,
    [ymd]
  );
  const seq = Number(result.rows[0]?.last_seq ?? 0);
  if (!Number.isFinite(seq) || seq < 1) {
    throw new AppError(500, "Could not allocate a manual fuel bill number.");
  }
  return `BILL-${ymd}-${pad3(seq)}`;
}
