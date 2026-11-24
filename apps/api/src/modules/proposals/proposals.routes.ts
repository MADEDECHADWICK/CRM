import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, scopedOpportunity, opportunityScope } from "../../middleware/authorize";
import { recordAudit, getSetting, queueNotification } from "../../lib/audit";
import {
  CHECKLIST_ITEM_STATUSES,
  CONFIG_KEYS,
  CONFIG_DEFAULTS,
  PROPOSAL_STATUSES,
  canConfigureSystem,
  canReviewProposalRole,
  evaluateDispatchGate,
  isCommercialApprover,
  isGroupCommercialOversight,
  isSelfApproval,
  isWithinApprovalLimit,
  materialChanges,
  type MaterialComparable,
  DEFAULT_MATERIAL_CHANGE_FIELDS,
} from "@crm/core";

export const proposalsRouter = Router();
proposalsRouter.use(requireAuth);

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

async function scopedRevision(user: AuthedRequest["user"], revisionId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.proposalRevision.findFirst({
    where: {
      id: revisionId,
      proposal: { opportunity: { is: opportunityScope(user) } },
    },
    include: {
      proposal: { include: { opportunity: { include: { organization: true } } } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      credentialReferences: { include: { credential: true } },
      submissions: { orderBy: { submittedAt: "asc" } },
      checklistTemplateVersion: true,
    },
  });
}

async function scopedProposal(
  user: AuthedRequest["user"],
  proposalId: string,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.proposal.findFirst({
    where: { id: proposalId, opportunity: { is: opportunityScope(user) } },
    include: {
      opportunity: {
        select: {
          id: true, title: true, ownerId: true, signingPartnerId: true,
          currency: true, approvedQuotedFee: true, submittedFee: true,
        },
      },
      technicalOwner: { select: { id: true, name: true, role: true } },
      bdOwner: { select: { id: true, name: true, role: true } },
      revisions: { orderBy: { revisionNumber: "desc" } },
    },
  });
}

function snapshotOf(revision: {
  feeAmount?: Prisma.Decimal | null;
  feeCurrency?: string | null;
  scopeSummary?: string | null;
  keyTerms?: string | null;
  summary?: string | null;
}): MaterialComparable {
  return {
    approvedQuotedFee: decimalToNumber(revision.feeAmount),
    currency: revision.feeCurrency,
    scope: revision.scopeSummary,
    description: revision.keyTerms,
    submissionSummary: revision.summary,
  } as MaterialComparable;
}

// ── Checklist template configuration ────────────────────────────────────────

proposalsRouter.get("/checklist-templates", async (_req: AuthedRequest, res) => {
  const rows = await prisma.checklistTemplate.findMany({
    include: { versions: { include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { version: "desc" } } },
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: rows });
});

const templateSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().optional() });

proposalsRouter.post("/checklist-templates", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can configure checklists." } });
  const body = templateSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.checklistTemplate.create({ data: { ...body.data, createdById: req.user!.id } });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "ChecklistTemplate", entityId: created.id, summary: `Checklist template created: ${created.name}`, after: created });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

const versionSchema = z.object({
  configuration: z.unknown().optional(),
  items: z.array(z.object({
    code: z.string().trim().min(1),
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    required: z.boolean().default(true),
    requiresReview: z.boolean().default(false),
    responsibleRole: z.string().trim().optional(),
    sortOrder: z.number().int().default(0),
    metadata: z.unknown().optional(),
  })).default([]),
});

