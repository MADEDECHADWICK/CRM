import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, scopedOpportunity } from "../../middleware/authorize";
import { recordAudit, getSetting, queueNotification } from "../../lib/audit";
import {
  BUSINESS_TYPES,
  CONFIG_KEYS,
  LOSS_REASON_CODES,
  OPPORTUNITY_OUTCOMES,
  QUALIFICATION_STATUSES,
  canApproveAwardRole,
  canArchiveRole,
  canCreateOpportunityByRole,
  canRecordOutcomeRole,
  isGroupCommercialOversight,
  lossNeedsFeedbackAction,
  reconcileAllocations,
  validateOutcome,
} from "@crm/core";

export const enterpriseOpportunityRouter = Router();
enterpriseOpportunityRouter.use(requireAuth);

const idParam = z.object({ id: z.string().uuid() });
const nullableDate = z.string().datetime().nullable().optional();

// ── Qualification ───────────────────────────────────────────────────────────

const qualificationSchema = z.object({
  qualificationStatus: z.enum(QUALIFICATION_STATUSES).optional(),
  qualificationRequirement: z.string().trim().optional(),
  qualificationNotes: z.string().trim().optional(),
  qualificationDate: nullableDate,
  leadReceivedAt: z.string().datetime().optional(),
  sourceReferrerName: z.string().trim().nullable().optional(),
  sourceReferrerOrganization: z.string().trim().nullable().optional(),
  sourceCampaign: z.string().trim().nullable().optional(),
  sourceEvent: z.string().trim().nullable().optional(),
  clientDeadlineAt: nullableDate,
  budgetKnown: z.number().nonnegative().nullable().optional(),
  budgetCurrency: z.string().trim().nullable().optional(),
  eligibilityNotes: z.string().trim().nullable().optional(),
  decisionMakerContactId: z.string().uuid().nullable().optional(),
  goNoGoDecision: z.enum(["PENDING", "GO", "NO_GO"]).optional(),
  noGoReason: z.string().trim().optional(),
  noGoReasonCode: z.string().trim().optional(),
  conflictCheckStatus: z.string().trim().optional(),
  conflictCheckNotes: z.string().trim().nullable().optional(),
});

