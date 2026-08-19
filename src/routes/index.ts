import { Router } from "express";
import { healthRouter } from "./health.js";
import { mastersRouter } from "./masters.js";
import { tripsRouter } from "./trips.js";
import { staffRouter } from "./staff.js";
import { operationsRouter } from "./operations.js";
import { docsRouter } from "./docs.js";
import { fleetRouter } from "./fleet.js";
import { accountsRouter } from "./accounts.js";
import { mobileRouter } from "./mobile.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/masters", mastersRouter);
apiRouter.use("/trips", tripsRouter);
apiRouter.use("/staff", staffRouter);
apiRouter.use("/operations", operationsRouter);
apiRouter.use("/fleet", fleetRouter);
apiRouter.use("/accounts", accountsRouter);
apiRouter.use("/mobile", mobileRouter);
apiRouter.use("/docs", docsRouter);
