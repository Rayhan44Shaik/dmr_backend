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
  const token = requestToken(req);
  const session = token ? await authService.authenticate(token) : null;
  if (!session) throw new AppError(401, "Authentication required");
  res.locals.authUser = session.user;
  res.locals.authExpiresAt = session.expiresAt;
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
export function sessionCookie(token: string, expiresAt: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((new Date(expiresAt).getTime()-Date.now())/1000))}${env.nodeEnv === "production" ? "; Secure" : ""}`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.nodeEnv === "production" ? "; Secure" : ""}`;
}
