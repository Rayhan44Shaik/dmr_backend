import type { NextFunction, Request, Response } from "express";

/** P3: helmet-style security headers at the serving layer (in app code so the
 *  Staff audit can verify them on responses). JSON API carries no active
 *  content, so the policy is restrictive by design. */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
  // HSTS only matters behind HTTPS; harmless on plain HTTP, honored on TLS.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  next();
}
