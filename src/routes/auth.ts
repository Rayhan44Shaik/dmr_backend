import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/authService.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { authExpiresAt, authToken, authUser, clearSessionCookie, requestToken, requireAuth, sessionCookie } from "../middleware/auth.js";

export const authRouter = Router();
const credentials = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(1024) }).strict();
const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(1024),
    totpCode: z.string().min(1).max(32).optional(),
  })
  .strict();
const mfaConfirmBody = z.object({ code: z.string().min(1).max(32) }).strict();
const mfaVerifyBody = z
  .object({ ticket: z.string().min(1).max(512), code: z.string().min(1).max(32) })
  .strict();
const mfaDisableBody = z.object({ code: z.string().min(1).max(32) }).strict();
const forgotPasswordBody = z.object({ username: z.string().trim().min(1).max(100) }).strict();
const resetPasswordBody = z
  .object({ token: z.string().min(1).max(512), newPassword: z.string().min(12).max(1024) })
  .strict();

// Fallback reset throttle (process-local). The login allowance below is
// primarily shared (see authService.throttle*); both fail open.
const failedLogins = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS = 10;
const resetRequests = new Map<string, { count: number; resetAt: number }>();
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_ATTEMPTS = 5;

function auditMeta(req: { ip?: string }, res: { locals: Record<string, unknown> }) {
  return {
    ip: typeof req.ip === "string" ? req.ip : null,
    requestId: typeof res.locals.requestId === "string" ? (res.locals.requestId as string) : null,
    userAgent: typeof (req as { headers?: Record<string,string> }).headers?.["user-agent"] === "string" ? (req as { headers: Record<string,string> }).headers["user-agent"] : null,
  };
}

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "Invalid login request");
  const loginKey = `${req.ip}:${parsed.data.username.toLowerCase()}`;
  // Shared (multi-instance) allowance first; memory map remains as fallback
  // inside the service when the store is unreachable.
  await authService.throttleConsume(loginKey);
  const prior = failedLogins.get(loginKey);
  if (prior && prior.resetAt > Date.now() && prior.count >= LOGIN_ATTEMPTS) throw new AppError(429, "Too many login attempts; try again later");
  let session;
  try {
    session = await authService.login(parsed.data.username, parsed.data.password, auditMeta(req, res));
    await authService.throttleClear(loginKey);
    failedLogins.delete(loginKey);
  } catch (error) {
    // Only rejected credentials consume the login-attempt allowance. Database
    // outages and missing auth schema are service failures, not user failures.
    if (error instanceof AppError && error.status === 401) {
      authService.recordLoginFailure(parsed.data.username, auditMeta(req, res));
      await authService.throttleFailure(loginKey);
      const current = prior && prior.resetAt > Date.now() ? prior : { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
      failedLogins.set(loginKey, { ...current, count: current.count + 1 });
    }
    throw error;
  }
  if ("mfaRequired" in session && session.mfaRequired) {
    // Password accepted, second factor pending. No session exists yet — the
    // ticket authorizes exactly one verify call (same shape for mobile).
    return res.json({ mfaRequired: true, mfaTicket: session.mfaTicket, user: session.user });
  }
  const mobile = req.baseUrl.includes("/mobile/");
  if (mobile) {
    if (session.user.role !== "SUPERVISOR" || session.user.employeeId == null) {
      await authService.logout(session.token, auditMeta(req, res));
      throw new AppError(403, "Mobile access requires a linked Supervisor account");
    }
    return res.json({ token: session.token, expiresAt: session.expiresAt, supervisor: mobileProfile(session.user) });
  }
  // Desktop: HttpOnly cookie for same-origin browsers, plus `token` in the body
  // so the SPA Bearer [REDACTED] (localStorage) can authenticate through the Vite
  // /api proxy without relying on cookie forwarding alone.
  res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
  return res.json({
    user: session.user,
    expiresAt: session.expiresAt,
    previousSessionsEnded: session.previousSessionsEnded > 0,
  });
}));
/** Genuine-activity ping: the ONLY read that extends the idle deadline.
 *  The frontend calls this (throttled) on real pointer/keyboard/touch/form
 *  interaction. Polling, /auth/me, health checks, and timers never touch it.
 *  Spam is acknowledged without a write and can never move the absolute
 *  expiry (expires_at is read-only here). */
authRouter.post("/activity", requireAuth, asyncHandler(async (req, res) => {
  const touched = await authService.touchActivity(authToken(res));
  if (!touched) throw new AppError(401, "Authentication required");
  return res.json({ expiresAt: touched.expiresAt, version: touched.version });
}));
authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = authUser(res);
  if (req.baseUrl.includes("/mobile/")) {
    if (user.role !== "SUPERVISOR" || user.employeeId == null) throw new AppError(403, "Mobile access requires a linked Supervisor account");
    return res.json({ supervisor: mobileProfile(user), expiresAt: authExpiresAt(res) });
  }
  return res.json({ user });
}));
authRouter.get("/profile", requireAuth, asyncHandler(async (_req, res) => {
  const user = authUser(res);
  const profile = await authService.profile(user.id);
  return res.json({ profile });
}));
// Logout is idempotent. An already expired/revoked session is still a
// successful logout and must clear the browser cookie rather than emit 401.
authRouter.post("/logout", asyncHandler(async (req, res) => {
  const token = requestToken(req);
  if (token) await authService.logout(token, auditMeta(req, res));
  res.setHeader("Set-Cookie", clearSessionCookie()); res.status(204).end();
}));

