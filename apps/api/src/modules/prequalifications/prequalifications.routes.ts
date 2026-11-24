import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  requireAuth,
  AuthedRequest,
  prequalificationScope,
  scopedOrganization,
  scopedOpportunity,
} from "../../middleware/authorize";
import { recordAudit } from "../../lib/audit";
import {
  PREQUALIFICATION_STATUSES,
  canCreateOpportunityByRole,
  isGroupCommercialOversight,
} from "@crm/core";

export const prequalificationsRouter = Router();
prequalificationsRouter.use(requireAuth);

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  organizationId: z.string().uuid(),
  service: z.string().trim().min(1),
  departmentId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  status: z.enum(PREQUALIFICATION_STATUSES).default("DRAFT"),
  applicationDate: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  acceptedAt: z.string().datetime().optional(),
  rejectedAt: z.string().datetime().optional(),
  cost: z.number().nonnegative().optional(),
  currency: z.string().trim().min(1).optional(),
  validityFrom: z.string().datetime().optional(),
  expiryAt: z.string().datetime().optional(),
  externalReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  renewalOfId: z.string().uuid().optional(),
});

const updateSchema = createSchema.omit({ organizationId: true, renewalOfId: true }).partial().extend({
  status: z.enum(PREQUALIFICATION_STATUSES).optional(),
});

prequalificationsRouter.get("/", async (req: AuthedRequest, res) => {
  const query = z.object({
    status: z.enum(PREQUALIFICATION_STATUSES).optional(),
    organizationId: z.string().uuid().optional(),
    expiringBefore: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: query.error.message } });

  const rows = await prisma.prequalification.findMany({
    where: {
      AND: [
        prequalificationScope(req.user),
        query.data.status ? { status: query.data.status } : {},
        query.data.organizationId ? { organizationId: query.data.organizationId } : {},
        query.data.expiringBefore ? { expiryAt: { lte: new Date(query.data.expiringBefore) } } : {},
      ],
    },
    include: {
      organization: { select: { id: true, name: true, country: true } },
      department: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      renewalOf: { select: { id: true, status: true } },
    },
    orderBy: [{ expiryAt: "asc" }, { createdAt: "desc" }],
    take: query.data.limit,
  });
  res.json({ success: true, data: rows });
});

prequalificationsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const row = await prisma.prequalification.findFirst({
    where: { AND: [{ id: params.data.id }, prequalificationScope(req.user)] },
    include: {
      organization: true,
      department: true,
      owner: { select: { id: true, name: true } },
      renewalOf: true,
      renewals: true,
      sourceOpportunities: { select: { id: true, title: true, outcome: true } },
    },
  });
  if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prequalification not found or not in your scope." } });
  res.json({ success: true, data: row });
});

