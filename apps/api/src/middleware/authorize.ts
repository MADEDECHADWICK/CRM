import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { organizationScope, opportunityScope, type AccessUser } from "../lib/accessScope";
export { organizationScope, opportunityScope, contactScope, noteScope, followupScope } from "../lib/accessScope";

export interface AuthedRequest extends Request {
  user?: AccessUser;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  // A `?token=` fallback exists only so file downloads work: a browser link or
  // a native share cannot attach an Authorization header. Normal API calls use
  // the header.
  const queryToken = typeof req.query?.token === "string" ? req.query.token : undefined;
  const rawToken = header ? header.replace("Bearer ", "") : queryToken;

  if (!rawToken) return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED" } });

  let payload: { id?: string };
  try {
    payload = jwt.verify(rawToken, process.env.JWT_SECRET!) as { id?: string };
  } catch {
    return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN" } });
  }

  if (!payload?.id) {
    return res.status(401).json({ success: false, error: { code: "INVALID_TOKEN" } });
  }

  // Resolve the CURRENT role from the database instead of trusting the role
  // baked into the token. A token is valid for a week, so reading the role
  // from it meant a demotion (Partner -> Manager) had no effect until the
  // token expired, and a deleted account kept working. One indexed primary-key
  // lookup per request is the price of authority that is never stale.
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, departmentId: true, headedDepartments: { select: { id: true } } },
  });

  if (!user) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED" } });
  }

  req.user = { id: user.id, role: user.role, departmentId: user.departmentId, headedDepartmentIds: user.headedDepartments.map(d => d.id) };
  next();
}

export async function scopedOrganization(user: AuthedRequest["user"], id: string) {
  return prisma.organization.findFirst({ where: { AND: [{ id }, organizationScope(user)] } });
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