proposalsRouter.post("/checklist-templates/:id/versions", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can configure checklists." } });
  const params = idParam.safeParse(req.params);
  const body = versionSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const template = await prisma.checklistTemplate.findUnique({ where: { id: params.data.id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!template) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Checklist template not found." } });
  const version = (template.versions[0]?.version ?? 0) + 1;

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.checklistTemplateVersion.create({
      data: {
        templateId: template.id,
        version,
        status: "DRAFT",
        configuration: (body.data.configuration ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById: req.user!.id,
        items: {
          create: body.data.items.map((item) => ({
            code: item.code,
            label: item.label,
            description: item.description ?? null,
            required: item.required,
            requiresReview: item.requiresReview,
            responsibleRole: item.responsibleRole ?? null,
            sortOrder: item.sortOrder,
            metadata: (item.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "ChecklistTemplateVersion", entityId: created.id, summary: `Checklist template version ${version} drafted`, after: created });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

proposalsRouter.post("/checklist-templates/versions/:id/publish", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can publish checklists." } });
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const existing = await prisma.checklistTemplateVersion.findUnique({ where: { id: params.data.id } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Checklist version not found." } });

  const row = await prisma.$transaction(async (tx) => {
    await tx.checklistTemplateVersion.updateMany({
      where: { templateId: existing.templateId, status: "ACTIVE", id: { not: existing.id } },
      data: { status: "RETIRED" },
    });
    const published = await tx.checklistTemplateVersion.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", publishedAt: new Date(), publishedById: req.user!.id },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "ChecklistTemplateVersion", entityId: published.id, summary: `Checklist version ${published.version} published`, before: existing, after: published });
    return published;
  });
  res.json({ success: true, data: row });
});

// ── Approval policies ───────────────────────────────────────────────────────

proposalsRouter.get("/approval-policies", async (_req: AuthedRequest, res) => {
  const rows = await prisma.approvalPolicy.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  res.json({ success: true, data: rows });
});

const policySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  entityId: uuid.optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  currency: z.string().trim().min(1).default("KES"),
  requiredRole: z.enum(["MARKETING_BD", "PARTNER", "MANAGER", "PROPOSAL_COORDINATOR", "TECHNICAL_REVIEWER", "COUNTRY_LEAD", "IT_ADMIN"]).optional(),
  requiredApprovals: z.number().int().min(1).default(1),
  prohibitsSelfApproval: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

proposalsRouter.post("/approval-policies", async (req: AuthedRequest, res) => {
  if (!canConfigureSystem(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only an authorized administrator can configure approvals." } });
  const body = policySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  if (body.data.minAmount != null && body.data.maxAmount != null && body.data.minAmount > body.data.maxAmount) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "The minimum amount cannot exceed the maximum amount." } });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.approvalPolicy.create({ data: { ...body.data, createdById: req.user!.id } });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "ApprovalPolicy", entityId: created.id, summary: `Approval policy created: ${created.name}`, after: created });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

// ── Credentials (metadata only; no files) ───────────────────────────────────

const credentialSchema = z.object({
  name: z.string().trim().min(1),
  ownerId: uuid.optional(),
  reference: z.string().trim().optional(),
  version: z.string().trim().optional(),
  expiryAt: z.string().datetime().optional(),
  status: z.enum(["ACTIVE", "EXPIRING", "EXPIRED", "REVOKED", "PENDING"]).default("ACTIVE"),
  notes: z.string().trim().optional(),
});

proposalsRouter.get("/credentials", async (_req: AuthedRequest, res) => {
  const rows = await prisma.credential.findMany({ include: { owner: { select: { id: true, name: true } } }, orderBy: { expiryAt: "asc" } });
  res.json({ success: true, data: rows });
});

proposalsRouter.post("/credentials", async (req: AuthedRequest, res) => {
  const body = credentialSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: body.error.message } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.credential.create({
      data: {
        ...body.data,
        expiryAt: body.data.expiryAt ? new Date(body.data.expiryAt) : null,
        ownerId: body.data.ownerId ?? null,
        createdById: req.user!.id,
      },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "Credential", entityId: created.id, summary: `Credential metadata recorded: ${created.name}`, after: created });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

proposalsRouter.patch("/credentials/:id", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = credentialSchema.partial().safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const existing = await prisma.credential.findUnique({ where: { id: params.data.id } });
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Credential not found." } });
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.credential.update({
      where: { id: existing.id },
      data: {
        ...body.data,
        ...(body.data.expiryAt !== undefined ? { expiryAt: new Date(body.data.expiryAt) } : {}),
      },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "Credential", entityId: updated.id, summary: `Credential metadata updated: ${updated.name}`, before: existing, after: updated });
    return updated;
  });
  res.json({ success: true, data: row });
});

// ── Proposals and revisions ─────────────────────────────────────────────────

proposalsRouter.get("/opportunities/:id/proposals", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  if (!await scopedOpportunity(req.user, params.data.id)) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  const rows = await prisma.proposal.findMany({
    where: { opportunityId: params.data.id },
    include: {
      technicalOwner: { select: { id: true, name: true, role: true } },
      bdOwner: { select: { id: true, name: true, role: true } },
      opportunity: { select: { signingPartner: { select: { id: true, name: true } } } },
      revisions: {
        include: {
          submissions: { orderBy: { submittedAt: "asc" } },
          checklistItems: { orderBy: { sortOrder: "asc" } },
          approvals: { orderBy: { createdAt: "desc" } },
          credentialReferences: { include: { credential: true } },
          technicalCompletedBy: { select: { id: true, name: true } },
          bdReviewedBy: { select: { id: true, name: true } },
          partnerSignedBy: { select: { id: true, name: true } },
        },
        orderBy: { revisionNumber: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, data: rows });
});

proposalsRouter.post("/opportunities/:id/proposals", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({ title: z.string().trim().min(1).optional() }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const opp = await scopedOpportunity(req.user, params.data.id, { id: true, title: true });
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({ data: { opportunityId: opp.id, title: body.data.title ?? `Proposal — ${opp.title}`, createdById: req.user!.id } });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "Proposal", entityId: created.id, summary: `Proposal created for ${opp.title}`, after: created });
    return created;
  });
  res.status(201).json({ success: true, data: row });
});

// ── Partner assigns the team lead and BD owner ──────────────────────────────

const assignmentSchema = z.object({
  technicalOwnerId: uuid.nullable().optional(),
  bdOwnerId: uuid.nullable().optional(),
  signingPartnerId: uuid.nullable().optional(),
}).refine(
  (value) => value.technicalOwnerId !== undefined || value.bdOwnerId !== undefined || value.signingPartnerId !== undefined,
  "Choose at least one assignment."
);

proposalsRouter.patch("/proposals/:id/assignment", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = assignmentSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  }
  if (req.user!.role !== "PARTNER" && !isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only a Partner or group commercial oversight can assign the proposal team." } });
  }

  const proposal = await scopedProposal(req.user, params.data.id);
  if (!proposal) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal not found or not in your scope." } });

  if (body.data.technicalOwnerId) {
    const user = await prisma.user.findUnique({ where: { id: body.data.technicalOwnerId }, select: { role: true, isActive: true, name: true } });
    if (!user || !user.isActive || user.role !== "MANAGER") {
      return res.status(400).json({ success: false, error: { code: "INVALID_TEAM_LEAD", message: "The team lead must be an active Manager." } });
    }
  }
  if (body.data.bdOwnerId) {
    const user = await prisma.user.findUnique({ where: { id: body.data.bdOwnerId }, select: { role: true, isActive: true, name: true } });
    if (!user || !user.isActive || !["MARKETING_BD", "PROPOSAL_COORDINATOR"].includes(user.role)) {
      return res.status(400).json({ success: false, error: { code: "INVALID_BD_OWNER", message: "The BD owner must be an active BD or proposal coordinator user." } });
    }
  }
  if (body.data.signingPartnerId) {
    const user = await prisma.user.findUnique({ where: { id: body.data.signingPartnerId }, select: { role: true, isActive: true } });
    if (!user || !user.isActive || user.role !== "PARTNER") {
      return res.status(400).json({ success: false, error: { code: "INVALID_SIGNING_PARTNER", message: "The signing partner must be an active Partner." } });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        ...(body.data.technicalOwnerId !== undefined ? { technicalOwnerId: body.data.technicalOwnerId } : {}),
        ...(body.data.bdOwnerId !== undefined ? { bdOwnerId: body.data.bdOwnerId } : {}),
      },
      include: {
        technicalOwner: { select: { id: true, name: true, role: true } },
        bdOwner: { select: { id: true, name: true, role: true } },
      },
    });
    if (body.data.signingPartnerId !== undefined) {
      await tx.opportunity.update({ where: { id: proposal.opportunity.id }, data: { signingPartnerId: body.data.signingPartnerId } });
    }
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Proposal",
      entityId: proposal.id,
      summary: "Proposal team assigned",
      before: { technicalOwnerId: proposal.technicalOwnerId, bdOwnerId: proposal.bdOwnerId },
      after: { technicalOwnerId: row.technicalOwnerId, bdOwnerId: row.bdOwnerId, signingPartnerId: body.data.signingPartnerId ?? proposal.opportunity.signingPartnerId },
    });

    if (row.technicalOwnerId) {
      await queueNotification(tx, {
        userId: row.technicalOwnerId,
        type: "PROPOSAL_TECHNICAL_ASSIGNED",
        title: "You are the team lead on a proposal",
        body: `Prepare the technical proposal for ${proposal.opportunity.title}, then confirm technical completion.`,
        entityType: "Opportunity",
        entityId: proposal.opportunity.id,
      });
    }
    if (row.bdOwnerId) {
      await queueNotification(tx, {
        userId: row.bdOwnerId,
        type: "PROPOSAL_BD_ASSIGNED",
        title: "You are the BD owner on a proposal",
        body: `Complete the Proposal Quality Review Checklist for ${proposal.opportunity.title} after the team lead confirms technical completion.`,
        entityType: "Opportunity",
        entityId: proposal.opportunity.id,
      });
    }
    return row;
  });
  res.json({ success: true, data: updated });
});