authRouter.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const parsed = changePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "New password must be 12–1024 characters and both fields are required");
  }
  const user = authUser(res);
  await authService.changePassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
    auditMeta(req, res),
    parsed.data.totpCode,
  );
  // Sessions are revoked — clear cookie so the client must sign in again.
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(204).end();
}));

/**
 * Forgot-password request. ALWAYS returns the same generic success shape —
 * existing and nonexistent accounts are indistinguishable (same response,
 * same status, comparable work). Rate limited per IP+account.
 */
authRouter.post("/forgot-password", asyncHandler(async (req, res) => {
  const parsed = forgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    // Generic shape even for malformed input (no oracle either way).
    return res.json({ message: "If an account exists for that username, a reset was prepared." });
  }
  const resetKey = `${req.ip}:${parsed.data.username.toLowerCase()}`;
  const prior = resetRequests.get(resetKey);
  if (prior && prior.resetAt > Date.now() && prior.count >= RESET_ATTEMPTS) {
    throw new AppError(429, "Too many reset attempts; try again later");
  }
  const result = await authService.requestPasswordReset(parsed.data.username, auditMeta(req, res));
  const current = prior && prior.resetAt > Date.now() ? prior : { count: 0, resetAt: Date.now() + RESET_WINDOW_MS };
  resetRequests.set(resetKey, { ...current, count: current.count + 1 });
  return res.json({
    message: "If an account exists for that username, a reset was prepared.",
    // Present ONLY outside production, for operator relay until a delivery
    // channel is configured. Production responses never contain it.
    ...(result.resetToken ? { resetToken: result.resetToken } : {}),
  });
}));

/**
 * Forgot-password completion. Generic 401 for unknown/expired/used tokens.
 * On success all sessions are revoked and NO session is created — the user
 * signs in normally afterwards.
 */
authRouter.post("/reset-password", asyncHandler(async (req, res) => {
  const parsed = resetPasswordBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(401, "This reset link is invalid or has expired");
  await authService.completePasswordReset(parsed.data.token, parsed.data.newPassword, auditMeta(req, res));
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.json({ message: "Password has been reset. Please sign in." });
}));

/**
 * Second-factor status for the signed-in account (drives settings UI).
 */
authRouter.get("/mfa/status", requireAuth, asyncHandler(async (req, res) => {
  return res.json(await authService.mfaStatus(authUser(res).id));
}));

/**
 * Begin TOTP enrollment. Returns provisioning material ONCE to the
 * authenticated owner — never logged, never returned again.
 */
authRouter.post("/mfa/enroll", requireAuth, asyncHandler(async (req, res) => {
  return res.json(await authService.mfaEnrollStart(authUser(res).id, auditMeta(req, res)));
}));

/**
 * Confirm enrollment with a live authenticator code. Returns the one-time
 * recovery codes (shown once, hashed at rest).
 */
authRouter.post("/mfa/confirm", requireAuth, asyncHandler(async (req, res) => {
  const parsed = mfaConfirmBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "A 6-digit code is required");
  return res.json(await authService.mfaEnrollConfirm(authUser(res).id, parsed.data.code, auditMeta(req, res)));
}));

/**
 * Consume a login challenge ticket. Creates the real session on success
 * (desktop cookie+token shape, or the mobile supervisor shape).
 */
authRouter.post("/mfa/verify", asyncHandler(async (req, res) => {
  const parsed = mfaVerifyBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(401, "Two-factor verification failed");
  const session = await authService.mfaVerifyTicket(parsed.data.ticket, parsed.data.code, auditMeta(req, res));
  if (req.baseUrl.includes("/mobile/")) {
    if (session.user.role !== "SUPERVISOR" || session.user.employeeId == null) {
      await authService.logout(session.token, auditMeta(req, res));
      throw new AppError(403, "Mobile access requires a linked Supervisor account");
    }
    return res.json({ token: session.token, expiresAt: session.expiresAt, supervisor: mobileProfile(session.user) });
  }
  res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
  return res.json({
    user: session.user,
    expiresAt: session.expiresAt,
    previousSessionsEnded: session.previousSessionsEnded > 0,
  });
}));

/**
 * Disable the factor (live TOTP or unused recovery code required — a bare
 * session cannot drop protection).
 */
authRouter.post("/mfa/disable", requireAuth, asyncHandler(async (req, res) => {
  const parsed = mfaDisableBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "A verification code is required");
  await authService.mfaDisable(authUser(res).id, parsed.data.code, auditMeta(req, res));
  return res.status(204).end();
}));

/**
 * OWNER-only recovery: revoke a user's factors, codes, and live tickets.
 */
authRouter.post("/mfa/reset/:userId", requireAuth, asyncHandler(async (req, res) => {
  const target = Number(req.params.userId);
  if (!Number.isSafeInteger(target) || target < 1) throw new AppError(400, "Invalid user id");
  await authService.mfaAdminReset(authUser(res), target, auditMeta(req, res));
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
