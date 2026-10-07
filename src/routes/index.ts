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

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/docs", docsRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use(idempotency);
// Actor identity (approve/reject/delete/completion) is stamped from the
// authenticated session AFTER idempotency hashing so a tampered payload and
// its honest twin hash differently only by the client's own fields.
apiRouter.use(serverActor);
apiRouter.use("/masters", mastersRouter);
apiRouter.use("/trips", tripsRouter);
apiRouter.use("/staff", staffRouter);
apiRouter.use("/operations", operationsRouter);
apiRouter.use("/fleet", fleetRouter);
apiRouter.use("/accounts", accountsRouter);
apiRouter.use("/farm-payments", farmPaymentsRouter);
