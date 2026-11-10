import { canCreateOpportunity, type LeadSource, type Stage } from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";
import { organizationScope, type AccessUser } from "../../lib/accessScope";
import { assertOwnerCanAccessAccount, OwnershipRejected, recordInitialOwnership, resolveOwnerForCreation } from "./ownership";

export type CreateOpportunityInput = {
  title: string; organizationId: string; departmentId: string; service: string;
  ownerId?: string; ownerOverrideReason?: string; stage?: Extract<Stage, "PROSPECT" | "LEAD">;
  leadSource: LeadSource; leadSourceNote?: string; leadReceivedAt?: string;
  amount?: number; currency?: string;
};

export async function createOpportunity(tx: Prisma.TransactionClient, actor: AccessUser, input: CreateOpportunityInput) {
  if (!canCreateOpportunity(actor.role)) throw new OwnershipRejected("CREATOR_NOT_PERMITTED", "Your role cannot raise new opportunities.", { status: 403 });
  const account = await tx.organization.findFirst({ where: { id: input.organizationId, AND: [organizationScope(actor)] }, select: { id: true } });
  if (!account) throw new OwnershipRejected("NOT_FOUND", "Organization not found.", { status: 404 });
  const owner = await resolveOwnerForCreation({ departmentId: input.departmentId, requestedOwnerId: input.ownerId, overrideReason: input.ownerOverrideReason }, tx);
  await assertOwnerCanAccessAccount(tx, owner.ownerId, account.id);
  if (input.leadReceivedAt && new Date(input.leadReceivedAt).getTime() > Date.now()) throw new OwnershipRejected("INVALID_LEAD_DATE", "A lead cannot have arrived in the future.", { field: "leadReceivedAt" });
  const created = await tx.opportunity.create({ data: {
    title: input.title.trim(), service: input.service.trim(), organizationId: input.organizationId,
    departmentId: input.departmentId, stage: input.stage ?? "LEAD", amount: input.amount ?? null,
    currency: input.currency ?? "KES", createdById: actor.id, ownerId: owner.ownerId,
    stageEnteredAt: new Date(), leadSource: input.leadSource,
    leadSourceNote: input.leadSourceNote?.trim() || null,
    leadReceivedAt: input.leadReceivedAt ? new Date(input.leadReceivedAt) : new Date(),
  }, include: { organization: true, department: true } });
  await recordInitialOwnership(tx, { opportunityId: created.id, ownerId: owner.ownerId,
    changedById: actor.id, departmentHeadId: owner.departmentHeadId, overrideReason: input.ownerOverrideReason });
  await tx.stageHistoryEntry.create({ data: { opportunityId: created.id, fromStage: null,
    toStage: created.stage, changedById: actor.id, actorType: "USER", reason: "Opportunity created." } });
  return created;
}
