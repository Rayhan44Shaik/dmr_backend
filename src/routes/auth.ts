import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/authService.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { authExpiresAt, authUser, clearSessionCookie, requestToken, requireAuth, sessionCookie } from "../middleware/auth.js";

export const authRouter = Router();
const credentials = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(1024) }).strict();
const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(1024),
  })
  .strict();
const failedLogins = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS = 10;
authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "Invalid login request");
  const loginKey = `${req.ip}:${parsed.data.username.toLowerCase()}`;
  const prior = failedLogins.get(loginKey);
  if (prior && prior.resetAt > Date.now() && prior.count >= LOGIN_ATTEMPTS) throw new AppError(429, "Too many login attempts; try again later");
  let session;
  try {
    session = await authService.login(parsed.data.username, parsed.data.password);
    failedLogins.delete(loginKey);
  } catch (error) {
    // Only rejected credentials consume the login-attempt allowance. Database
    // outages and missing auth schema are service failures, not user failures.
    if (error instanceof AppError && error.status === 401) {
      const current = prior && prior.resetAt > Date.now() ? prior : { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
      failedLogins.set(loginKey, { ...current, count: current.count + 1 });
    }
    throw error;
  }
  const mobile = req.baseUrl.includes("/mobile/");
  if (mobile) {
    if (session.user.role !== "SUPERVISOR" || session.user.employeeId == null) {
      await authService.logout(session.token);
      throw new AppError(403, "Mobile access requires a linked Supervisor account");
    }
    return res.json({ token: session.token, expiresAt: session.expiresAt, supervisor: mobileProfile(session.user) });
  }
  // Desktop: HttpOnly cookie for same-origin browsers, plus `token` in the body
  // so the SPA Bearer client (localStorage) can authenticate through the Vite
  // /api proxy without relying on cookie forwarding alone.
  res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
  return res.json({
    user: session.user,
    token: session.token,
    expiresAt: session.expiresAt,
    previousSessionsEnded: session.previousSessionsEnded > 0,
  });
}));
authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = authUser(res);
  if (req.baseUrl.includes("/mobile/")) {
    if (user.role !== "SUPERVISOR" || user.employeeId == null) throw new AppError(403, "Mobile access requires a linked Supervisor account");
    return res.json({ supervisor: mobileProfile(user), expiresAt: authExpiresAt(res) });
  }
  return res.json({ user });
}));
authRouter.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  const token = requestToken(req); if (token) await authService.logout(token);
  res.setHeader("Set-Cookie", clearSessionCookie()); res.status(204).end();
}));

authRouter.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const parsed = changePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "New password must be 12–1024 characters and both fields are required");
  }
  const user = authUser(res);
  await authService.changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  // Sessions are revoked — clear cookie so the client must sign in again.
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(204).end();
}));

function mobileProfile(user: ReturnType<typeof authUser>) {
  return {
    accountId: String(user.id),
    employeeId: user.employeeId,
    employeeName: user.displayName,
    username: user.username,
    role: user.role,
    department: "Operations",
  };
}