const revisionSchema = z.object({
  checklistTemplateVersionId: uuid.optional(),
  summary: z.string().trim().optional(),
  feeAmount: z.number().nonnegative().optional(),
  feeCurrency: z.string().trim().min(1).optional(),
  scopeSummary: z.string().trim().optional(),
  keyTerms: z.string().trim().optional(),
});

proposalsRouter.post("/proposals/:id/revisions", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = revisionSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const proposal = await prisma.proposal.findFirst({
    where: { id: params.data.id, opportunity: { is: opportunityScope(req.user) } },
    include: { opportunity: { select: { id: true, title: true } } },
  });
  if (!proposal) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal not found or not in your scope." } });

  let templateVersionId = body.data.checklistTemplateVersionId ?? null;
  if (templateVersionId) {
    const version = await prisma.checklistTemplateVersion.findUnique({ where: { id: templateVersionId } });
    if (!version || version.status !== "ACTIVE") return res.status(400).json({ success: false, error: { code: "INVALID_CHECKLIST_VERSION", message: "Choose an active checklist template version." } });
  } else {
    const active = await prisma.checklistTemplateVersion.findFirst({
      where: { status: "ACTIVE", template: { isActive: true } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    templateVersionId = active?.id ?? null;
  }

  const version = templateVersionId
    ? await prisma.checklistTemplateVersion.findUnique({ where: { id: templateVersionId }, include: { items: { orderBy: { sortOrder: "asc" } } } })
    : null;

  const row = await prisma.$transaction(async (tx) => {
    const updatedProposal = await tx.proposal.update({ where: { id: proposal.id }, data: { currentRevisionNumber: { increment: 1 } } });
    const revision = await tx.proposalRevision.create({
      data: {
        proposalId: proposal.id,
        revisionNumber: updatedProposal.currentRevisionNumber,
        status: "PENDING_INPUTS",
        checklistTemplateVersionId: templateVersionId,
        summary: body.data.summary ?? null,
        feeAmount: body.data.feeAmount ?? null,
        feeCurrency: body.data.feeCurrency ?? null,
        scopeSummary: body.data.scopeSummary ?? null,
        keyTerms: body.data.keyTerms ?? null,
        materialSnapshot: snapshotOf(body.data as never) as Prisma.InputJsonValue,
        createdById: req.user!.id,
        ...(version?.items.length ? {
          checklistItems: {
            create: version.items.map((item) => ({
              templateItemId: item.id,
              code: item.code,
              label: item.label,
              description: item.description,
              required: item.required,
              requiresReview: item.requiresReview,
              sortOrder: item.sortOrder,
              responsibleRole: item.responsibleRole,
            })),
          },
        } : {}),
      },
      include: { checklistItems: { orderBy: { sortOrder: "asc" } }, checklistTemplateVersion: true },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "CREATE", entityType: "ProposalRevision", entityId: revision.id, summary: `Proposal revision ${revision.revisionNumber} created`, after: revision });
    return revision;
  });
  res.status(201).json({ success: true, data: row });
});

proposalsRouter.get("/proposal-revisions/:id", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const row = await scopedRevision(req.user, params.data.id);
  if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  res.json({ success: true, data: row });
});

function responsibilityOf(item: { code: string; responsibleRole?: string | null }): "TEAM_LEAD" | "BD" | "PARTNER" {
  if (item.responsibleRole === "TEAM_LEAD" || item.responsibleRole === "BD" || item.responsibleRole === "PARTNER") {
    return item.responsibleRole;
  }
  return item.responsibleRole === "PARTNER" || item.code.startsWith("F") ? "PARTNER" : "BD";
}

function incompleteRequiredChecklist(items: { required: boolean; label: string; status: string }[]) {
  return items
    .filter((item) => item.required && !["COMPLETE", "REVIEWED", "NOT_APPLICABLE"].includes(item.status))
    .map((item) => item.label);
}

// ── Team lead completes the technical work ──────────────────────────────────

proposalsRouter.post("/proposal-revisions/:id/technical-complete", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({ comment: z.string().trim().optional() }).safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  }
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  if (revision.proposal.technicalOwnerId !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the assigned team lead can confirm technical completion." } });
  }
  if (!["TECHNICAL_PREPARATION", "RETURNED_TO_TECHNICAL"].includes(revision.workflowStage)) {
    return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "This revision is not waiting for technical completion." } });
  }
  const missingTechnical = incompleteRequiredChecklist(
    revision.checklistItems.filter((item) => responsibilityOf(item) === "TEAM_LEAD")
  );
  if (missingTechnical.length) {
    return res.status(409).json({
      success: false,
      error: {
        code: "CHECKLIST_INCOMPLETE",
        message: `${missingTechnical.length} Team Lead checklist item${missingTechnical.length === 1 ? "" : "s"} outstanding.`,
        missingChecklist: missingTechnical,
      },
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.proposalRevision.update({
      where: { id: revision.id },
      data: {
        workflowStage: "BD_QUALITY_REVIEW",
        status: "IN_REVIEW",
        technicalCompletedAt: new Date(),
        technicalCompletedById: req.user!.id,
        returnedAt: null,
        returnReason: null,
      },
    });
    await tx.proposalApproval.create({
      data: {
        revisionId: revision.id,
        kind: "REVIEW",
        status: "APPROVED",
        actorId: req.user!.id,
        actorRole: req.user!.role,
        decidedAt: new Date(),
        comment: body.data.comment?.trim() || "Team lead confirmed technical work is complete.",
        amountAtDecision: revision.feeAmount,
        currency: revision.feeCurrency,
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "APPROVE",
      entityType: "ProposalRevision",
      entityId: revision.id,
      summary: "Technical work confirmed complete by team lead",
      before: { workflowStage: revision.workflowStage },
      after: { workflowStage: "BD_QUALITY_REVIEW" },
    });
    if (revision.proposal.bdOwnerId) {
      await queueNotification(tx, {
        userId: revision.proposal.bdOwnerId,
        type: "PROPOSAL_TECHNICAL_COMPLETE",
        title: "Technical work ready for quality review",
        body: `The team lead has completed the technical proposal for ${revision.proposal.opportunity.title}. Complete the quality checklist.`,
        entityType: "Opportunity",
        entityId: revision.proposal.opportunity.id,
      });
    }
    return row;
  });
  res.json({ success: true, data: updated });
});

