import { Router } from "express";
import { healthRouter } from "./health.js";
import { mastersRouter } from "./masters.js";
import { tripsRouter } from "./trips.js";
import { staffRouter } from "./staff.js";
import { operationsRouter } from "./operations.js";
import { docsRouter } from "./docs.js";
import { fleetRouter } from "./fleet.js";
import { accountsRouter } from "./accounts.js";
import { authRouter } from "./auth.js";
import { farmPaymentsRouter } from "./farmPayments.js";
import { requireAuth } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { serverActor } from "../middleware/serverActor.js";
import { accessManagementRouter } from "./accessManagement.js";
import { settingsRouter } from "./settings.js";
import { AppError } from "../middleware/errorHandler.js";
import { roleBoundary } from "../middleware/roleBoundary.js";
import { requireProxyProof } from "../middleware/clientAddress.js";
import { env } from "../config/env.js";

export const apiRouter = Router();

// Health must remain reachable for the tunnel/orchestrator. Every other API
// route is private to the Pages proxy in production.
apiRouter.use("/health", healthRouter);
if (env.nodeEnv === "production") {
  apiRouter.use(requireProxyProof);
  apiRouter.use("/docs", (_req, res) => res.status(404).json({ error: "Not found" }));
} else {
  apiRouter.use("/docs", docsRouter);
}
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use((req, res, next) => {
  if (res.locals.authUser?.mustChangePassword) {
    return next(new AppError(403, "Password change is required before accessing business pages", undefined, "PASSWORD_CHANGE_REQUIRED"));
  }
  next();
});
apiRouter.use(idempotency);
apiRouter.use(roleBoundary);
// Actor identity (approve/reject/delete/completion) is stamped from the
// authenticated session AFTER idempotency hashing so a tampered payload and
// its honest twin hash differently only by the client's own fields.
apiRouter.use(serverActor);
apiRouter.use("/access-management", accessManagementRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/masters", mastersRouter);
apiRouter.use("/trips", tripsRouter);
apiRouter.use("/staff", staffRouter);
apiRouter.use("/operations", operationsRouter);
apiRouter.use("/fleet", fleetRouter);
apiRouter.use("/accounts", accountsRouter);
apiRouter.use("/farm-payments", farmPaymentsRouter);
