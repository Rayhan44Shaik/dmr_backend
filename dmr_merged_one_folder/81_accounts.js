/**
 * Accounts module router (/api/accounts).
 * Payments are the first Accounts backend slice; future phases (Shop Ledger,
 * Farmer Ledger, Collections, Cash Book, Bank Book, P&L, Day Closing,
 * Outstanding) will register their routers here.
 */
import { Router } from "express";
import { paymentsRouter } from "./payments.js";
export const accountsRouter = Router();
accountsRouter.use("/payments", paymentsRouter);
//# sourceMappingURL=accounts.js.map