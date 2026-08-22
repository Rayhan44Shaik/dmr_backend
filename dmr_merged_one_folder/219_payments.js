/**
 * Accounts module — Payment types (Accounts → Paid Payments).
 *
 * The persisted shape mirrors the frontend `Payment` interface (camelCase) so
 * the Paid Payments UI can consume the backend without a redesign. The task
 * contract also asks for `mode` / `reference` aliases — both are emitted so
 * either consumer is satisfied, but the canonical fields follow the frontend
 * (`paymentMode` / `referenceNo`).
 */
export const PAYMENT_TYPES = [
    "Farmer Payment",
    "Fuel Payment",
    "Vehicle Maintenance",
    "Salary Payment",
    "EMI Payment",
    "FASTag Recharge",
    "Office Expense",
    "Tax Payment",
    "Other Expense",
];
export const PAYMENT_MODES = [
    "Cash",
    "Bank Transfer",
    "UPI",
    "NEFT",
    "RTGS",
    "IMPS",
    "Cheque",
];
export const PAYMENT_STATUSES = ["Draft", "Approved", "Paid", "Cancelled"];
//# sourceMappingURL=payments.js.map