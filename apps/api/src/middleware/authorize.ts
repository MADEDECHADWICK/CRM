import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthedRequest extends Request {
  user?: { id: string; role: "MARKETING_BD" | "PARTNER" | "MANAGER" };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED" } });
  try {
    const payload = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET!) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN" } });
  }
}

// The single place the Marketing&BD/Partner-see-all vs Manager-sees-own
// rule lives — every query in every module imports this instead of
// re-implementing the check.
export function opportunityScope(user: AuthedRequest["user"]) {
  if (!user) return { id: "never-matches" };
  if (user.role === "MARKETING_BD" || user.role === "PARTNER") return {};
  return { ownerId: user.id };
}

/**
 * Loads an opportunity only if it falls inside the caller's data scope.
 *
 * Reads have always gone through opportunityScope (list/detail), but the
 * mutating handlers — transition, deadline, breach-note — wrote straight to a
 * known id, so a Manager could act on a deal she does not own. Routing every
 * such write through this one helper is what keeps "you may only change what
 * you may see" true, rather than a rule each handler has to remember.
 *
 * Returns null both when the row does not exist and when it is out of scope,
 * so callers return 404 either way and never leak the existence of a deal
 * outside the caller's scope.
 */
export async function scopedOpportunity<
  const S extends Record<string, boolean> | undefined = undefined
>(user: AuthedRequest["user"], id: string, select?: S) {
  return prisma.opportunity.findFirst({
    where: { id, ...opportunityScope(user) },
    ...(select ? { select } : {}),
  });
}