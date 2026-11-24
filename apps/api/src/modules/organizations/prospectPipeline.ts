import type { Prisma } from "../../../generated/prisma/client";
import { canOwnOpportunity, type Role } from "@crm/core";
import { recordAudit } from "../../lib/audit";

type Actor = { id: string; role: Role; isAdmin?: boolean };

/**
 * A prospect assigned to a person belongs in the pipeline from that moment.
 *
 * Assigning the account used to leave it only in the directory, so the
 * Prospects screen showed a record while Pipeline showed zero. This creates
 * the initial PROSPECT opportunity (or moves the existing prospect-stage deal
 * to its new owner/department) without inventing a service, value, proposal or
 * outcome.
 */
export async function ensureProspectOpportunity(
  tx: Prisma.TransactionClient,
  actor: Actor,
  organizationId: string,
  assignedToId?: string | null,
  assignedDepartmentId?: string | null
) {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true, name: true, isExistingClient: true,
      contractingEntityId: true, officeId: true,
      assignedToId: true, assignedDepartmentId: true,
      country: true, industry: true,
    },
  });
  if (!org || org.isExistingClient) return null;

  const opportunities = await tx.opportunity.findMany({
    where: { organizationId },
    select: { id: true, stage: true, ownerId: true, departmentId: true },
    orderBy: { createdAt: "asc" },
  });
  const existingProspect = opportunities.find((o) => o.stage === "PROSPECT");
  if (!existingProspect && opportunities.length > 0) return null;

  const member = assignedToId
    ? await tx.user.findUnique({
        where: { id: assignedToId },
        select: {
          id: true, name: true, role: true, isActive: true, departmentId: true,
          headedDepartments: { select: { id: true }, orderBy: { name: "asc" } },
        },
      })
    : null;

  const departmentId =
    assignedDepartmentId ??
    org.assignedDepartmentId ??
    member?.departmentId ??
    member?.headedDepartments[0]?.id ??
    null;
  if (!departmentId) return null;

  const department = await tx.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, headId: true },
  });
  if (!department) return null;

  const ownerId = member && canOwnOpportunity(member.role) ? member.id : department.headId;

  if (existingProspect) {
    if (existingProspect.departmentId === departmentId && existingProspect.ownerId === ownerId) {
      return existingProspect;
    }
    const updated = await tx.opportunity.update({
      where: { id: existingProspect.id },
      data: {
        departmentId,
        ...(ownerId ? { ownerId, nextActionOwnerId: ownerId } : {}),
      },
    });
    if (ownerId && existingProspect.ownerId !== ownerId) {
      await tx.ownerChange.create({
        data: {
          opportunityId: existingProspect.id,
          fromOwnerId: existingProspect.ownerId,
          toOwnerId: ownerId,
          changedById: actor.id,
          reason: "Prospect reassigned to a new owner or department.",
        },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: existingProspect.id,
      summary: "Prospect-stage opportunity moved with its account assignment",
      before: existingProspect,
      after: updated,
    });
    return updated;
  }

  const created = await tx.opportunity.create({
    data: {
      title: `${org.name} - Prospect`,
      organizationId: org.id,
      departmentId,
      service: "Service to be confirmed",
      stage: "PROSPECT",
      outcome: "OPEN",
      qualificationStatus: "UNQUALIFIED",
      leadSource: "OTHER",
      leadSourceNote: "Auto-created from prospect assignment; source to be confirmed.",
      leadReceivedAt: new Date(),
      createdById: actor.id,
      ownerId: ownerId ?? null,
      currency: "KES",
      contractingEntityId: org.contractingEntityId ?? null,
      officeId: org.officeId ?? null,
      nextAction: "Confirm the service requirement with the client",
      nextActionDueAt: new Date(Date.now() + 3 * 86400000),
      nextActionOwnerId: ownerId ?? actor.id,
    },
  });

  if (ownerId) {
    await tx.ownerChange.create({
      data: {
        opportunityId: created.id,
        fromOwnerId: null,
        toOwnerId: ownerId,
        changedById: actor.id,
        reason: "Opportunity created automatically from prospect assignment.",
      },
    });
  }
  await tx.stageHistoryEntry.create({
    data: {
      opportunityId: created.id,
      fromStage: null,
      toStage: "PROSPECT",
      changedById: actor.id,
      actorType: "USER",
      reason: "Opportunity created automatically from prospect assignment.",
    },
  });
  await recordAudit(tx, {
    actorId: actor.id,
    action: "CREATE",
    entityType: "Opportunity",
    entityId: created.id,
    summary: `Prospect opportunity created for ${org.name}`,
    after: created,
    metadata: { source: "prospect-assignment" },
  });

  return created;
}
