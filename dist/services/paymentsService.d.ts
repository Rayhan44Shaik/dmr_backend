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
import type { Payment } from "../types/payments.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
type Client = pg.PoolClient;
export declare const paymentsService: {
    list(filters?: {
        fromDate?: string;
        toDate?: string;
        paymentType?: string;
        mode?: string;
        status?: string;
        search?: string;
        includeDeleted?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<Payment[] | PaginatedResult<Payment>>;
    getById(id: number): Promise<Payment>;
    /**
     * Create an Accounts Payment. When `client` is provided (salary payment
     * integration), the insert + number-counter increment run on that consumer's
     * open transaction — atomicity with the caller (salary Pending → Paid) is
     * the caller's responsibility. Without a client the create opens its own
     * transaction as before.
     */
    create(body: unknown, client?: Client): Promise<Payment>;
    update(id: number, body: unknown): Promise<Payment>;
    /** Soft delete — the row (and its number) stays; it just disappears from
     * normal queries. Repeated delete returns a clean 404. */
    softDelete(id: number): Promise<Payment>;
};
export {};
