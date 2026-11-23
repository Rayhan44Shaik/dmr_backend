import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "dmr-poultries-backend",
    });
  })
);