// ── BD owner completes quality review ───────────────────────────────────────

proposalsRouter.post("/proposal-revisions/:id/bd-review", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({
    decision: z.enum(["SEND_TO_PARTNER", "RETURN_TO_TECHNICAL"]),
    comment: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  }
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  if (revision.proposal.bdOwnerId !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the assigned BD owner can complete the quality review." } });
  }
  if (revision.workflowStage !== "BD_QUALITY_REVIEW") {
    return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "This revision is not waiting for BD quality review." } });
  }
  if (body.data.decision === "RETURN_TO_TECHNICAL" && !body.data.comment?.trim()) {
    return res.status(400).json({ success: false, error: { code: "COMMENT_REQUIRED", message: "Explain what the team lead must change." } });
  }

  if (body.data.decision === "SEND_TO_PARTNER") {
    // Section F is the Partner's sign-off section, so the BD owner cannot
    // complete it before sending the revision to the Partner.
    const missing = incompleteRequiredChecklist(revision.checklistItems.filter((item) => responsibilityOf(item) !== "PARTNER"));
    if (missing.length) {
      return res.status(409).json({
        success: false,
        error: { code: "CHECKLIST_INCOMPLETE", message: `${missing.length} required quality checklist item${missing.length === 1 ? "" : "s"} outstanding.`, missingChecklist: missing },
      });
    }
    if (!revision.proposal.opportunity.signingPartnerId) {
      return res.status(400).json({ success: false, error: { code: "SIGNING_PARTNER_REQUIRED", message: "Assign the signing Partner before sending the proposal for sign-off." } });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const sendToPartner = body.data.decision === "SEND_TO_PARTNER";
    const row = await tx.proposalRevision.update({
      where: { id: revision.id },
      data: {
        workflowStage: sendToPartner ? "PARTNER_SIGNOFF" : "RETURNED_TO_TECHNICAL",
        status: sendToPartner ? "IN_REVIEW" : "CHANGES_REQUESTED",
        bdReviewedAt: new Date(),
        bdReviewedById: req.user!.id,
        ...(sendToPartner ? { returnedAt: null, returnReason: null } : { returnedAt: new Date(), returnReason: body.data.comment!.trim() }),
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: sendToPartner ? "APPROVE" : "REJECT",
      entityType: "ProposalRevision",
      entityId: revision.id,
      summary: sendToPartner ? "BD quality review completed; sent to Partner" : "BD returned proposal to team lead",
      before: { workflowStage: revision.workflowStage },
      after: { workflowStage: row.workflowStage },
      metadata: { comment: body.data.comment ?? null },
    });
    if (sendToPartner && revision.proposal.opportunity.signingPartnerId) {
      await queueNotification(tx, {
        userId: revision.proposal.opportunity.signingPartnerId,
        type: "PROPOSAL_PARTNER_SIGNOFF",
        title: "Proposal awaiting your sign-off",
        body: `The BD quality review is complete for ${revision.proposal.opportunity.title}. Review and sign off the proposal.`,
        entityType: "Opportunity",
        entityId: revision.proposal.opportunity.id,
      });
    }
    if (!sendToPartner && revision.proposal.technicalOwnerId) {
      await queueNotification(tx, {
        userId: revision.proposal.technicalOwnerId,
        type: "PROPOSAL_RETURNED_TO_TECHNICAL",
        title: "Proposal returned for technical changes",
        body: body.data.comment?.trim() || "Review the proposal and make the requested changes.",
        entityType: "Opportunity",
        entityId: revision.proposal.opportunity.id,
      });
    }
    return row;
  });
  res.json({ success: true, data: updated });
});

