import type { NextFunction, Request, Response } from "express";
import { clientAddress } from "./clientAddress.js";

interface Bucket {
  count: number;
  resetAt: number;
}

interface LimiterOptions {
  windowMs: number;
  max: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
}

/**
 * P3: Staff-scope fixed-window rate limiter (no new dependencies).
 * Abusive clients get a controlled 429 with Retry-After instead of unbounded
 * DB work. Mounted on the Staff router only, so no unrelated module changes
 * behavior. Exported factory + reset keep the new regression test
 * deterministic.
 */
export function createRateLimiter(options: LimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    // Only the verified Pages proxy may supply Cloudflare's client address.
    // Direct requests and forged X-Forwarded-For values fall back to the
    // socket address; requireProxyProof separately rejects direct production
    // API traffic before it reaches this router.
    const ip = clientAddress(req);
    const key = `${ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000)
      );
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many requests",
        message:
          "Too many requests. Please slow down and try again shortly.",
      });
      return;
    }
    next();
  }) as RateLimiter;
  middleware.reset = () => buckets.clear();
  return middleware;
}

/** Production Staff limiter: 300 requests / minute / source IP. */
export const staffRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 300,
});

/** Coarse limit for expensive exports; keyed by the same verified identity. */
export const exportRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
});

/** Apply the export limiter only to requests explicitly exporting data. */
export function exportOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (String(req.query.export ?? "").toLowerCase() !== "true") return next();
  exportRateLimit(req, res, next);
}
