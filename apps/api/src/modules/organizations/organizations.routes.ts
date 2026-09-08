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

organizationsRouter.get("/", async (req, res) => {
  const orgs = await prisma.organization.findMany({
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