import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

// "" and null both mean "clear this field" on PATCH; omitted means unchanged.
const nullableText = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v))
  .optional();

const createSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  // BR-020 requires an address before a deal may become a proposal. Until now
  // no endpoint could set it, which made the gate unsatisfiable for every
  // API-created organization.
  address: z.string().optional(),
  website: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  phone: nullableText,
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  address: nullableText,
  website: nullableText,
});

// Search + filter in one endpoint — BR-001 is a "search before creating"
// rule, so the frontend calls GET /organizations?q=... and surfaces matches
// before offering a create form. q matches the name, industry is an
// exact match for filtering (PRD 6.1).
organizationsRouter.get("/", async (req: AuthedRequest, res) => {
  const qParam = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const industryParam =
    typeof req.query.industry === "string" && req.query.industry.trim() !== ""
      ? req.query.industry.trim()
      : undefined;

  const page = paginationSchema.safeParse(req.query);
  if (!page.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: page.error.message },
    });
  }

  const orgs = await prisma.organization.findMany({
    where: {
      ...(qParam
        ? { name: { contains: qParam, mode: "insensitive" } }
        : {}),
      ...(industryParam ? { industry: industryParam } : {}),
    },
    // The list is shared by every role, so the embedded opportunities must be
    // narrowed with the same scope as the pipeline itself. Returning every
    // deal of every org handed a Manager other people's titles, owners and
    // amounts (BR-012). The `stage` is kept because the client derives an
    // org's client/prospect badge from it.
    include: {
      opportunities: {
        where: opportunityScope(req.user),
        select: { id: true, stage: true, ownerId: true },
      },
    },
    orderBy: { name: "asc" },
    ...pageOf(page.data),
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

// Edit an organization's record — most importantly its address, which BR-020
// requires before a proposal but which had no setter at all. Also lets the
// switchboard email/phone be filled in without recreating the org.
organizationsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  const org = await prisma.organization
    .update({ where: { id: params.data.id }, data: body.data })
    .catch((e: { code?: string }) => {
      if (e?.code === "P2025") return null;
      throw e;
    });

  if (!org) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  }

  res.json({ success: true, data: org });
});