// ── Partner sign-off ────────────────────────────────────────────────────────

proposalsRouter.post("/proposal-revisions/:id/partner-signoff", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({
    decision: z.enum(["APPROVE", "RETURN_TO_BD", "RETURN_TO_TECHNICAL"]),
    comment: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  }
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  if (req.user!.role !== "PARTNER") {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only a Partner can sign off a proposal." } });
  }
  if (revision.proposal.opportunity.signingPartnerId && revision.proposal.opportunity.signingPartnerId !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the assigned signing Partner can sign off this proposal." } });
  }
  if (revision.workflowStage !== "PARTNER_SIGNOFF") {
    return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "This revision is not waiting for Partner sign-off." } });
  }
  if (body.data.decision !== "APPROVE" && !body.data.comment?.trim()) {
    return res.status(400).json({ success: false, error: { code: "COMMENT_REQUIRED", message: "Explain the reason for returning the proposal." } });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.data.decision === "APPROVE") {
      const missing = incompleteRequiredChecklist(revision.checklistItems.filter((item) => responsibilityOf(item) !== "PARTNER"));
      if (missing.length) {
        return { blocked: true as const, missing };
      }
      const now = new Date();
      await tx.proposalChecklistItem.updateMany({
        where: { revisionId: revision.id, responsibleRole: "PARTNER", required: true },
        data: { status: "COMPLETE", completedAt: now, completedById: req.user!.id, comment: body.data.comment?.trim() || "Partner sign-off." },
      });
      const row = await tx.proposalRevision.update({
        where: { id: revision.id },
        data: {
          workflowStage: "APPROVED_FOR_SUBMISSION",
          status: "APPROVED",
          partnerSignedAt: now,
          partnerSignedById: req.user!.id,
          approvedAt: now,
          returnedAt: null,
          returnReason: null,
        },
      });
      await tx.proposalApproval.create({
        data: {
          revisionId: revision.id,
          kind: "APPROVAL",
          status: "APPROVED",
          actorId: req.user!.id,
          actorRole: "PARTNER",
          decidedAt: now,
          comment: body.data.comment?.trim() || "Partner approved the proposal for submission.",
          amountAtDecision: revision.feeAmount,
          currency: revision.feeCurrency,
          selfApproval: false,
        },
      });
      await recordAudit(tx, {
        actorId: req.user!.id,
        action: "APPROVE",
        entityType: "ProposalRevision",
        entityId: revision.id,
        summary: "Partner signed off proposal for submission",
        before: { workflowStage: revision.workflowStage },
        after: { workflowStage: "APPROVED_FOR_SUBMISSION" },
      });
      if (revision.proposal.bdOwnerId) {
        await queueNotification(tx, {
          userId: revision.proposal.bdOwnerId,
          type: "PROPOSAL_APPROVED",
          title: "Proposal approved for submission",
          body: `The signing Partner approved ${revision.proposal.opportunity.title}. Record the submission.`,
          entityType: "Opportunity",
          entityId: revision.proposal.opportunity.id,
        });
      }
      return { blocked: false as const, revision: row };
    }

    const returnToBd = body.data.decision === "RETURN_TO_BD";
    const row = await tx.proposalRevision.update({
      where: { id: revision.id },
      data: {
        workflowStage: returnToBd ? "BD_QUALITY_REVIEW" : "RETURNED_TO_TECHNICAL",
        status: "CHANGES_REQUESTED",
        returnedAt: new Date(),
        returnReason: body.data.comment!.trim(),
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "REJECT",
      entityType: "ProposalRevision",
      entityId: revision.id,
      summary: returnToBd ? "Partner returned proposal to BD" : "Partner returned proposal to team lead",
      before: { workflowStage: revision.workflowStage },
      after: { workflowStage: row.workflowStage },
      metadata: { comment: body.data.comment },
    });
    const target = returnToBd ? revision.proposal.bdOwnerId : revision.proposal.technicalOwnerId;
    if (target) {
      await queueNotification(tx, {
        userId: target,
        type: returnToBd ? "PROPOSAL_RETURNED_TO_BD" : "PROPOSAL_RETURNED_TO_TECHNICAL",
        title: returnToBd ? "Partner returned proposal for quality review" : "Partner returned proposal for technical changes",
        body: body.data.comment!.trim(),
        entityType: "Opportunity",
        entityId: revision.proposal.opportunity.id,
      });
    }
    return { blocked: false as const, revision: row };
  });

  if (updated.blocked) {
    return res.status(409).json({
      success: false,
      error: { code: "CHECKLIST_INCOMPLETE", message: `${updated.missing.length} required quality checklist item${updated.missing.length === 1 ? "" : "s"} outstanding.`, missingChecklist: updated.missing },
    });
  }
  res.json({ success: true, data: updated.revision });
});

