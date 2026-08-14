/**
 * Accounts module — Payment types (Accounts → Paid Payments).
 *
 * The persisted shape mirrors the frontend `Payment` interface (camelCase) so
 * the Paid Payments UI can consume the backend without a redesign. The task
 * contract also asks for `mode` / `reference` aliases — both are emitted so
 * either consumer is satisfied, but the canonical fields follow the frontend
 * (`paymentMode` / `referenceNo`).
 */
export declare const PAYMENT_TYPES: readonly ["Farmer Payment", "Fuel Payment", "Vehicle Maintenance", "Salary Payment", "EMI Payment", "FASTag Recharge", "Office Expense", "Tax Payment", "Other Expense"];
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export declare const PAYMENT_MODES: readonly ["Cash", "Bank Transfer", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export declare const PAYMENT_STATUSES: readonly ["Draft", "Approved", "Paid", "Cancelled"];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export interface Payment {
    id: number;
    paymentNo: string;
    paymentDate: string;
    paymentType: string;
    paidTo: string;
    amount: number;
    /** Frontend-canonical mode field. */
    paymentMode: string;
    /** Task-contract alias of `paymentMode`. */
    mode: string;
    /** Frontend-canonical reference field. */
    referenceNo: string;
    /** Task-contract alias of `referenceNo`. */
    reference: string;
    remarks: string | null;
    category: string;
    status: PaymentStatus;
    createdBy: string;
    createdAt: string | null;
    updatedAt: string | null;
    deleted: boolean;
    deletedAt: string | null;
    /**
     * Attachments are persisted in the frontend ledger (dmr-payment-attachments)
     * today; binary attachment persistence on the backend is a documented
     * follow-up. An empty array keeps the frontend `Payment` contract valid.
     */
    attachments: unknown[];
}
