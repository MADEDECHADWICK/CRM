import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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