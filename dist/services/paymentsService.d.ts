import type { Payment } from "../types/payments.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
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
    create(body: unknown): Promise<Payment>;
    update(id: number, body: unknown): Promise<Payment>;
    /** Soft delete — the row (and its number) stays; it just disappears from
     * normal queries. Repeated delete returns a clean 404. */
    softDelete(id: number): Promise<Payment>;
};
