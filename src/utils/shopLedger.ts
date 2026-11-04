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
  const nextDebit = Math.max(0, Number(Number(debit).toFixed(2)));
  const nextCredit = Math.max(0, Number(Number(credit).toFixed(2)));
  if (nextDebit + nextCredit <= 0) return;
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
      nextDebit,
      nextCredit,
      ref.note ?? "",
    ]
  );
  await recalcShopBalance(client, shopId);
}

/** Set a ledger row's net (debit − credit). A zero net removes the row so
 *  shop_ledger's (debit + credit > 0) check never 422s a valid save. */
export async function setLedgerNet(
  client: Client,
  ledgerId: number,
  shopId: number,
  next: number,
  note: string
): Promise<void> {
  const net = Number(Number(next).toFixed(2));
  if (net === 0) {
    await client.query(`DELETE FROM shop_ledger WHERE id = $1`, [ledgerId]);
  } else {
    await client.query(
      `UPDATE shop_ledger SET debit = $2, credit = $3, note = $4 WHERE id = $1`,
      [ledgerId, Math.max(0, net), Math.max(0, -net), note]
    );
  }
  await recalcShopBalance(client, shopId);
}

/**
 * Remove a delivery's sale rows (delivery-linked rows of any entry type),
 * then recompute the shop balance. This is how a deleted/zeroed Shop Sale
 * leaves the ledger: the sale row disappears instead of lingering as a
 * visible debit offset by an invisible correction. Returns the removed row
 * count so callers can fall back to a correction credit only for legacy
 * trip-level rows, which cannot be surgically removed per delivery.
 */
export async function removeShopSaleLedger(
  client: Client,
  shopId: number,
  saleId: number
): Promise<number> {
  const removed = await client.query(
    `DELETE FROM shop_ledger
      WHERE shop_id = $1
        AND reference_type = 'shop_sale'
        AND reference_id = $2`,
    [shopId, saleId]
  );
  await recalcShopBalance(client, shopId);
  return removed.rowCount ?? 0;
}

/**
 * Remove every sale row baked for one trip — delivery-linked rows plus any
 * legacy trip-level rows — then recompute every affected shop. A deleted
 * trip takes its sales with it so the ledger can never show debits the
 * Cumulative view (which ignores deleted trips) no longer counts.
 * Collections are independent cash records and are left untouched.
 */
export async function removeTripSaleLedger(
  client: Client,
  tripId: number
): Promise<void> {
  const removed = await client.query<{ shop_id: number }>(
    `DELETE FROM shop_ledger
      WHERE (reference_type = 'shop_sale'
        AND reference_id IN (SELECT id FROM trip_deliveries WHERE trip_id = $1))
        OR (reference_type = 'trip' AND reference_id = $1)
      RETURNING shop_id`,
    [tripId]
  );
  const shops = new Set<number>();
  for (const row of removed.rows) shops.add(Number(row.shop_id));
  for (const shopId of shops) await recalcShopBalance(client, shopId);
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