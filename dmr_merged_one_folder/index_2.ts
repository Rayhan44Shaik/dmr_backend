import { Router } from "express";
import { healthRouter } from "./health.js";
import { mastersRouter } from "./masters.js";
import { tripsRouter } from "./trips.js";
import { staffRouter } from "./staff.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/masters", mastersRouter);
apiRouter.use("/trips", tripsRouter);
apiRouter.use("/staff", staffRouter);