prequalificationsRouter.post("/", async (req: AuthedRequest, res) => {
  if (!canCreateOpportunityByRole(req.user!.role)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot create prequalification applications." } });
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
  if (!await scopedOrganization(req.user, parsed.data.organizationId)) {
    return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found." } });
  }
  if (parsed.data.departmentId && !await prisma.department.findUnique({ where: { id: parsed.data.departmentId }, select: { id: true } })) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Department not found." } });
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.prequalification.create({
      data: {
        organizationId: parsed.data.organizationId,
        service: parsed.data.service.trim(),
        departmentId: parsed.data.departmentId ?? null,
        ownerId: parsed.data.ownerId ?? req.user!.id,
        status: parsed.data.status,
        applicationDate: parsed.data.applicationDate ? new Date(parsed.data.applicationDate) : null,
        submittedAt: parsed.data.submittedAt ? new Date(parsed.data.submittedAt) : null,
        acceptedAt: parsed.data.acceptedAt ? new Date(parsed.data.acceptedAt) : null,
        rejectedAt: parsed.data.rejectedAt ? new Date(parsed.data.rejectedAt) : null,
        cost: parsed.data.cost ?? null,
        currency: parsed.data.currency ?? "KES",
        validityFrom: parsed.data.validityFrom ? new Date(parsed.data.validityFrom) : null,
        expiryAt: parsed.data.expiryAt ? new Date(parsed.data.expiryAt) : null,
        externalReference: parsed.data.externalReference?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        renewalOfId: parsed.data.renewalOfId ?? null,
        createdById: req.user!.id,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "CREATE",
      entityType: "Prequalification",
      entityId: created.id,
      summary: `Prequalification application created for ${created.service}`,
      after: created,
    });
    // Acceptance is explicitly NOT a win or proposal revenue. No opportunity
    // or win record is created here.
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

prequalificationsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  }
  const existing = await prisma.prequalification.findFirst({ where: { AND: [{ id: params.data.id }, prequalificationScope(req.user)] } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prequalification not found or not in your scope." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && existing.ownerId !== req.user!.id && existing.createdById !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the owner, creator or group oversight may edit this application." } });
  }

  const data = {
    ...(body.data.service !== undefined ? { service: body.data.service.trim() } : {}),
    ...(body.data.departmentId !== undefined ? { departmentId: body.data.departmentId } : {}),
    ...(body.data.ownerId !== undefined ? { ownerId: body.data.ownerId } : {}),
    ...(body.data.status !== undefined ? { status: body.data.status } : {}),
    ...(body.data.applicationDate !== undefined ? { applicationDate: new Date(body.data.applicationDate) } : {}),
    ...(body.data.submittedAt !== undefined ? { submittedAt: new Date(body.data.submittedAt) } : {}),
    ...(body.data.acceptedAt !== undefined ? { acceptedAt: new Date(body.data.acceptedAt) } : {}),
    ...(body.data.rejectedAt !== undefined ? { rejectedAt: new Date(body.data.rejectedAt) } : {}),
    ...(body.data.cost !== undefined ? { cost: body.data.cost } : {}),
    ...(body.data.currency !== undefined ? { currency: body.data.currency } : {}),
    ...(body.data.validityFrom !== undefined ? { validityFrom: new Date(body.data.validityFrom) } : {}),
    ...(body.data.expiryAt !== undefined ? { expiryAt: new Date(body.data.expiryAt) } : {}),
    ...(body.data.externalReference !== undefined ? { externalReference: body.data.externalReference.trim() || null } : {}),
    ...(body.data.notes !== undefined ? { notes: body.data.notes.trim() || null } : {}),
  };

  if (body.data.status === "ACCEPTED" && !existing.acceptedAt && body.data.acceptedAt === undefined) {
    (data as Record<string, unknown>).acceptedAt = new Date();
  }
  if (body.data.status === "SUBMITTED" && !existing.submittedAt && body.data.submittedAt === undefined) {
    (data as Record<string, unknown>).submittedAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.prequalification.update({ where: { id: existing.id }, data });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Prequalification",
      entityId: row.id,
      summary: `Prequalification updated${body.data.status ? ` to ${body.data.status}` : ""}`,
      before: existing,
      after: row,
      metadata: { note: "Panel acceptance never creates a won opportunity or revenue." },
    });
    return row;
  });
  res.json({ success: true, data: updated });
});

prequalificationsRouter.post("/:id/renew", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const existing = await prisma.prequalification.findFirst({ where: { AND: [{ id: params.data.id }, prequalificationScope(req.user)] } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prequalification not found or not in your scope." } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.prequalification.create({
      data: {
        organizationId: existing.organizationId,
        service: existing.service,
        departmentId: existing.departmentId,
        ownerId: existing.ownerId,
        status: "DRAFT",
        currency: existing.currency,
        renewalOfId: existing.id,
        createdById: req.user!.id,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "CREATE",
      entityType: "Prequalification",
      entityId: created.id,
      summary: `Renewal application created from ${existing.id}`,
      metadata: { renewalOfId: existing.id },
    });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

prequalificationsRouter.post("/:id/link-opportunity", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({ opportunityId: z.string().uuid() }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "A prequalification id and opportunity id are required." } });
  const existing = await prisma.prequalification.findFirst({ where: { AND: [{ id: params.data.id }, prequalificationScope(req.user)] } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prequalification not found or not in your scope." } });
  if (!await scopedOpportunity(req.user, body.data.opportunityId)) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opportunity.update({ where: { id: body.data.opportunityId }, data: { sourcePrequalificationId: existing.id } });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: row.id,
      summary: `Linked to prequalification ${existing.id}`,
      after: { sourcePrequalificationId: existing.id },
    });
    return row;
  });
  res.json({ success: true, data: updated });
});
