/**
 * Accounts → Payments service.
 *
 * Route → validation → service → PostgreSQL. All business logic lives here;
 * routes stay thin. Create + numbering, and delete, run inside transactions so
 * a failure never leaves a half-written payment or an inconsistent counter.
 *
 * Numbering: PAY-YYYYMMDD-NNN keyed on the business payment date. The counter
 * upsert (INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING) row-locks the
 * per-date counter inside the create transaction, serializing concurrent
 * creates for the same date so each gets a distinct, never-reused sequence.
 * If the transaction rolls back, the counter increment rolls back too.
 */
import type pg from "pg";
import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import type { Payment, PaymentStatus } from "../types/payments.js";
import { dateOnly, num, str } from "../utils/coerce.js";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../utils/pagination.js";
import { rethrowIfAppError } from "../utils/pgErrors.js";
import {
  parseBody,
  paymentBodySchema,
  paymentUpdateSchema,
  type PaymentBody,
} from "../validation/payments.js";

type Client = pg.PoolClient;

/**
 * 10-day edit/delete window (matches the Payment Register UI rule in
 * frontend dateUtils.canEditItem/canDeleteItem, which gates on createdAt).
 * Records older than 10 days are locked: update/delete via the API fail even
 * when the caller bypasses the UI. Missing created_at fails open (the UI
 * treats a missing date as editable, so the server must agree).
 */
