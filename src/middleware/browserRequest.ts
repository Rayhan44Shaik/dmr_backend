import type { RequestHandler } from "express";
import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Defense in depth for cookie-authenticated browser writes. SameSite=Strict
 * is retained; Fetch Metadata and Origin additionally reject cross-site form/
 * fetch attempts. Non-browser mobile Bearer clients remain unaffected. */
export const protectCookieWrites: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!/(?:^|;\s*)dmr_session=/.test(req.get("Cookie") ?? "")) return next();

  const site = req.get("Sec-Fetch-Site")?.toLowerCase();
  if (site === "cross-site") {
    return res.status(403).json({ error: "Cross-site request blocked" });
  }
  const origin = req.get("Origin");
  if (origin && !env.corsOrigin.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  return next();
};