enterpriseOpportunityRouter.patch("/:id/qualification", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = qualificationSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  if (!canCreateOpportunityByRole(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot qualify opportunities." } });

  const opp = await scopedOpportunity(req.user, params.data.id, {
    id: true, title: true, qualificationStatus: true, ownerId: true, createdById: true,
    conflictCheckStatus: true, contractingEntityId: true,
  });
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });

  const nextStatus = body.data.qualificationStatus ?? opp.qualificationStatus;
  if (nextStatus === "NO_GO" || nextStatus === "DISQUALIFIED") {
    if (!body.data.noGoReason?.trim()) return res.status(400).json({ success: false, error: { code: "NO_GO_REASON_REQUIRED", message: "Record why this opportunity was not pursued." } });
  }

  const conflictRequired = await prisma.$transaction((tx) => getSetting<boolean>(tx, CONFIG_KEYS.conflictCheckRequired, false));
  if (conflictRequired && !body.data.conflictCheckStatus && !opp.conflictCheckStatus) {
    return res.status(400).json({ success: false, error: { code: "CONFLICT_CHECK_REQUIRED", message: "A conflict and independence check is required by the configured policy." } });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        ...(body.data.qualificationStatus !== undefined ? { qualificationStatus: body.data.qualificationStatus } : {}),
        ...(body.data.qualificationRequirement !== undefined ? { qualificationRequirement: body.data.qualificationRequirement } : {}),
        ...(body.data.qualificationNotes !== undefined ? { qualificationNotes: body.data.qualificationNotes } : {}),
        ...(body.data.qualificationDate !== undefined ? { qualificationDate: body.data.qualificationDate ? new Date(body.data.qualificationDate) : null } : {}),
        ...(body.data.leadReceivedAt !== undefined ? { leadReceivedAt: new Date(body.data.leadReceivedAt) } : {}),
        ...(body.data.sourceReferrerName !== undefined ? { sourceReferrerName: body.data.sourceReferrerName } : {}),
        ...(body.data.sourceReferrerOrganization !== undefined ? { sourceReferrerOrganization: body.data.sourceReferrerOrganization } : {}),
        ...(body.data.sourceCampaign !== undefined ? { sourceCampaign: body.data.sourceCampaign } : {}),
        ...(body.data.sourceEvent !== undefined ? { sourceEvent: body.data.sourceEvent } : {}),
        ...(body.data.clientDeadlineAt !== undefined ? { clientDeadlineAt: body.data.clientDeadlineAt ? new Date(body.data.clientDeadlineAt) : null } : {}),
        ...(body.data.budgetKnown !== undefined ? { budgetKnown: body.data.budgetKnown } : {}),
        ...(body.data.budgetCurrency !== undefined ? { budgetCurrency: body.data.budgetCurrency } : {}),
        ...(body.data.eligibilityNotes !== undefined ? { eligibilityNotes: body.data.eligibilityNotes } : {}),
        ...(body.data.decisionMakerContactId !== undefined ? { decisionMakerContactId: body.data.decisionMakerContactId } : {}),
        ...(body.data.conflictCheckStatus !== undefined ? { conflictCheckStatus: body.data.conflictCheckStatus } : {}),
        ...(body.data.conflictCheckNotes !== undefined ? { conflictCheckNotes: body.data.conflictCheckNotes } : {}),
        ...(body.data.conflictCheckStatus ? { conflictCheckedAt: now, conflictCheckedById: req.user!.id } : {}),
        ...(body.data.goNoGoDecision ? {
          goNoGoAt: now,
          goNoGoById: req.user!.id,
        } : {}),
        ...(body.data.noGoReason !== undefined ? { noGoReason: body.data.noGoReason } : {}),
        ...(body.data.noGoReasonCode !== undefined ? { noGoReasonCode: body.data.noGoReasonCode } : {}),
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "QUALIFY",
      entityType: "Opportunity",
      entityId: opp.id,
      summary: `Qualification updated: ${nextStatus}${body.data.goNoGoDecision ? ` (${body.data.goNoGoDecision})` : ""}`,
      before: opp,
      after: row,
    });
    return row;
  });

  res.json({ success: true, data: updated });
});

// ── Commercial values ───────────────────────────────────────────────────────

const valuesSchema = z.object({
  estimatedValue: z.number().nonnegative().nullable().optional(),
  approvedQuotedFee: z.number().nonnegative().nullable().optional(),
  submittedFee: z.number().nonnegative().nullable().optional(),
  bidPurchaseCost: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).optional(),
  awardCurrency: z.string().trim().nullable().optional(),
  bidCostCurrency: z.string().trim().nullable().optional(),
  taxBasis: z.enum(["UNKNOWN", "EXCLUSIVE", "INCLUSIVE", "EXEMPT"]).optional(),
  billingFrequency: z.enum(["UNKNOWN", "ONE_OFF", "MONTHLY", "QUARTERLY", "ANNUAL", "OTHER"]).optional(),
  termMonths: z.number().int().positive().nullable().optional(),
  wonValueVarianceReason: z.string().trim().nullable().optional(),
  nextAction: z.string().trim().nullable().optional(),
  nextActionDueAt: nullableDate,
  nextActionOwnerId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  contractingEntityId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
  serviceCategoryId: z.string().uuid().nullable().optional(),
});