async function assertWithinEditWindow(id: number): Promise<void> {
  const existing = await query<{ created_at: string | null }>(
    `SELECT created_at FROM payments
     WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
    [id]
  );
  if (!existing.rowCount) throw new AppError(404, "Payment not found");
  const createdAt = existing.rows[0].created_at;
  if (createdAt == null) return;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs)) return;
  if (Math.floor(ageMs / 86_400_000) > 10) {
    throw new AppError(403, "Payment is older than 10 days and cannot be modified or deleted");
  }
}

const PAYMENT_SELECT = `SELECT p.* FROM payments p`;

function mapPayment(row: Record<string, unknown>): Payment {
  const paymentMode = str(row.payment_mode);
  const referenceNo = str(row.reference_no);
  return {
    id: num(row.id),
    paymentNo: str(row.payment_no),
    paymentDate: dateOnly(row.payment_date) ?? "",
    paymentType: str(row.payment_type),
    paidTo: str(row.paid_to),
    amount: num(row.amount),
    paymentMode,
    mode: paymentMode,
    referenceNo,
    reference: referenceNo,
    remarks: row.remarks == null ? null : str(row.remarks),
    category: str(row.category),
    status: (str(row.status) || "Draft") as PaymentStatus,
    createdBy: str(row.created_by),
    createdAt: row.created_at == null ? null : str(row.created_at),
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at == null ? null : str(row.deleted_at),
    attachments: [],
  };
}

/**
 * Generate the next payment number for a business date: PAY-YYYYMMDD-NNN.
 *
 * Concurrency: the per-date sequence lives in payment_number_counters. The
 * atomic upsert below takes the row lock for (counter_date), so concurrent
 * creates for the SAME date serialize and each gets a distinct increment;
 * creates for different dates do not contend. The counter never decreases, so
 * soft-deleted / cancelled numbers stay permanently consumed and are never
 * re-issued. Because this runs inside the caller's transaction, a rollback
 * rolls the counter increment back too — the counter can never run ahead of
 * the payments actually committed.
 *
 * The payments.payment_no unique index is the final guard; any residual
 * collision surfaces as 23505 (409) and the whole transaction rolls back.
 */
async function generatePaymentNo(client: Client, paymentDate: string): Promise<string> {
  const yyyymmdd = dateOnly(paymentDate)?.replace(/-/g, "") ?? "";
  const counter = await client.query<{ last_sequence: string }>(
    `INSERT INTO payment_number_counters (counter_date, last_sequence)
     VALUES ($1::date, 1)
     ON CONFLICT (counter_date)
     DO UPDATE SET last_sequence = payment_number_counters.last_sequence + 1
     RETURNING last_sequence`,
    [paymentDate]
  );
  const seq = Number(counter.rows[0].last_sequence);
  return `PAY-${yyyymmdd}-${String(seq).padStart(3, "0")}`;
}

function buildWhere(filters: {
  fromDate?: string;
  toDate?: string;
  paymentType?: string;
  mode?: string;
  status?: string;
  search?: string;
  includeDeleted?: boolean;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  // Soft-deleted payments are hidden from normal list results unless the
  // caller explicitly requests them (includeDeleted=true).
  if (!filters.includeDeleted) {
    clauses.push(`COALESCE(p.deleted, FALSE) = FALSE`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    clauses.push(`p.payment_date >= $${params.length}::date`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    clauses.push(`p.payment_date <= $${params.length}::date`);
  }
  if (filters.paymentType) {
    params.push(filters.paymentType);
    clauses.push(`p.payment_type = $${params.length}`);
  }
  if (filters.mode) {
    params.push(filters.mode);
    clauses.push(`p.payment_mode = $${params.length}`);
  }
  if (filters.status && filters.status !== "ALL") {
    params.push(filters.status);
    clauses.push(`p.status = $${params.length}::payment_status`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = params.length;
    clauses.push(
      `(p.payment_no ILIKE $${p} OR p.paid_to ILIKE $${p}
        OR p.reference_no ILIKE $${p} OR p.remarks ILIKE $${p})`
    );
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export const paymentsService = {
  async list(
    filters: {
      fromDate?: string;
      toDate?: string;
      paymentType?: string;
      mode?: string;
      status?: string;
      search?: string;
      includeDeleted?: boolean;
      pagination?: PaginationParams | null;
    } = {}
  ): Promise<Payment[] | PaginatedResult<Payment>> {
    const { where, params } = buildWhere(filters);

    if (filters.pagination) {
      const countResult = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM payments p ${where}`,
        params
      );
      const total = Number(countResult.rows[0]?.c ?? 0);
      const pagedParams = [...params, filters.pagination.limit, filters.pagination.offset];
      const result = await query(
        `${PAYMENT_SELECT} ${where}
         ORDER BY p.payment_date DESC, p.payment_no DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pagedParams
      );
      return paginatedResult(result.rows.map(mapPayment), total, filters.pagination);
    }

    const result = await query(
      `${PAYMENT_SELECT} ${where}
       ORDER BY p.payment_date DESC, p.payment_no DESC`,
      params
    );
    return result.rows.map(mapPayment);
  },

  async getById(id: number): Promise<Payment> {
    const result = await query(
      `${PAYMENT_SELECT} WHERE p.id = $1 AND COALESCE(p.deleted, FALSE) = FALSE`,
      [id]
    );
    if (!result.rowCount) throw new AppError(404, "Payment not found");
    return mapPayment(result.rows[0]);
  },

  /**
   * Create an Accounts Payment. When `client` is provided (salary payment
   * integration), the insert + number-counter increment run on that consumer's
   * open transaction — atomicity with the caller (salary Pending → Paid) is
   * the caller's responsibility. Without a client the create opens its own
   * transaction as before.
   */
  async create(body: unknown, client?: Client): Promise<Payment> {
    const data = parseBody(paymentBodySchema, body) as PaymentBody;

    const run = async (c: Client) => {
      try {
        const paymentNo = await generatePaymentNo(c, data.paymentDate);
        const result = await c.query(
          `INSERT INTO payments (
             payment_no, payment_date, payment_type, paid_to, amount,
             payment_mode, reference_no, remarks, category, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            paymentNo,
            data.paymentDate,
            data.paymentType,
            data.paidTo,
            data.amount,
            data.paymentMode,
            data.referenceNo ?? "",
            data.remarks ?? null,
            data.category ?? "",
            data.status ?? "Draft",
            data.createdBy ?? "",
          ]
        );

        const paymentId = num(result.rows[0].id);
        const full = await c.query(`${PAYMENT_SELECT} WHERE p.id = $1`, [paymentId]);
        return mapPayment(full.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    };

    if (client) return run(client);
    return withTransaction((c) => run(c));
  },

  async update(id: number, body: unknown): Promise<Payment> {
    const data = parseBody(paymentUpdateSchema, body) as Partial<PaymentBody>;
    // 10-day window enforced before the transaction: created_at is immutable,
    // so the pool-level check cannot go stale; the in-transaction guards below
    // still own the deleted/missing cases.
    await assertWithinEditWindow(id);

    return withTransaction(async (client) => {
      try {
        // Prevent updates to deleted records: the existence check and the
        // UPDATE both guard on COALESCE(deleted, FALSE) = FALSE.
        const existing = await client.query(
          `SELECT id, payment_no FROM payments
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE`,
          [id]
        );
        if (!existing.rowCount) throw new AppError(404, "Payment not found");

        // paymentNo is never part of the update body (zod strips unknown keys),
        // so it can neither be changed nor regenerated here.
        const result = await client.query(
          `UPDATE payments SET
             payment_date = COALESCE($2, payment_date),
             payment_type = COALESCE($3, payment_type),
             paid_to = COALESCE($4, paid_to),
             amount = COALESCE($5, amount),
             payment_mode = COALESCE($6, payment_mode),
             reference_no = COALESCE($7, reference_no),
             remarks = COALESCE($8, remarks),
             category = COALESCE($9, category),
             status = COALESCE($10::payment_status, status)
           WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
           RETURNING id`,
          [
            id,
            data.paymentDate ?? null,
            data.paymentType ?? null,
            data.paidTo ?? null,
            data.amount ?? null,
            data.paymentMode ?? null,
            data.referenceNo ?? null,
            data.remarks ?? null,
            data.category ?? null,
            data.status ?? null,
          ]
        );
        if (!result.rowCount) throw new AppError(404, "Payment not found");

        const full = await client.query(`${PAYMENT_SELECT} WHERE p.id = $1`, [id]);
        return mapPayment(full.rows[0]);
      } catch (err) {
        rethrowIfAppError(err);
        throw err;
      }
    });
  },

  /** Soft delete — the row (and its number) stays; it just disappears from
   * normal queries. Repeated delete returns a clean 404. */
  async softDelete(id: number): Promise<Payment> {
    // 10-day window: a direct-API delete of a locked record fails here.
    await assertWithinEditWindow(id);
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE payments SET
           deleted = TRUE,
           deleted_at = NOW()
         WHERE id = $1 AND COALESCE(deleted, FALSE) = FALSE
         RETURNING id`,
        [id]
      );
      if (!result.rowCount) throw new AppError(404, "Payment not found");

      const full = await client.query(`${PAYMENT_SELECT} WHERE p.id = $1`, [id]);
      return mapPayment(full.rows[0]);
    });
  },
};
