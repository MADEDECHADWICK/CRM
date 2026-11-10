import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import { followupScope, type AccessUser } from "../../lib/accessScope";

type CreateFollowupInput = {
  note: string;
  type?: "CALL" | "EMAIL" | "MEETING";
  dueAt: Date;
  opportunityId?: string;    // optional — a reminder can exist with no CRM context (BR-011)
  organizationId?: string;   // optional — may reference an organization instead
  assignedToId?: string;     // optional — who it's for, if not the creator
  createdById: string;       // always the current user
};

export async function createFollowup(input: CreateFollowupInput, db: Prisma.TransactionClient = prisma) {
  if (!input.note || !input.note.trim()) {
    throw new Error("A note describing the follow-up is required.");
  }
  if (input.dueAt <= new Date()) {
    throw new Error("Due date must be in the future.");
  }

  return db.followup.create({
    data: {
      note: input.note.trim(),
      type: input.type ?? "CALL",
      dueAt: input.dueAt,
      opportunityId: input.opportunityId ?? null,
      organizationId: input.organizationId ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById,
    },
  });
}

// Ownership check: since assignedToId is optional on this schema, a
// follow-up with nobody explicitly assigned still has an owner in
// practice — whoever created it. So deletion is allowed by either the
// assignee (if one is set) or the creator, never by anyone else.
// This and the GET list scope are what make BR-011 ("follow-ups belong to
// the person who created them") true on the backend.
export async function deleteFollowup(followupId: string, user: AccessUser) {
  const followup = await prisma.followup.findFirstOrThrow({
    where: { id: followupId, ...followupScope(user) },
  });

  const isOwner =
    followup.assignedToId === user.id || followup.createdById === user.id;

  if (!isOwner) {
    throw new Error("You can only delete a follow-up you created or are assigned to.");
  }

  return prisma.followup.delete({ where: { id: followupId, AND: [followupScope(user)] } });
}

export async function completeFollowup(followupId: string, user: AccessUser, db: Prisma.TransactionClient = prisma) {
  const followup = await db.followup.findFirstOrThrow({
    where: { id: followupId, AND: [followupScope(user)] },
  });

  const isOwner =
    followup.assignedToId === user.id || followup.createdById === user.id;
  if (!isOwner) {
    throw new Error("You can only complete a follow-up you created or are assigned to.");
  }

  return db.followup.update({
    where: { id: followupId, AND: [followupScope(user)] },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
