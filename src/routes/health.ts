import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await pool.query("SELECT NOW() AS now, current_database() AS db");
    res.json({
      ok: true,
      service: "dmr-poultries-backend",
      phase: "local-postgres",
      database: result.rows[0].db,
      serverTime: result.rows[0].now,
    });
  })
);
