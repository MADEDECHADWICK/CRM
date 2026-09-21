import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

// Search + filter in one endpoint — BR-001 is a "search before creating"
// rule, so the frontend calls GET /organizations?q=... and surfaces matches
// before offering a create form. q matches the name, industry is an
// exact match for filtering (PRD 6.1).
organizationsRouter.get("/", async (req, res) => {
  const qParam = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const industryParam =
    typeof req.query.industry === "string" && req.query.industry.trim() !== ""
      ? req.query.industry.trim()
      : undefined;

  const orgs = await prisma.organization.findMany({
    where: {
      ...(qParam
        ? { name: { contains: qParam, mode: "insensitive" } }
        : {}),
      ...(industryParam ? { industry: industryParam } : {}),
    },
    include: { opportunities: true },
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: orgs });
});

organizationsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
  }
  const org = await prisma.organization.create({ data: parsed.data });
  res.status(201).json({ success: true, data: org });
});