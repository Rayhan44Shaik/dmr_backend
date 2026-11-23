import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import { AppError } from "./errorHandler.js";
import { env } from "../config/env.js";

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Production API requests must arrive through the Cloudflare Pages Function,
 * which attaches the private proof header. This blocks direct access to the
 * tunnel hostname (and anything else that can reach the Node port) even when
 * the attacker supplies a forged CF-Connecting-IP. Health checks stay public
 * and are mounted before this middleware so they remain reachable.
 */
export const requireProxyProof: RequestHandler = (req, _res, next) => {
  const expected = env.trustedProxySecret;
  if (!expected) return next();
  const proof = req.get("X-DMR-Proxy-Secret") ?? "";
  if (!equalSecret(proof, expected)) {
    return next(new AppError(403, "Proxy authentication required"));
  }
  next();
};

/**
 * Uses Cloudflare's client address only when the Pages proxy proves itself
 * with a shared secret. Express trust-proxy remains disabled, so arbitrary
 * X-Forwarded-For/CF-Connecting-IP values sent directly to the tunnel are not
 * trusted.
 */
export function clientAddress(req: Request): string {
  const expected = env.trustedProxySecret;
  const proof = req.get("X-DMR-Proxy-Secret") ?? "";
  const cloudflareIp = req.get("CF-Connecting-IP")?.trim() ?? "";
  if (expected && equalSecret(proof, expected) && isIP(cloudflareIp)) return cloudflareIp;
  return req.ip || req.socket.remoteAddress || "unknown";
}
