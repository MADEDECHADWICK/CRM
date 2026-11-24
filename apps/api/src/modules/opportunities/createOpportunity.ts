import { canCreateOpportunity, type LeadSource, type Stage } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";
import { organizationScope, type AccessUser } from "../../lib/accessScope";
import { assertOwnerCanAccessAccount, OwnershipRejected, recordInitialOwnership, resolveOwnerForCreation } from "./ownership";
import { recordAudit } from "../../lib/audit";

export type CreateOpportunityInput = {
  title: string; organizationId: string; departmentId: string; service: string;
  ownerId?: string; ownerOverrideReason?: string; stage?: Extract<Stage, "PROSPECT" | "LEAD">;
  leadSource: LeadSource; leadSourceNote?: string; leadReceivedAt?: string;
  amount?: number; currency?: string;
  sourceReferrerName?: string; sourceReferrerOrganization?: string;
  sourceCampaign?: string; sourceEvent?: string;
  qualificationRequirement?: string; clientDeadlineAt?: string;
  budgetKnown?: number; budgetCurrency?: string; eligibilityNotes?: string;
  decisionMakerContactId?: string;
  contractingEntityId?: string; officeId?: string; serviceCategoryId?: string;
  reviewerId?: string;
  nextAction?: string; nextActionDueAt?: string; nextActionOwnerId?: string;
};

export async function createOpportunity(tx: Prisma.TransactionClient, actor: AccessUser, input: CreateOpportunityInput) {
  if (!canCreateOpportunity(actor.role)) throw new OwnershipRejected("CREATOR_NOT_PERMITTED", "Your role cannot raise new opportunities.", { status: 403 });
  const account = await tx.organization.findFirst({ where: { id: input.organizationId, AND: [organizationScope(actor)] }, select: { id: true } });
  if (!account) throw new OwnershipRejected("NOT_FOUND", "Organization not found.", { status: 404 });
  const owner = await resolveOwnerForCreation({ departmentId: input.departmentId, requestedOwnerId: input.ownerId, overrideReason: input.ownerOverrideReason }, tx);
  await assertOwnerCanAccessAccount(tx, owner.ownerId, account.id);
  if (input.leadReceivedAt && new Date(input.leadReceivedAt).getTime() > Date.now()) throw new OwnershipRejected("INVALID_LEAD_DATE", "A lead cannot have arrived in the future.", { field: "leadReceivedAt" });
  const stage = input.stage ?? "LEAD";
  const created = await tx.opportunity.create({ data: {
    title: input.title.trim(), service: input.service.trim(), organizationId: input.organizationId,
    departmentId: input.departmentId, stage, amount: input.amount ?? null,
    estimatedValue: input.amount ?? null,
    currency: input.currency ?? "KES", createdById: actor.id, ownerId: owner.ownerId,
    stageEnteredAt: new Date(), leadSource: input.leadSource,
    leadSourceNote: input.leadSourceNote?.trim() || null,
    leadReceivedAt: input.leadReceivedAt ? new Date(input.leadReceivedAt) : new Date(),
    outcome: "OPEN",
    qualificationStatus: stage === "PROSPECT" ? "UNQUALIFIED" : "QUALIFIED",
    qualificationDate: stage === "LEAD" ? new Date() : null,
    ...(input.sourceReferrerName !== undefined ? { sourceReferrerName: input.sourceReferrerName.trim() || null } : {}),
    ...(input.sourceReferrerOrganization !== undefined ? { sourceReferrerOrganization: input.sourceReferrerOrganization.trim() || null } : {}),
    ...(input.sourceCampaign !== undefined ? { sourceCampaign: input.sourceCampaign.trim() || null } : {}),
    ...(input.sourceEvent !== undefined ? { sourceEvent: input.sourceEvent.trim() || null } : {}),
    ...(input.qualificationRequirement !== undefined ? { qualificationRequirement: input.qualificationRequirement.trim() || null } : {}),
    ...(input.clientDeadlineAt ? { clientDeadlineAt: new Date(input.clientDeadlineAt) } : {}),
    ...(input.budgetKnown !== undefined ? { budgetKnown: input.budgetKnown } : {}),
    ...(input.budgetCurrency !== undefined ? { budgetCurrency: input.budgetCurrency.trim() || null } : {}),
    ...(input.eligibilityNotes !== undefined ? { eligibilityNotes: input.eligibilityNotes.trim() || null } : {}),
    ...(input.decisionMakerContactId ? { decisionMakerContactId: input.decisionMakerContactId } : {}),
    ...(input.contractingEntityId ? { contractingEntityId: input.contractingEntityId } : {}),
    ...(input.officeId ? { officeId: input.officeId } : {}),
    ...(input.serviceCategoryId ? { serviceCategoryId: input.serviceCategoryId } : {}),
    ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}),
    ...(input.nextAction !== undefined ? { nextAction: input.nextAction.trim() || null } : {}),
    ...(input.nextActionDueAt ? { nextActionDueAt: new Date(input.nextActionDueAt) } : {}),
    ...(input.nextActionOwnerId ? { nextActionOwnerId: input.nextActionOwnerId } : {}),
  }, include: { organization: true, department: true } });
  await recordInitialOwnership(tx, { opportunityId: created.id, ownerId: owner.ownerId,
    changedById: actor.id, departmentHeadId: owner.departmentHeadId, overrideReason: input.ownerOverrideReason });
  await tx.stageHistoryEntry.create({ data: { opportunityId: created.id, fromStage: null,
    toStage: created.stage, changedById: actor.id, actorType: "USER", reason: "Opportunity created." } });
  await recordAudit(tx, {
    actorId: actor.id,
    action: "CREATE",
    entityType: "Opportunity",
    entityId: created.id,
    summary: `Opportunity created: ${created.title}`,
    after: created,
  });
  return created;
}