/**
 * Edit revision content. If the revision was approved and a material field
 * changes, all approvals are invalidated and the revision returns to
 * CHANGES_REQUESTED. The change list is documented in core.
 */
proposalsRouter.patch("/proposal-revisions/:id", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = revisionSchema.partial().safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const existing = await scopedRevision(req.user, params.data.id);
  if (!existing) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  if (existing.status === "SUBMITTED") return res.status(409).json({ success: false, error: { code: "REVISION_LOCKED", message: "A submitted revision is immutable. Create a new revision." } });

  const next = {
    ...snapshotOf(existing),
    ...(body.data.feeAmount !== undefined ? { approvedQuotedFee: body.data.feeAmount } : {}),
    ...(body.data.feeCurrency !== undefined ? { currency: body.data.feeCurrency } : {}),
    ...(body.data.scopeSummary !== undefined ? { scope: body.data.scopeSummary } : {}),
    ...(body.data.keyTerms !== undefined ? { description: body.data.keyTerms } : {}),
    ...(body.data.summary !== undefined ? { submissionSummary: body.data.summary } : {}),
  };
  const changed = materialChanges(snapshotOf(existing), next, DEFAULT_MATERIAL_CHANGE_FIELDS as never);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.proposalRevision.update({
      where: { id: existing.id },
      data: {
        ...(body.data.summary !== undefined ? { summary: body.data.summary } : {}),
        ...(body.data.feeAmount !== undefined ? { feeAmount: body.data.feeAmount } : {}),
        ...(body.data.feeCurrency !== undefined ? { feeCurrency: body.data.feeCurrency } : {}),
        ...(body.data.scopeSummary !== undefined ? { scopeSummary: body.data.scopeSummary } : {}),
        ...(body.data.keyTerms !== undefined ? { keyTerms: body.data.keyTerms } : {}),
        materialSnapshot: next as Prisma.InputJsonValue,
      },
    });

    if (existing.status === "APPROVED" && changed.length) {
      await tx.proposalApproval.updateMany({
        where: { revisionId: existing.id, status: { not: "INVALIDATED" } },
        data: {
          status: "INVALIDATED",
          invalidatedAt: new Date(),
          invalidatedById: req.user!.id,
          invalidationReason: `Material change: ${changed.join(", ")}`,
        },
      });
      await tx.proposalRevision.update({
        where: { id: existing.id },
        data: {
          status: "CHANGES_REQUESTED",
          workflowStage: "RETURNED_TO_TECHNICAL",
          returnedAt: new Date(),
          returnReason: `Material change after approval: ${changed.join(", ")}`,
          approvalInvalidatedAt: new Date(),
          approvalInvalidationReason: `Material change: ${changed.join(", ")}`,
          materialVersion: { increment: 1 },
        },
      });
      await recordAudit(tx, {
        actorId: req.user!.id,
        action: "INVALIDATE",
        entityType: "ProposalRevision",
        entityId: existing.id,
        summary: `Approval invalidated after material change: ${changed.join(", ")}`,
        before: { status: existing.status },
        after: { status: "CHANGES_REQUESTED", changedFields: changed },
      });
    }

    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "ProposalRevision", entityId: updated.id, summary: "Proposal revision edited", before: existing, after: updated, metadata: { materialChanges: changed } });
    return { ...updated, materialChanges: changed };
  });
  res.json({ success: true, data: row });
});