enterpriseOpportunityRouter.patch("/:id/values", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = valuesSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const opp = await scopedOpportunity(req.user, params.data.id);
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && opp.ownerId !== req.user!.id && opp.createdById !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the owner, creator or group oversight may edit commercial values." } });
  }
  if ((body.data.approvedQuotedFee !== undefined || body.data.submittedFee !== undefined) && !canApproveAwardRole(req.user!.role) && !isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Signed-off fee values require an approver role." } });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        ...(body.data.estimatedValue !== undefined ? { estimatedValue: body.data.estimatedValue } : {}),
        ...(body.data.approvedQuotedFee !== undefined ? { approvedQuotedFee: body.data.approvedQuotedFee } : {}),
        ...(body.data.submittedFee !== undefined ? { submittedFee: body.data.submittedFee } : {}),
        ...(body.data.bidPurchaseCost !== undefined ? { bidPurchaseCost: body.data.bidPurchaseCost } : {}),
        ...(body.data.currency !== undefined ? { currency: body.data.currency } : {}),
        ...(body.data.awardCurrency !== undefined ? { awardCurrency: body.data.awardCurrency } : {}),
        ...(body.data.bidCostCurrency !== undefined ? { bidCostCurrency: body.data.bidCostCurrency } : {}),
        ...(body.data.taxBasis !== undefined ? { taxBasis: body.data.taxBasis } : {}),
        ...(body.data.billingFrequency !== undefined ? { billingFrequency: body.data.billingFrequency } : {}),
        ...(body.data.termMonths !== undefined ? { termMonths: body.data.termMonths } : {}),
        ...(body.data.wonValueVarianceReason !== undefined ? { wonValueVarianceReason: body.data.wonValueVarianceReason } : {}),
        ...(body.data.nextAction !== undefined ? { nextAction: body.data.nextAction } : {}),
        ...(body.data.nextActionDueAt !== undefined ? { nextActionDueAt: body.data.nextActionDueAt ? new Date(body.data.nextActionDueAt) : null } : {}),
        ...(body.data.nextActionOwnerId !== undefined ? { nextActionOwnerId: body.data.nextActionOwnerId } : {}),
        ...(body.data.reviewerId !== undefined ? { reviewerId: body.data.reviewerId } : {}),
        ...(body.data.contractingEntityId !== undefined ? { contractingEntityId: body.data.contractingEntityId } : {}),
        ...(body.data.officeId !== undefined ? { officeId: body.data.officeId } : {}),
        ...(body.data.serviceCategoryId !== undefined ? { serviceCategoryId: body.data.serviceCategoryId } : {}),
      },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: opp.id,
      summary: "Commercial values and accountability updated",
      before: opp,
      after: row,
      metadata: { note: "Legacy amount was not overwritten by an award change." },
    });
    return row;
  });
  res.json({ success: true, data: updated });
});

// ── Outcome ─────────────────────────────────────────────────────────────────

const outcomeSchema = z.object({
  outcome: z.enum(OPPORTUNITY_OUTCOMES),
  outcomeAt: z.string().datetime().optional(),
  reason: z.string().trim().min(1),
  onHoldReason: z.string().trim().optional(),
  revisitAt: z.string().datetime().optional(),
  lossReasonCode: z.enum(LOSS_REASON_CODES).optional(),
  lossReasonDetail: z.string().trim().optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  signingPartnerId: z.string().uuid().optional(),
  confirmedAwardValue: z.number().nonnegative().optional(),
  awardCurrency: z.string().trim().min(1).optional(),
  awardDate: z.string().datetime().optional(),
  awardEvidenceReference: z.string().trim().optional(),
  awardVerificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "DISPUTED"]).optional(),
  engagementLetterStatus: z.enum(["NOT_STARTED", "SENT", "SIGNED", "RECEIVED", "NOT_REQUIRED"]).optional(),
  engagementLetterReference: z.string().trim().optional(),
});

