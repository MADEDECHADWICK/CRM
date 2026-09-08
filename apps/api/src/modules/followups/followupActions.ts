import { prisma } from "../../lib/prisma";

type CreateFollowupInput = {
  title: string;
  description?: string;
  dueDate: Date;
  opportunityId: string;     // required by your schema — every follow-up belongs to an opportunity
  assignedToId?: string;     // optional — who it's for, if not the creator
  createdById: string;       // always the current user
};

export async function createFollowup(input: CreateFollowupInput) {
  if (input.dueDate <= new Date()) {
    throw new Error("Due date must be in the future.");
  }

  return prisma.followup.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate,
      opportunityId: input.opportunityId,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById,
    },
  });
}

// Ownership check: since assignedToId is optional on this schema, a
// follow-up with nobody explicitly assigned still has an owner in
// practice — whoever created it. So deletion is allowed by either the
// assignee (if one is set) or the creator, never by anyone else.
export async function deleteFollowup(followupId: string, requestingUserId: string) {
  const followup = await prisma.followup.findUniqueOrThrow({
    where: { id: followupId },
  });

  const isOwner =
    followup.assignedToId === requestingUserId || followup.createdById === requestingUserId;

  if (!isOwner) {
    throw new Error("You can only delete a follow-up you created or are assigned to.");
  }

  return prisma.followup.delete({ where: { id: followupId } });
}

// Not part of your original "create, schedule, delete" scope, but your
// schema already models FollowupStatus (PENDING/COMPLETED/CANCELLED) and
// completedAt — worth knowing this exists for whenever you're ready to
// let someone mark a reminder done rather than only delete it.
export async function completeFollowup(followupId: string, requestingUserId: string) {
  const followup = await prisma.followup.findUniqueOrThrow({
    where: { id: followupId },
  });

  const isOwner =
    followup.assignedToId === requestingUserId || followup.createdById === requestingUserId;
  if (!isOwner) {
    throw new Error("You can only complete a follow-up you created or are assigned to.");
  }

  return prisma.followup.update({
    where: { id: followupId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}