proposalsRouter.patch("/proposal-revisions/:id/checklist/:itemId", async (req: AuthedRequest, res) => {
  const params = z.object({ id: uuid, itemId: uuid }).safeParse(req.params);
  const body = z.object({
    status: z.enum(CHECKLIST_ITEM_STATUSES),
    comment: z.string().trim().optional(),
    responsibleUserId: uuid.optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  const item = revision.checklistItems.find((i) => i.id === params.data.itemId);
  if (!item) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Checklist item not found." } });
  if (revision.status === "SUBMITTED") {
    return res.status(409).json({ success: false, error: { code: "REVISION_LOCKED", message: "A submitted revision's checklist cannot be changed." } });
  }
  const responsibility = responsibilityOf(item);
  if (responsibility === "TEAM_LEAD") {
    if (revision.proposal.technicalOwnerId !== req.user!.id) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the assigned Team Lead can complete the technical checklist." } });
    }
    if (!["TECHNICAL_PREPARATION", "RETURNED_TO_TECHNICAL"].includes(revision.workflowStage)) {
      return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "The Team Lead checklist is not open at this stage." } });
    }
  } else if (responsibility === "BD") {
    if (revision.proposal.bdOwnerId !== req.user!.id && !isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the assigned BD owner can complete the BD checklist." } });
    }
    if (revision.workflowStage !== "BD_QUALITY_REVIEW") {
      return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "The BD checklist is not open at this stage." } });
    }
  } else {
    if (req.user!.role !== "PARTNER") {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the signing Partner can complete the Partner checklist." } });
    }
    if (revision.workflowStage !== "PARTNER_SIGNOFF") {
      return res.status(409).json({ success: false, error: { code: "WRONG_WORKFLOW_STAGE", message: "The Partner checklist is not open at this stage." } });
    }
  }
  if (body.data.status === "REVIEWED" && !canReviewProposalRole(req.user!.role)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot review a checklist item." } });
  }

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.proposalChecklistItem.update({
      where: { id: item.id },
      data: {
        status: body.data.status,
        comment: body.data.comment ?? item.comment,
        responsibleUserId: body.data.responsibleUserId ?? item.responsibleUserId,
        ...(body.data.status === "COMPLETE" || body.data.status === "REVIEWED" || body.data.status === "NOT_APPLICABLE"
          ? { completedAt: item.completedAt ?? now, completedById: item.completedById ?? req.user!.id }
          : {}),
        ...(body.data.status === "REVIEWED" ? { reviewedAt: now, reviewedById: req.user!.id } : {}),
      },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "ProposalChecklistItem", entityId: updated.id, summary: `Checklist item ${updated.code} set to ${updated.status}`, before: item, after: updated });
    return updated;
  });
  res.json({ success: true, data: row });
});

proposalsRouter.post("/proposal-revisions/:id/credentials", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = z.object({ credentialId: uuid, credentialVersion: z.string().trim().optional(), note: z.string().trim().optional() }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  const credential = await prisma.credential.findUnique({ where: { id: body.data.credentialId } });
  if (!credential) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Credential not found." } });
  const row = await prisma.$transaction(async (tx) => {
    const link = await tx.proposalCredentialReference.create({ data: { revisionId: revision.id, credentialId: credential.id, credentialVersion: body.data.credentialVersion ?? credential.version, note: body.data.note ?? null } });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "ProposalRevision", entityId: revision.id, summary: `Credential linked: ${credential.name}`, after: link });
    return link;
  });
  res.status(201).json({ success: true, data: row });
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  comment: z.string().trim().optional(),
});

proposalsRouter.post("/proposal-revisions/:id/reviews", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = decisionSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  if (!canReviewProposalRole(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot review proposals." } });
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });

  const row = await prisma.$transaction(async (tx) => {
    const approval = await tx.proposalApproval.create({
      data: {
        revisionId: revision.id,
        kind: "REVIEW",
        status: body.data.decision,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        decidedAt: new Date(),
        comment: body.data.comment ?? null,
        amountAtDecision: revision.feeAmount,
        currency: revision.feeCurrency,
      },
    });
    const status = body.data.decision === "APPROVED" ? "IN_REVIEW" : "CHANGES_REQUESTED";
    const updated = await tx.proposalRevision.update({ where: { id: revision.id }, data: { status } });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: body.data.decision === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: "ProposalRevision",
      entityId: revision.id,
      summary: `Proposal review recorded: ${body.data.decision}`,
      before: { status: revision.status },
      after: { status: updated.status, reviewId: approval.id },
    });
    return { revision: updated, approval };
  });
  res.json({ success: true, data: row });
});

proposalsRouter.post("/proposal-revisions/:id/approvals", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = decisionSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  if (!isCommercialApprover(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot approve proposals." } });
  }
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });

  const amount = decimalToNumber(revision.feeAmount ?? revision.proposal.opportunity.approvedQuotedFee ?? revision.proposal.opportunity.submittedFee);
  const policyRows = await prisma.approvalPolicy.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ entityId: null }, { entityId: revision.proposal.opportunity.contractingEntityId }] },
      ],
    },
    orderBy: { requiredApprovals: "desc" },
  });
  const policy = policyRows.find((p) =>
    (p.currency === (revision.feeCurrency ?? revision.proposal.opportunity.currency)) &&
    isWithinApprovalLimit(amount, { minAmount: p.minAmount != null ? Number(p.minAmount) : null, maxAmount: p.maxAmount != null ? Number(p.maxAmount) : null })
  );
  const prohibitsSelfApproval = policy?.prohibitsSelfApproval
    ?? await prisma.$transaction((tx) => getSetting<boolean>(tx, CONFIG_KEYS.approvalSelfApprovalProhibited, true));
  const selfApproval =
    isSelfApproval(req.user!.id, revision.proposal.opportunity.ownerId, revision.proposal.createdById) ||
    revision.createdById === req.user!.id;
  if (prohibitsSelfApproval && selfApproval) {
    return res.status(403).json({ success: false, error: { code: "SELF_APPROVAL_PROHIBITED", message: "Configured policy prohibits approving your own proposal." } });
  }
  if (policy?.requiredRole && req.user!.role !== policy.requiredRole && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: { code: "APPROVAL_ROLE_REQUIRED", message: `This approval requires the ${policy.requiredRole} role.` } });
  }

  const row = await prisma.$transaction(async (tx) => {
    const approval = await tx.proposalApproval.create({
      data: {
        revisionId: revision.id,
        kind: "APPROVAL",
        status: body.data.decision,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        decidedAt: new Date(),
        comment: body.data.comment ?? null,
        amountAtDecision: amount,
        currency: revision.feeCurrency ?? revision.proposal.opportunity.currency,
        selfApproval,
      },
    });
    const validApprovals = await tx.proposalApproval.count({ where: { revisionId: revision.id, kind: "APPROVAL", status: "APPROVED", invalidatedAt: null } });
    const required = policy?.requiredApprovals ?? await getSetting<number | null>(tx, CONFIG_KEYS.approvalRequiredCount, null) ?? 1;
    const status = body.data.decision === "APPROVED" && validApprovals >= required
      ? "APPROVED"
      : body.data.decision === "APPROVED"
        ? "IN_REVIEW"
        : "CHANGES_REQUESTED";
    const updated = await tx.proposalRevision.update({
      where: { id: revision.id },
      data: { status, ...(status === "APPROVED" ? { approvedAt: new Date() } : {}) },
    });
    await recordAudit(tx, { actorId: req.user!.id, action: body.data.decision === "APPROVED" ? "APPROVE" : "REJECT", entityType: "ProposalRevision", entityId: revision.id, summary: `Proposal approval recorded: ${body.data.decision}`, before: { status: revision.status }, after: { status: updated.status, approvalId: approval.id } });
    return { revision: updated, approval, validApprovals, requiredApprovals: required };
  });
  res.json({ success: true, data: row });
});