enterpriseOpportunityRouter.post("/:id/outcome", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = outcomeSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  if (!canRecordOutcomeRole(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot record an outcome." } });

  const opp = await scopedOpportunity(req.user, params.data.id);
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });

  const closed = ["WON", "LOST", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD", "NO_BID", "NO_RESPONSE"];
  if (closed.includes(opp.outcome) && body.data.outcome === "OPEN" && !isGroupCommercialOversight(req.user!.role, req.user!.isAdmin)) {
    return res.status(409).json({ success: false, error: { code: "OUTCOME_CLOSED", message: "A closed outcome cannot be reopened without group commercial oversight." } });
  }

  const validation = validateOutcome({
    outcome: body.data.outcome,
    outcomeAt: body.data.outcomeAt,
    lossReasonCode: body.data.lossReasonCode,
    lossReasonDetail: body.data.lossReasonDetail,
    confirmedAwardValue: body.data.confirmedAwardValue,
  });
  if (!validation.valid) return res.status(400).json({ success: false, error: { code: "OUTCOME_INVALID", message: validation.errors.join(" ") } });

  if (body.data.outcome === "WON") {
    if (!body.data.businessType) return res.status(400).json({ success: false, error: { code: "BUSINESS_TYPE_REQUIRED", message: "Choose the commercial category for this win." } });
    if (!body.data.signingPartnerId) return res.status(400).json({ success: false, error: { code: "SIGNING_PARTNER_REQUIRED", message: "Name the signing partner for this win." } });
    if (!canApproveAwardRole(req.user!.role)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot approve a win." } });
    const partner = await prisma.user.findUnique({ where: { id: body.data.signingPartnerId }, select: { role: true, isActive: true } });
    if (!partner || partner.role !== "PARTNER" || !partner.isActive) return res.status(400).json({ success: false, error: { code: "INVALID_SIGNING_PARTNER", message: "The signing partner must be an active Partner." } });
  }

  const outcomeAt = body.data.outcomeAt ? new Date(body.data.outcomeAt) : new Date();
  const stageFor: Record<string, string> = {
    WON: "WON",
    LOST: "LOST",
    WITHDRAWN: "WITHDRAWN",
    CLIENT_CANCELLED: "CLIENT_CANCELLED",
    NO_AWARD: "NO_AWARD",
    NO_BID: "NO_BID",
    NO_RESPONSE: "NO_REPLY",
    ON_HOLD: "DEFERRED",
  };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        outcome: body.data.outcome,
        outcomeAt: body.data.outcome === "OPEN" ? null : outcomeAt,
        onHoldReason: body.data.outcome === "ON_HOLD" ? body.data.onHoldReason ?? null : null,
        ...(body.data.outcome === "ON_HOLD" && body.data.revisitAt ? { revisitAt: new Date(body.data.revisitAt) } : {}),
        ...(body.data.outcome === "WON" ? {
          stage: "WON" as const,
          stageEnteredAt: outcomeAt,
          wonAt: outcomeAt,
          // The submitted quote (amount/submittedFee/approvedQuotedFee) is
          // deliberately untouched. An award changing value never rewrites it.
          confirmedAwardValue: body.data.confirmedAwardValue,
          awardCurrency: body.data.awardCurrency ?? opp.currency,
          awardDate: body.data.awardDate ? new Date(body.data.awardDate) : outcomeAt,
          awardEvidenceReference: body.data.awardEvidenceReference ?? null,
          awardVerificationStatus: body.data.awardVerificationStatus ?? "UNVERIFIED",
          engagementLetterStatus: body.data.engagementLetterStatus ?? "NOT_STARTED",
          engagementLetterReference: body.data.engagementLetterReference ?? null,
          businessType: body.data.businessType,
          signingPartnerId: body.data.signingPartnerId,
          awardApprovedById: req.user!.id,
        } : {}),
        ...(body.data.outcome === "LOST" ? {
          stage: "LOST" as const,
          stageEnteredAt: outcomeAt,
          lostAt: outcomeAt,
          lossReasonCode: body.data.lossReasonCode,
          lossReasonDetail: body.data.lossReasonDetail ?? null,
          lostReason: body.data.lossReasonDetail ?? body.data.lossReasonCode ?? null,
        } : {}),
        ...(stageFor[body.data.outcome] && body.data.outcome !== "WON" && body.data.outcome !== "LOST"
          ? { stage: stageFor[body.data.outcome] as never, stageEnteredAt: outcomeAt }
          : {}),
      },
    });

    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "OUTCOME",
      entityType: "Opportunity",
      entityId: opp.id,
      summary: `Outcome recorded: ${body.data.outcome}`,
      before: { outcome: opp.outcome, stage: opp.stage, amount: opp.amount },
      after: { outcome: updated.outcome, stage: updated.stage, confirmedAwardValue: updated.confirmedAwardValue },
      metadata: { reason: body.data.reason, lossReasonCode: body.data.lossReasonCode ?? null },
    });

    let handoverId: string | null = null;
    if (body.data.outcome === "WON") {
      // Structured handover task. A won opportunity is booked business, not an
      // invoice or cash receipt; the CRM creates a task, not a financial entry.
      const handover = await tx.followup.create({
        data: {
          type: "HANDOVER",
          note: `Finance and service-team handover for won engagement: ${opp.title}`,
          dueAt: new Date(),
          opportunityId: opp.id,
          assignedToId: opp.ownerId ?? req.user!.id,
          createdById: req.user!.id,
        },
      });
      handoverId = handover.id;
      await queueNotification(tx, {
        userId: opp.ownerId ?? req.user!.id,
        type: "WIN_HANDOVER",
        title: "Won opportunity — handover required",
        body: `Complete the Finance/service handover for ${opp.title}. This is booked business, not an invoice.`,
        entityType: "Opportunity",
        entityId: opp.id,
      });
    }

    if (body.data.outcome === "LOST" && lossNeedsFeedbackAction(body.data.lossReasonCode)) {
      const days = await getSetting<number | null>(tx, CONFIG_KEYS.followupDefaultIntervalDays, null);
      await tx.followup.create({
        data: {
          type: "TASK",
          note: `Obtain feedback on why ${opp.title} was lost (reason not supplied)`,
          dueAt: new Date(Date.now() + (days ?? 3) * 86400000),
          opportunityId: opp.id,
          assignedToId: opp.ownerId ?? req.user!.id,
          createdById: req.user!.id,
        },
      });
      await tx.opportunity.update({ where: { id: opp.id }, data: { feedbackRequestedAt: new Date() } });
    }

    return { opportunity: updated, handoverTaskId: handoverId };
  });

  res.json({ success: true, data: result });
});

