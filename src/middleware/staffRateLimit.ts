import type { NextFunction, Request, Response } from "express";

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
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      req.ip ??
      (Array.isArray(forwarded)
        ? forwarded[0]
        : typeof forwarded === "string"
          ? forwarded.split(",")[0]?.trim()
          : undefined) ??
      req.socket.remoteAddress ??
      "unknown";
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