const submitSchema = z.object({
  channel: z.string().trim().min(1),
  externalReference: z.string().trim().optional(),
  proofReference: z.string().trim().optional(),
  submissionType: z.enum(["RFP", "RFQ", "PREQUALIFICATION"]).optional(),
  notes: z.string().trim().optional(),
});

proposalsRouter.post("/proposal-revisions/:id/submit", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = submitSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const revision = await scopedRevision(req.user, params.data.id);
  if (!revision) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Proposal revision not found or not in your scope." } });
  if (revision.submissions.length) return res.status(409).json({ success: false, error: { code: "ALREADY_SUBMITTED", message: "This revision has already been submitted." } });
  if (revision.status !== "APPROVED" || revision.workflowStage !== "APPROVED_FOR_SUBMISSION") {
    return res.status(409).json({ success: false, error: { code: "NOT_APPROVED", message: "The signing Partner must approve this revision before it can be dispatched." } });
  }

  const requiresChecklist = await prisma.$transaction((tx) => getSetting<boolean>(tx, CONFIG_KEYS.dispatchRequiresChecklist, true));
  const gate = evaluateDispatchGate({
    items: revision.checklistItems,
    approvals: revision.approvals.map((approval) => ({
      ...approval,
      invalidatedAt: approval.invalidatedAt?.toISOString() ?? null,
    })),
    requiresChecklist,
  });
  if (!gate.allowed) {
    return res.status(409).json({
      success: false,
      error: {
        code: "DISPATCH_BLOCKED",
        message: gate.reason ?? "Required checks and approvals are incomplete.",
        missingChecklist: gate.missingChecklist,
        missingReviews: gate.missingReviews,
      },
    });
  }

  const row = await prisma.$transaction(async (tx) => {
    const priorSubmissions = await tx.proposalSubmission.count({ where: { revision: { proposalId: revision.proposalId } } });
    const isFirst = priorSubmissions === 0;
    const submission = await tx.proposalSubmission.create({
      data: {
        revisionId: revision.id,
        channel: body.data.channel,
        externalReference: body.data.externalReference?.trim() || null,
        proofReference: body.data.proofReference?.trim() || null,
        isFirstSubmission: isFirst,
        notes: body.data.notes?.trim() || null,
        submittedById: req.user!.id,
      },
    });
    const updatedRevision = await tx.proposalRevision.update({ where: { id: revision.id }, data: { status: "SUBMITTED", workflowStage: "SUBMITTED" } });
    const opp = revision.proposal.opportunity;
    const liveStages = ["PROSPECT", "LEAD", "PROPOSAL", "AWAITING_FEEDBACK", "NOT_SUBMITTED", "DEFERRED"];
    const keepClosed = opp.outcome === "WON" || ["LOST", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD", "NO_BID"].includes(opp.outcome);
    const updatedOpp = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        proposalSubmittedAt: opp.proposalSubmittedAt ?? new Date(),
        submittedFee: opp.submittedFee ?? revision.feeAmount,
        proposalBreachedAt: null,
        ...(body.data.submissionType ? { submissionType: body.data.submissionType } : {}),
        ...(!keepClosed && liveStages.includes(opp.stage)
          ? { stage: "AWAITING_FEEDBACK" as const, stageEnteredAt: new Date() }
          : {}),
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "SUBMIT",
      entityType: "ProposalRevision",
      entityId: revision.id,
      summary: `Proposal revision ${revision.revisionNumber} submitted via ${body.data.channel}`,
      before: { status: revision.status, proposalSubmittedAt: opp.proposalSubmittedAt },
      after: { status: "SUBMITTED", submissionId: submission.id, firstSubmission: isFirst },
    });
    if (opp.ownerId) {
      await queueNotification(tx, {
        userId: opp.ownerId,
        type: "PROPOSAL_SUBMITTED",
        title: "Proposal submitted",
        body: `${revision.proposal.title} revision ${revision.revisionNumber} was submitted.`,
        entityType: "Opportunity",
        entityId: opp.id,
      });
    }
    return { submission, revision: updatedRevision, opportunity: updatedOpp };
  });
  res.status(201).json({ success: true, data: row });
});
