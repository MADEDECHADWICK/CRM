import { prisma } from "../../lib/prisma";
import { opportunityScope, organizationScope } from "../../lib/accessScope";
import {
  canOwnOpportunity,
  canReassign,
  needsOwnerOverrideReason,
  ownerOverrideRejection,
  type ReassignActor,
} from "@crm/core";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * Ownership decisions the server makes on a user's behalf, kept out of the
 * route handlers for the same reason `transitionOpportunity` exists: the rules
 * need to run inside a transaction, re-read the row they are judging, and be
 * unit-testable without an HTTP layer wrapped around them.
 *
 * The actual policy lives in @crm/core. This module is only the part that
 * needs a database — resolving who an owner *is*, and making the change
 * atomically along with its audit row.
 */

export type OwnershipErrorCode =
  | "CREATOR_NOT_PERMITTED"
  | "DEPARTMENT_NOT_FOUND"
  | "NO_DEFAULT_OWNER"
  | "UNKNOWN_USER"
  | "INVALID_OWNER"
  | "INVALID_LEAD_DATE"
  | "OVERRIDE_REASON_REQUIRED"
  | "REASON_REQUIRED"
  | "NOT_PERMITTED"
  | "NO_CHANGE"
  | "NOT_FOUND";

/**
 * A refusal the caller can act on.
 *
 * Carries the code and the offending field rather than only a message, because
 * "Owner must be a Partner or Manager" and "explain why this is not the head"
 * are different problems and a client that renders one generic banner for both
 * leaves the user guessing what to change. `status` travels with the error so
 * the route is a straight `res.status(err.status)` and cannot accidentally map
 * an authorization failure to a 400 that reads like bad input.
 */
export class OwnershipRejected extends Error {
  readonly code: OwnershipErrorCode;
  readonly field: string | undefined;
  readonly status: number;

  constructor(
    code: OwnershipErrorCode,
    message: string,
    options: { field?: string; status?: number } = {}
  ) {
    super(message);
    this.name = "OwnershipRejected";
    this.code = code;
    this.field = options.field;
    this.status = options.status ?? 400;
  }
}

export async function assertOwnerCanAccessAccount(tx: Prisma.TransactionClient, ownerId: string, organizationId: string) {
  const member = await tx.user.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true, role: true, departmentId: true, headedDepartments: { select: { id: true } } } });
  const canSee = await tx.organization.count({ where: { id: organizationId, AND: [organizationScope({ ...member, headedDepartmentIds: member.headedDepartments.map(d => d.id) })] } });
  if (!canSee) throw new OwnershipRejected("INVALID_OWNER", "Assign this account to the owner or their department before assigning an opportunity to them.", { field: "ownerId" });
}

/**
 * Works out who should own a new deal.
 *
 * The department head is the default, so the common case needs no owner choice
 * at all — that is the whole point of appointing one. Naming somebody else is
 * a deviation and needs a reason, which is what turns "the Audit deal quietly
 * sits with the Tax manager" from invisible into something you can query.
 *
 * Returns the resolved owner rather than the reason as well, because the
 * caller needs the id either way and the audit row is written separately.
 */
export async function resolveOwnerForCreation(input: {
  departmentId: string;
  requestedOwnerId?: string | undefined;
  overrideReason?: string | undefined;
}, db: Prisma.TransactionClient = prisma): Promise<{ ownerId: string; departmentHeadId: string | null }> {
  const { departmentId, requestedOwnerId, overrideReason } = input;

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      headId: true,
      head: { select: { id: true, name: true } },
    },
  });

  if (!department) {
    throw new OwnershipRejected(
      "DEPARTMENT_NOT_FOUND",
      "That department does not exist."
    );
  }

  const departmentHeadId = department.headId;

  // No explicit choice falls back to the head. With nobody appointed there is
  // no default to fall back to, so the caller has to choose rather than have
  // the server pick an arbitrary Partner.
  const ownerId = requestedOwnerId ?? departmentHeadId;
  if (!ownerId) {
    throw new OwnershipRejected(
      "NO_DEFAULT_OWNER",
      "This department has no head yet, so nobody owns its deals by default. Choose who should own this one."
    );
  }

  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true },
  });

  if (!owner) {
    throw new OwnershipRejected("UNKNOWN_USER", "That owner does not exist.");
  }

  if (!canOwnOpportunity(owner.role)) {
    throw new OwnershipRejected(
      "INVALID_OWNER",
      "A deal must be owned by a Partner or Manager."
    );
  }

  if (needsOwnerOverrideReason(departmentHeadId, ownerId) && !overrideReason?.trim()) {
    throw new OwnershipRejected(
      "OVERRIDE_REASON_REQUIRED",
      ownerOverrideRejection(department.head?.name ?? "the department head"),
      { field: "ownerOverrideReason" }
    );
  }

  return { ownerId, departmentHeadId };
}

/**
 * Records the first owner on an ownership history.
 *
 * Written on creation rather than at the first handover, so the trail is
 * complete from the moment the deal exists. Starting at the first handover
 * would leave every deal looking as though it appeared from nowhere, and
 * "how long has this person had it?" would silently under-report by however
 * long the deal predates its first move.
 *
 * Takes a transaction client rather than opening its own, so the deal and the
 * row that describes it are committed together and can never exist apart.
 */
