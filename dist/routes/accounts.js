/**
 * Accounts module router (/api/accounts).
 * Payments are the first Accounts backend slice; future phases (Shop Ledger,
 * Farmer Ledger, Collections, Cash Book, Bank Book, P&L, Day Closing,
 * Outstanding) will register their routers here.
 */
import { Router } from "express";
import { farmPaymentsRouter } from "./farmPayments.js";
import { paymentsRouter } from "./payments.js";
import { accountsBoundary } from "../middleware/businessBoundary.js";
export const accountsRouter = Router();
accountsRouter.use(accountsBoundary);
accountsRouter.use("/payments", paymentsRouter);
accountsRouter.use("/farm-payments", farmPaymentsRouter);
//# sourceMappingURL=accounts.js.map