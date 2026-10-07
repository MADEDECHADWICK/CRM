import type { NextFunction, Request, Response } from "express";

/**
 * A few baseline security headers for the JSON API.
 *
 * This is the subset that matters for an API and costs nothing: it stops the
 * browser from MIME-sniffing responses, keeps the API out of a framing
 * context, and limits referrer leakage. Deliberately dependency-free — the
 * full `helmet` set is overkill for an API that returns JSON and is served
 * from the same host as the web client. A Content-Security-Policy belongs on
 * the static web host, not here.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
}