export async function recordInitialOwnership(
  tx: Prisma.TransactionClient,
  input: {
    opportunityId: string;
    ownerId: string;
    changedById: string;
    departmentHeadId: string | null;
    overrideReason?: string | undefined;
  }
): Promise<void> {
  const { opportunityId, ownerId, changedById, departmentHeadId, overrideReason } = input;

  // The reason is mandatory on every row in this table, including the first.
  // The override reason is the interesting part where there is one; otherwise
  // the row just records that the default was followed.
  const reason = overrideReason?.trim()
    ? `Assigned on creation — ${overrideReason.trim()}`
    : departmentHeadId === ownerId
      ? "Assigned on creation — department default."
      : "Assigned on creation.";

  await tx.ownerChange.create({
    data: {
      opportunityId,
      fromOwnerId: null,
      toOwnerId: ownerId,
      changedById,
      reason,
    },
  });
}

/**
 * Hands a deal to somebody else.
 *
 * The permission check runs inside the transaction, against the row as it is
 * at that moment, rather than being done by the route before calling. Checking
 * first and writing second leaves a window in which somebody else's
 * reassignment lands in between and the write goes ahead anyway — so the
 * answer to "may this user do this?" is computed from the same read that
 * produces the value being changed.
 */
export async function reassignOpportunity(input: {
  opportunityId: string;
  newOwnerId: string;
  reason: string;
  actor: ReassignActor;
}, transaction?: Prisma.TransactionClient) {
  const { opportunityId, newOwnerId, reason, actor } = input;

  const trimmed = reason.trim();
  if (!trimmed) {
    throw new OwnershipRejected(
      "REASON_REQUIRED",
      "A reason explaining why the deal is moving is required.",
      { field: "reason" }
    );
  }

  const work = async (tx: Prisma.TransactionClient) => {
    // opportunityScope, not a bare lookup: a Manager may only act on deals they
    // own, and that has to hold here as well as on the list endpoints or the
    // scope rule becomes decorative.
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, ...opportunityScope(actor) },
      select: {
        id: true,
        organizationId: true,
        stage: true,
        ownerId: true,
        createdById: true,
        breachNoteRequired: true,
        organization: { select: { assignedToId: true, assignedDepartmentId: true } },
      },
    });

    if (!opp) {
      throw new OwnershipRejected(
        "NOT_FOUND",
        "Opportunity not found or not in your scope."
      );
    }

    const decision = canReassign(actor, {
      ownerId: opp.ownerId,
      createdById: opp.createdById,
    });
    if (!decision.allowed) {
      throw new OwnershipRejected("NOT_PERMITTED", decision.message, { status: 403 });
    }

    if (opp.ownerId === newOwnerId) {
      throw new OwnershipRejected(
        "NO_CHANGE",
        "That person already owns this deal."
      );
    }

    const target = await tx.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, role: true, departmentId: true },
    });

    if (!target) {
      throw new OwnershipRejected("UNKNOWN_USER", "That owner does not exist.");
    }

    if (!canOwnOpportunity(target.role)) {
      throw new OwnershipRejected(
        "INVALID_OWNER",
        "A deal can only be owned by a Partner or Manager."
      );
    }

    const accountUnassigned = !opp.organization?.assignedToId && !opp.organization?.assignedDepartmentId;
    if (accountUnassigned && opp.stage === "PROSPECT") {
      // A prospect that has never been assigned can be picked up directly from
      // the pipeline. Assign the account at the same time so the new owner can
      // actually see it; assigned accounts still require an account assignment.
      await tx.organization.update({
        where: { id: opp.organizationId },
        data: {
          assignedToId: newOwnerId,
          ...(target.departmentId ? { assignedDepartmentId: target.departmentId } : {}),
          assignedById: actor.id,
          assignedAt: new Date(),
        },
      });
    } else {
      await assertOwnerCanAccessAccount(tx, newOwnerId, opp.organizationId);
    }

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: { ownerId: newOwnerId },
    });

    // An OwnerChange row rather than a Note. A note has no type, so a handover
    // used to be indistinguishable from any other comment and "who had this
    // deal, and when did it move?" meant reading prose. changedById is kept
    // separate from toOwnerId because the person handing a deal on is usually
    // not the person receiving it, and both are worth knowing.
    await tx.ownerChange.create({
      data: {
        opportunityId,
        fromOwnerId: opp.ownerId,
        toOwnerId: newOwnerId,
        changedById: actor.id,
        reason: trimmed,
      },
    });

    // The missed-deadline explanation is a debt owed by the owner, so it moves
    // with the deal. Left behind, the new owner would be chased for a breach
    // they did not cause and the old owner would keep a reminder on a deal that
    // is no longer theirs. Only the pending reminder moves — a completed one is
    // history and rewriting it would be the audit trail lying.
    if (opp.breachNoteRequired) {
      await tx.followup.updateMany({
        where: {
          opportunityId,
          status: "PENDING",
          OR: [
            { note: { contains: "missed its BD drafting deadline" } },
            { note: { contains: "was not submitted by its BD deadline" } },
          ],
        },
        data: { assignedToId: newOwnerId },
      });
    }

    return updated;
  };
  return transaction ? work(transaction) : prisma.$transaction(work, { isolationLevel: "Serializable" });
}
