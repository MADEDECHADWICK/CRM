import { accessibleDepartmentIds } from "../../lib/accessScope";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, opportunityScope, organizationScope } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";
import { directorySearch, prospectDirectoryWhere } from "../../lib/organizationViews";
import { canCreateProspect } from "@crm/core";
import { assignmentInclude, assignAccount, createProspect, ProspectError } from "./prospectActions";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

const idParamSchema = z.object({ id: z.string().uuid() });

// "" and null both mean "clear this field" on PATCH; omitted means unchanged.
const nullableText = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v))
  .optional();

const createSchema = z.object({
  name: z.string().trim().min(1),
  industry: nullableText,
  phone: nullableText,
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).transform(v => v || null).optional(),
  // BR-020 requires an address before a deal may become a proposal. Until now
  // no endpoint could set it, which made the gate unsatisfiable for every
  // API-created organization.
  address: nullableText,
  website: nullableText,
  country: nullableText,
  contractingEntityId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
  parentOrganizationId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  assignedDepartmentId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  industry: nullableText,
  phone: nullableText,
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  address: nullableText,
  website: nullableText,
  country: nullableText,
  contractingEntityId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
  parentOrganizationId: z.string().uuid().nullable().optional(),
});

// Search + filter in one endpoint — BR-001 is a "search before creating"
// rule, so the frontend calls GET /organizations?q=... and surfaces matches
// before offering a create form. q matches the name, industry is an
// exact match for filtering (PRD 6.1).
organizationsRouter.get("/", async (req: AuthedRequest, res) => {
  const assignment = z.enum(["all", "mine", "department", "unassigned"]).default("all").safeParse(req.query.assignment);
  if (!assignment.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid assignment filter." } });
  const focus = z.string().uuid().optional().safeParse(req.query.id);
  if (!focus.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid organization id." } });
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

  const where = { AND: [organizationScope(req.user), {
      ...(req.query.includeArchived === "true" ? {} : { isArchived: false }),
      ...(assignment.data === "mine" ? { assignedToId: req.user!.id }
        : assignment.data === "department" ? { assignedDepartmentId: { in: accessibleDepartmentIds(req.user!) } }
        : assignment.data === "unassigned" ? { assignedToId: null, assignedDepartmentId: null } : {}),
      ...(focus.data ? { id: focus.data } : {}),
      ...(req.query.view === "prospects" ? prospectDirectoryWhere() : {}),
      ...(industryParam ? { industry: industryParam } : {}),
  }, directorySearch(qParam)] };
  const orgs = await prisma.organization.findMany({
    where,
    // Apply account access before both pagination and totals. Embedded deal
    // data follows exactly the same assignment scope.
    include: {
      ...assignmentInclude,
      ...(req.query.paginated === "true" ? { contacts: { orderBy: { name: "asc" as const } } } : {}),
      opportunities: {
        where: opportunityScope(req.user),
        select: { id: true, stage: true, ownerId: true },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageOf(page.data),
  });
  res.json({ success: true, data: req.query.paginated === "true"
    ? { items: orgs, total: await prisma.organization.count({ where }) }
    : orgs });
});

organizationsRouter.post("/", async (req: AuthedRequest, res) => {
  if (!canCreateProspect(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only administrators and Partners can add prospects." } });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
  }

  try {
    const org = await prisma.$transaction(tx => createProspect(tx, req.user!, parsed.data), { isolationLevel: "Serializable" });
    return res.status(201).json({ success: true, data: org });
  } catch (error) {
    if (error instanceof ProspectError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    throw error;
  }
});

organizationsRouter.patch("/:id/assignment", async (req: AuthedRequest, res) => {
  if (!canCreateProspect(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only administrators and Partners can assign prospects." } });
  const params = idParamSchema.safeParse(req.params);
  const body = z.object({ assignedToId: z.string().uuid().nullable().optional(), assignedDepartmentId: z.string().uuid().nullable().optional() })
    .refine(data => data.assignedToId !== undefined || data.assignedDepartmentId !== undefined).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Choose a valid team member or department, or clear the assignment." } });
  try {
    const org = await prisma.$transaction(tx => assignAccount(tx, req.user!, params.data.id, body.data.assignedToId, body.data.assignedDepartmentId), { isolationLevel: "Serializable" });
    return res.json({ success: true, data: org });
  } catch (error) {
    if (error instanceof ProspectError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    throw error;
  }
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
    .update({ where: { id: params.data.id, AND: [organizationScope(req.user)] }, data: body.data })
    .catch((e: { code?: string }) => {
      if (e?.code === "P2025") return null;
      throw e;
    });

  if (!org) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  }

  res.json({ success: true, data: org });
});
