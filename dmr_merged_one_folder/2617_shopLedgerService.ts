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
 *
 * Pending collections are never in `shop_ledger` — approval writes the single
 * CREDIT; reject/delete replay as one reversal DEBIT per the established
 * collection rules (see collectionEntryService).
 */

export type LedgerEntryType = "sale" | "collection" | "correction";
export type LedgerReferenceType = "trip" | "shop_sale" | "collection";

export interface ShopLedgerRow {
  id: number;
  shopId: number | null;
  shopName: string;
  date: string;
  type: LedgerEntryType;
  referenceType: string;
  referenceId: number;
  /** Trip no / sale no / collection no when the reference resolves. */
  referenceNo: string;
  /** Human description (ledger note or a readable default). */
  description: string;
  debit: number;
  credit: number;
  /** Running balance as-of this row (opening + cumulative in-range deltas). */
  balance: number;
  birds: number;
  weight: number;
  rate: number;
  paymentMode: string | null;
  /** Collections only: ops_record_status of the source collection. */
  status: string | null;
  createdAt: string | null;
}

export interface ShopLedgerResponse {
  shopId: number | null;
  shopName: string;
  /** Backend-authoritative balance at the START of the range. */
  openingBalance: number;
  data: ShopLedgerRow[];
  meta?: PaginatedResult<unknown>["meta"];
}

function mapRow(row: Record<string, unknown>, openingBalance: number): ShopLedgerRow {
  const type = str(row.entry_type) as LedgerEntryType;
  return {
    id: num(row.id),
    shopId: row.shop_id == null ? null : num(row.shop_id),
    shopName: str(row.shop_name),
    date: dateOnly(row.entry_date) ?? "",
    type,
    referenceType: str(row.reference_type),
    referenceId: num(row.reference_id),
    referenceNo: str(row.ref_no),
    description: str(row.note),
    debit: num(row.debit),
    credit: num(row.credit),
    // `running` is the cumulative in-range DELTA; add the backend-computed
    // opening so the row balance is the true authoritative outstanding.
    balance: openingBalance + num(row.running),
    birds: num(row.birds),
    weight: num(row.weight),
    rate: num(row.rate),
    paymentMode: row.payment_mode == null ? null : str(row.payment_mode),
    status: row.collection_status == null ? null : str(row.collection_status),
    createdAt: row.created_at == null ? null : str(row.created_at),
  };
}

const DATA_SELECT = `
  WITH txs AS (
    SELECT l.id, l.shop_id, l.entry_date, l.entry_type, l.reference_type,
           l.reference_id, l.debit, l.credit, l.note, l.created_at,
           s.shop_name,
           COALESCE(NULLIF(dd.sale_no, ''), NULLIF(tt.trip_no, ''),
                    NULLIF(c.collection_no, ''), '') AS ref_no,
           COALESCE(dd.birds, dt.birds, 0)::numeric AS birds,
           COALESCE(dd.weight, dt.weight, 0)::numeric AS weight,
           COALESCE(dd.rate, dt.rate, 0)::numeric AS rate,
           c.payment_mode AS payment_mode,
           c.status AS collection_status
    FROM shop_ledger l
    JOIN shops s ON s.id = l.shop_id
    LEFT JOIN trips tt
           ON l.reference_type = 'trip' AND tt.id = l.reference_id
    LEFT JOIN trip_deliveries dd
           ON l.reference_type = 'shop_sale' AND dd.id = l.reference_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(d3.birds), 0)::numeric AS birds,
             COALESCE(SUM(d3.weight), 0)::numeric AS weight,
             COALESCE(MAX(d3.rate), 0)::numeric AS rate
      FROM trip_deliveries d3
      WHERE d3.trip_id = l.reference_id
        AND d3.shop_id = l.shop_id
        AND COALESCE(d3.deleted, FALSE) = FALSE
    ) dt ON l.reference_type = 'trip'
    LEFT JOIN collections c
           ON l.reference_type = 'collection' AND c.id = l.reference_id
    WHERE ($1::int IS NULL OR l.shop_id = $1::int)
      AND ($2::date IS NULL OR l.entry_date >= $2::date)
      AND ($3::date IS NULL OR l.entry_date <= $3::date)
  )
  SELECT t.*,
         SUM(t.debit - t.credit) OVER (
           ORDER BY t.entry_date, t.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         )::numeric AS running
  FROM txs t
  ORDER BY t.entry_date, t.id
`;

const COUNT_SELECT = `
  SELECT COUNT(*)::text AS c
  FROM shop_ledger l
  WHERE ($1::int IS NULL OR l.shop_id = $1::int)
    AND ($2::date IS NULL OR l.entry_date >= $2::date)
    AND ($3::date IS NULL OR l.entry_date <= $3::date)
`;

/** Balance at the very start of the range (opening + entries strictly BEFORE fromDate). */
async function computeOpeningBalance(
  shopId: number | undefined,
  fromDate: string | undefined
): Promise<{ shopId: number | null; shopName: string; openingBalance: number }> {
  if (shopId != null) {
    const shop = await query<{ id: string; shop_name: string; opening_balance: string }>(
      `SELECT id, shop_name, opening_balance FROM shops WHERE id = $1`,
      [shopId]
    );
    if (!shop.rowCount) {
      return { shopId, shopName: "", openingBalance: 0 };
    }
    const row = shop.rows[0];
    const before = await query<{ n: string }>(
      `SELECT COALESCE(SUM(debit - credit), 0)::text AS n
         FROM shop_ledger
        WHERE shop_id = $1
          AND ($2::date IS NULL OR entry_date < $2::date)`,
      [shopId, fromDate ?? null]
    );
    return {
      shopId: num(row.id),
      shopName: str(row.shop_name),
      openingBalance: num(row.opening_balance) + Number(before.rows[0]?.n ?? 0),
    };
  }

  const openings = await query<{ n: string }>(
    `SELECT COALESCE(SUM(opening_balance), 0)::text AS n FROM shops`
  );
  const before = await query<{ n: string }>(
    `SELECT COALESCE(SUM(debit - credit), 0)::text AS n
       FROM shop_ledger
      WHERE ($1::date IS NULL OR entry_date < $1::date)`,
    [fromDate ?? null]
  );
  return {
    shopId: null,
    shopName: "",
    openingBalance: Number(openings.rows[0]?.n ?? 0) + Number(before.rows[0]?.n ?? 0),
  };
}

export const shopLedgerService = {
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
      data: result.rows.map((row) => mapRow(row, opening.openingBalance)),
    };
  },
};