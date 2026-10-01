import type { Request, RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError, asyncHandler } from "./errorHandler.js";
import { authService, type AuthUser } from "../services/authService.js";

export const SESSION_COOKIE = "dmr_session";
function cookieToken(req: Request): string | null {
  const cookies = String(req.headers.cookie ?? "").split(";");
  for (const entry of cookies) {
    const [name, ...parts] = entry.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return null;
}
export function requestToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return cookieToken(req);
}
export const requireAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim() || null
    : null;
  const cookie = cookieToken(req);
  // A stale persisted Bearer token must not override a newer, valid HttpOnly
  // cookie (common after another tab signs in or storage is restored). Try
  // both distinct credentials before declaring the user unauthenticated.
  let authenticatedToken = bearer;
  let session = bearer ? await authService.authenticate(bearer) : null;
  if (!session && cookie && cookie !== bearer) {
    session = await authService.authenticate(cookie);
    if (session) {
      authenticatedToken = cookie;
      res.setHeader("X-DMR-Session-Token", cookie);
    }
  }
  if (!session) throw new AppError(401, "Authentication required");
  res.locals.authUser = session.user;
  res.locals.authExpiresAt = session.expiresAt;
  res.locals.authToken = authenticatedToken;
  next();
});
export function authUser(res: { locals: Record<string, unknown> }): AuthUser {
  const user = res.locals.authUser as AuthUser | undefined;
  if (!user) throw new AppError(401, "Authentication required");
  return user;
}
export function authExpiresAt(res: { locals: Record<string, unknown> }): string {
  const expiresAt = res.locals.authExpiresAt;
  if (typeof expiresAt !== "string") throw new AppError(401, "Authentication required");
  return expiresAt;
}
export function authToken(res: { locals: Record<string, unknown> }): string {
  const token = res.locals.authToken;
  if (typeof token !== "string" || !token) throw new AppError(401, "Authentication required");
  return token;
}
export function sessionCookie(token: string, expiresAt: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((new Date(expiresAt).getTime()-Date.now())/1000))}${env.nodeEnv === "production" ? "; Secure" : ""}`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.nodeEnv === "production" ? "; Secure" : ""}`;
}
