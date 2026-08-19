import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { pool } from "../config/db.js";
import {
  mobileAuthService,
  type MobileAuthContext,
} from "../services/mobileAuthService.js";
import { mobileTripsService } from "../services/mobileTripsService.js";

type AuthedRequest = Request & { mobileAuth: MobileAuthContext };

export const mobileRouter = Router();

async function requireMobileAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    (req as AuthedRequest).mobileAuth = await mobileAuthService.authenticate(
      req.header("authorization")
    );
    next();
  } catch (error) {
    next(error);
  }
}

mobileRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    res.json(await mobileAuthService.login(username, password));
  })
);

mobileRouter.post(
  "/auth/logout",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    await mobileAuthService.logout((req as AuthedRequest).mobileAuth.tokenHash);
    res.json({ ok: true });
  })
);

mobileRouter.get(
  "/auth/me",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    res.json(await mobileAuthService.me((req as AuthedRequest).mobileAuth));
  })
);

mobileRouter.get(
  "/sync/health",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    await pool.query("SELECT 1");
    const auth = (req as AuthedRequest).mobileAuth;
    res.json({
      ok: true,
      authenticated: true,
      databaseReachable: true,
      supervisorId: auth.employeeId,
      serverTime: new Date().toISOString(),
    });
  })
);

mobileRouter.get(
  "/bootstrap",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    res.json(await mobileTripsService.bootstrap((req as AuthedRequest).mobileAuth));
  })
);

mobileRouter.get(
  "/trips",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    res.json(await mobileTripsService.listDrafts((req as AuthedRequest).mobileAuth));
  })
);

mobileRouter.post(
  "/trips/steps/start",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await mobileTripsService.applyStart((req as AuthedRequest).mobileAuth, req.body ?? {}));
  })
);

mobileRouter.get(
  "/trips/:id",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await mobileTripsService.getTrip((req as AuthedRequest).mobileAuth, Number(req.params.id))
    );
  })
);

mobileRouter.post(
  "/trips/:id/steps/:step",
  requireMobileAuth,
  asyncHandler(async (req, res) => {
    const step = req.params.step;
    if (!["start", "farm", "pickup", "deliveries", "expenses"].includes(step)) {
      throw new AppError(400, "Invalid step. Use start|farm|pickup|deliveries|expenses");
    }
    res.json(
      await mobileTripsService.applyStep(
        (req as AuthedRequest).mobileAuth,
        Number(req.params.id),
        step as "start" | "farm" | "pickup" | "deliveries" | "expenses",
        req.body ?? {}
      )
    );
  })
);