// ── Multi-country allocations ───────────────────────────────────────────────

const allocationSchema = z.object({
  allocations: z.array(z.object({
    country: z.string().trim().min(1),
    amount: z.number().nonnegative().nullable().optional(),
    percentage: z.number().nonnegative().max(100).nullable().optional(),
    basis: z.enum(["PERCENT", "AMOUNT"]).default("PERCENT"),
    currency: z.string().trim().optional(),
    contractingEntityId: z.string().uuid().optional(),
    isFinalized: z.boolean().optional(),
  })),
  finalize: z.boolean().default(false),
});

enterpriseOpportunityRouter.post("/:id/allocations", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = allocationSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const opp = await scopedOpportunity(req.user, params.data.id);
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && opp.ownerId !== req.user!.id && opp.createdById !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the owner, creator or group oversight may set allocations." } });
  }

  const value = opp.approvedQuotedFee ?? opp.submittedFee ?? opp.estimatedValue ?? opp.amount;
  const reconciliation = reconcileAllocations(body.data.allocations, value != null ? Number(value) : null);
  if (body.data.finalize && !reconciliation.valid) {
    return res.status(400).json({ success: false, error: { code: "ALLOCATIONS_DO_NOT_RECONCILE", message: reconciliation.errors.join(" "), errors: reconciliation.errors } });
  }

  const rows = await prisma.$transaction(async (tx) => {
    await tx.opportunityAllocation.deleteMany({ where: { opportunityId: opp.id } });
    if (body.data.allocations.length) {
      await tx.opportunityAllocation.createMany({
        data: body.data.allocations.map((a) => ({
          opportunityId: opp.id,
          country: a.country,
          amount: a.amount ?? null,
          percentage: a.percentage ?? null,
          currency: a.currency ?? opp.currency,
          contractingEntityId: a.contractingEntityId ?? null,
          basis: a.basis,
          isFinalized: body.data.finalize,
        })),
      });
    }
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: opp.id,
      summary: `Delivery allocations updated (${body.data.allocations.length} countries${body.data.finalize ? ", finalized" : ""})`,
      after: { allocations: body.data.allocations, finalize: body.data.finalize },
      metadata: { reconciliation },
    });
    return tx.opportunityAllocation.findMany({ where: { opportunityId: opp.id } });
  });
  res.json({ success: true, data: { allocations: rows, reconciliation } });
});

