import type pg from "pg";

/**
 * Shared, single-authority shop balance + ledger helpers used by both Shop
 * Sales (DEBIT) and Collection Entry (CREDIT).
 *
 * `shop_ledger` is the source of truth. `shops.current_balance` is always a
 * mirror recomputed from the ledger:
 *
 *     current_balance = opening_balance + Σ(debit) − Σ(credit)
 *
 * Every financially effective operation writes a ledger row and then runs the
 * same recalc, so the denormalized balance can never drift out of sync and no
 * secondary "balance system" is ever maintained.
 */

type Client = pg.PoolClient;

export type LedgerEntryType = "sale" | "collection" | "correction";
export type LedgerReferenceType = "trip" | "shop_sale" | "collection";

export interface LedgerRef {
  entryDate: string; // YYYY-MM-DD (authoritative server-derived date)
  entryType: LedgerEntryType;
  referenceType: LedgerReferenceType;
  referenceId: number;
  note?: string;
}

export interface ShopBalance {
  shopId: number;
  shopName: string;
  status: string;
  openingBalance: number;
  currentBalance: number;
}

const RECALC_SQL = `
  UPDATE shops s
  SET current_balance = s.opening_balance + COALESCE(
    (SELECT SUM(debit) - SUM(credit) FROM shop_ledger WHERE shop_id = s.id), 0)
  WHERE s.id = $1
`;

/** Recomputed current_balance from the ledger (single source of truth). */
export async function recalcShopBalance(
  client: Client,
  shopId: number
): Promise<void> {
  await client.query(RECALC_SQL, [shopId]);
}

/**
 * Append a ledger entry and immediately recompute the shop's current_balance.
 * `debit` and `credit` are mutually exclusive (a caller supplies one or the
 * other for a plain entry; a differential correction may supply both where a
 * net movement happens to invert — helpers below simplify the common cases).
 */
export async function writeLedger(
  client: Client,
  shopId: number,
  ref: LedgerRef,
  debit: number,
  credit: number
): Promise<void> {
  await client.query(
    `INSERT INTO shop_ledger(
       shop_id, entry_date, entry_type, reference_type, reference_id, debit, credit, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      shopId,
      ref.entryDate,
      ref.entryType,
      ref.referenceType,
      ref.referenceId,
      debit,
      credit,
      ref.note ?? "",
    ]
  );
  await recalcShopBalance(client, shopId);
}

/** DEBIT (sale, or a credit that must be returned) against a shop. */
export async function applyDebit(
  client: Client,
  shopId: number,
  ref: LedgerRef,
  amount: number
): Promise<void> {
  await writeLedger(client, shopId, ref, amount, 0);
}

/** CREDIT (collection, or a debit that must be returned) against a shop. */
export async function applyCredit(
  client: Client,
  shopId: number,
  ref: LedgerRef,
  amount: number
): Promise<void> {
  await writeLedger(client, shopId, ref, 0, amount);
}

/**
 * Differential correction. `delta > 0` means the outstanding increased by
 * `delta` (extra debit), `delta < 0` means it decreased (extra credit). This
 * is how a Shop Sales edit (₹5,000 → ₹5,500) changes the Shop outstanding by
 * exactly +₹500 — never by re-applying the whole amount.
 */
export async function applyCorrection(
  client: Client,
  shopId: number,
  ref: LedgerRef,
  delta: number
): Promise<void> {
  if (delta === 0) return;
  await writeLedger(
    client,
    shopId,
    ref,
    delta > 0 ? delta : 0,
    delta < 0 ? -delta : 0
  );
}

/**
 * Read/validate a shop and take a row lock (`FOR UPDATE`) to serialize
 * concurrent financial operations against the same shop. Returns null when the
 * shop does not exist.
 */
export async function lockShop(
  client: Client,
  shopId: number
): Promise<ShopBalance | null> {
  const result = await client.query<{
    shop_id: number;
    shop_name: string;
    status: string;
    opening_balance: string;
    current_balance: string;
  }>(
    `SELECT id AS shop_id, shop_name, status, opening_balance, current_balance
       FROM shops WHERE id = $1 FOR UPDATE`,
    [shopId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    shopId: Number(row.shop_id),
    shopName: row.shop_name,
    status: row.status,
    openingBalance: Number(row.opening_balance),
    currentBalance: Number(row.current_balance),
  };
}