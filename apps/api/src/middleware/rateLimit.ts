import type { Request } from "express";

/**
 * A minimal in-memory login throttle.
 *
 * Counts FAILED credential attempts per (client IP + email) in a sliding
 * window and blocks further attempts for that pair once the limit is hit. A
 * successful login clears the pair, so normal use never trips it — only
 * repeated guessing against one account does.
 *
 * Deliberately dependency-free and process-local. It is the right shape for
 * the current single-instance modular monolith; if the API is ever scaled out,
 * this must move to a shared store (Redis) or every replica gets its own
 * counter. The env knobs exist so the window/limit can be tuned per
 * environment without a code change.
 */
const MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 20);
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);

type Bucket = { count: number; resetAt: number };
const attempts = new Map<string, Bucket>();

/** The throttle key: one bucket per client IP per target email. */
export function loginKey(req: Request): string {
  const email = String((req.body as { email?: unknown })?.email ?? "").toLowerCase().trim();
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  return `${ip}|${email}`;
}

/** Seconds to wait before another attempt is allowed, or 0 if not blocked. */
export function loginBlockedFor(key: string): number {
  const bucket = attempts.get(key);
  if (!bucket) return 0;
  const now = Date.now();
  if (bucket.resetAt <= now) {
    attempts.delete(key);
    return 0;
  }
  return bucket.count >= MAX ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();

  // Opportunistic pruning so a spray of distinct emails cannot grow the map
  // without bound.
  if (attempts.size > 5000) {
    for (const [k, b] of attempts) if (b.resetAt <= now) attempts.delete(k);
  }

  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
