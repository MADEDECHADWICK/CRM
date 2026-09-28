import { prisma } from "../../lib/prisma";
import { ALLOWED_TRANSITIONS, canTransition, type Stage } from "@crm/core";

type TransitionInput = {
  opportunityId: string;
  toStage: Stage;
  changedById: string;
  reason: string;        // REQUIRED on every transition — BR-010, stored on StageHistoryEntry
  amount?: number;       // required specifically when toStage is WON
  revisitAt?: Date;      // required specifically when toStage is DEFERRED
  lostReason?: string;   // optional structured reason when toStage is LOST (BR-007)
};

export async function transitionOpportunity(input: TransitionInput) {
  const { opportunityId, toStage, changedById, reason, amount, revisitAt, lostReason } = input;

  // Field-level validation before touching the database.
  if (!reason || !reason.trim()) {
    throw new Error("A reason explaining this decision is required.");
  }
  if (toStage === "WON" && (amount === undefined || amount <= 0)) {
    throw new Error("Amount is required to mark an opportunity Won.");
  }
  if (toStage === "DEFERRED") {
    if (!revisitAt) throw new Error("A revisit date is required to defer an opportunity.");
    if (revisitAt <= new Date()) throw new Error("Revisit date must be in the future.");
  }
  // AWAITING_FEEDBACK never *requires* a chase date — the client may be
  // reading it today — but if one is supplied it must still be sensible, and
  // it drives an automatic follow-up just like a deferral does.
  if (toStage === "AWAITING_FEEDBACK" && revisitAt && revisitAt <= new Date()) {
    throw new Error("Feedback due date must be in the future.");
  }

  return prisma.$transaction(async (tx) => {
    // Re-fetch and validate the state machine INSIDE the transaction, so a
    // concurrent edit can't slip an illegal transition through between the
    // check and the write.
    const current = await tx.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
    });

    if (!canTransition(current.stage, toStage)) {
      throw new Error(`Cannot move an opportunity from ${current.stage} directly to ${toStage}.`);
    }

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: toStage,
        amount: amount ?? current.amount,
        wonAt: toStage === "WON" ? new Date() : current.wonAt,
        lostAt: toStage === "LOST" ? new Date() : current.lostAt,
        // The stage clock resets on every transition — this is what powers
        // "days in stage".
        stageEnteredAt: new Date(),
        // BR-008: DEFERRED carries the revisit date that drives its follow-up.
        revisitAt: toStage === "DEFERRED" ? revisitAt : null,
        // BR-007: structured lost reason, only meaningful on a LOST outcome.
        lostReason: toStage === "LOST" ? lostReason ?? null : null,
      },
    });

    // The mandatory decision note lives here — on the transition record
    // itself, not a separate Note. This is what makes "why did this move"
    // answerable by reading history, per BR-010 and BR-015.
    await tx.stageHistoryEntry.create({
      data: {
        opportunityId,
        fromStage: current.stage,
        toStage,
        changedById,
        reason: reason.trim(),
      },
    });

    // Deferring creates its own Followup automatically — the revisit
    // date stored on the Opportunity becomes the reminder's dueAt, so a
    // deferred deal resurfaces on the assignee's own follow-up list
    // without anyone needing to remember to check back manually (BR-008).
    if (toStage === "DEFERRED" && revisitAt) {
      await tx.followup.create({
        data: {
          note: `Revisit deferred opportunity: ${current.title}`,
          type: "CALL",
          dueAt: revisitAt,
          opportunityId,
          assignedToId: current.ownerId ?? changedById,
          createdById: changedById,
        },
      });
    }

    // Same courtesy for a proposal that went out: if the user committed to
    // checking back, that promise becomes a real reminder instead of a note
    // someone has to remember.
    if (toStage === "AWAITING_FEEDBACK" && revisitAt) {
      await tx.followup.create({
        data: {
          note: `Chase proposal feedback: ${current.title}`,
          type: "CALL",
          dueAt: revisitAt,
          opportunityId,
          assignedToId: current.ownerId ?? changedById,
          createdById: changedById,
        },
      });
    }

    return updated;
  });
}