// ── Contributors (explicit record sharing) ──────────────────────────────────

const contributorSchema = z.object({ userId: z.string().uuid(), accessLevel: z.enum(["VIEW", "EDIT"]).default("VIEW") });

enterpriseOpportunityRouter.post("/:id/contributors", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  const body = contributorSchema.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message } });
  const opp = await scopedOpportunity(req.user, params.data.id, { id: true, title: true, ownerId: true, createdById: true });
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && opp.ownerId !== req.user!.id && opp.createdById !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the owner, creator or group oversight may share this record." } });
  }
  const user = await prisma.user.findUnique({ where: { id: body.data.userId }, select: { id: true, name: true, isActive: true } });
  if (!user || !user.isActive) return res.status(400).json({ success: false, error: { code: "INVALID_USER", message: "Choose an active user." } });

  const row = await prisma.$transaction(async (tx) => {
    const contributor = await tx.opportunityContributor.upsert({
      where: { opportunityId_userId: { opportunityId: opp.id, userId: user.id } },
      update: { accessLevel: body.data.accessLevel, assignedById: req.user!.id },
      create: { opportunityId: opp.id, userId: user.id, accessLevel: body.data.accessLevel, assignedById: req.user!.id },
    });
    await recordAudit(tx, {
      actorId: req.user!.id,
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: opp.id,
      summary: `Contributor added: ${user.name}`,
      after: contributor,
      metadata: { note: "Record-level share only; does not grant country or organization-wide access." },
    });
    return contributor;
  });
  res.status(201).json({ success: true, data: row });
});

enterpriseOpportunityRouter.delete("/:id/contributors/:userId", async (req: AuthedRequest, res) => {
  const params = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  const opp = await scopedOpportunity(req.user, params.data.id, { id: true, ownerId: true, createdById: true });
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  if (!isGroupCommercialOversight(req.user!.role, req.user!.isAdmin) && opp.ownerId !== req.user!.id && opp.createdById !== req.user!.id) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only the owner, creator or group oversight may change sharing." } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.opportunityContributor.deleteMany({ where: { opportunityId: opp.id, userId: params.data.userId } });
    await recordAudit(tx, { actorId: req.user!.id, action: "UPDATE", entityType: "Opportunity", entityId: opp.id, summary: "Contributor access removed", metadata: { userId: params.data.userId } });
  });
  res.json({ success: true, data: { id: params.data.userId } });
});

// ── Archive / restore ───────────────────────────────────────────────────────

enterpriseOpportunityRouter.post("/:id/archive", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  if (!canArchiveRole(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot archive records." } });
  const opp = await scopedOpportunity(req.user, params.data.id);
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opportunity.update({ where: { id: opp.id }, data: { isArchived: true, archivedAt: new Date(), archivedById: req.user!.id } });
    await recordAudit(tx, { actorId: req.user!.id, action: "ARCHIVE", entityType: "Opportunity", entityId: opp.id, summary: `Opportunity archived: ${opp.title}`, before: opp, after: row });
    return row;
  });
  res.json({ success: true, data: updated });
});

enterpriseOpportunityRouter.post("/:id/restore", async (req: AuthedRequest, res) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: params.error.message } });
  if (!canArchiveRole(req.user!.role, req.user!.isAdmin)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Your role cannot restore records." } });
  const opp = await scopedOpportunity(req.user, params.data.id);
  if (!opp) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Opportunity not found or not in your scope." } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opportunity.update({ where: { id: opp.id }, data: { isArchived: false, archivedAt: null, archivedById: null } });
    await recordAudit(tx, { actorId: req.user!.id, action: "RESTORE", entityType: "Opportunity", entityId: opp.id, summary: `Opportunity restored: ${opp.title}`, before: opp, after: row });
    return row;
  });
  res.json({ success: true, data: updated });
});
