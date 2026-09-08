import { prisma } from "../../lib/prisma";
import type { Stage } from "../../../generated/prisma/client";

type TransitionInput = {
  opportunityId: string;
  toStage: Stage;
  changedById: string;
  reason: string;        // REQUIRED on every transition — BR-010, stored on StageHistoryEntry
  amount?: number;       // required specifically when toStage is WON
  revisitAt?: Date;      // required specifically when toStage is DEFERRED
};

// Matches your actual Stage enum, including PROSPECT as the starting stage.
// A Lead has no proposal yet, so it cannot resolve directly to an outcome —
// Proposal is the only door out of Lead, same logic for Prospect → Lead.
const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  PROSPECT: ["LEAD"],
  LEAD: ["PROPOSAL"],
  PROPOSAL: ["WON", "LOST", "NO_REPLY", "DEFERRED"],
  DEFERRED: ["PROPOSAL", "WON", "LOST", "NO_REPLY"],
  WON: [],
  LOST: [],
  NO_REPLY: [],
};

export async function transitionOpportunity(input: TransitionInput) {
  const { opportunityId, toStage, changedById, reason, amount, revisitAt } = input;

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

  return prisma.$transaction(async (tx) => {
    // Re-fetch and validate the state machine INSIDE the transaction, so a
    // concurrent edit can't slip an illegal transition through between the
    // check and the write.
    const current = await tx.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
    });

    if (!ALLOWED_TRANSITIONS[current.stage].includes(toStage)) {
      throw new Error(`Cannot move an opportunity from ${current.stage} directly to ${toStage}.`);
    }

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: toStage,
        amount: amount ?? current.amount,
        wonAt: toStage === "WON" ? new Date() : current.wonAt,
        lostAt: toStage === "LOST" ? new Date() : current.lostAt,
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

    // Deferring creates its own Followup automatically — since there's no
    // dedicated revisitAt column on Opportunity, the Followup's dueDate IS
    // the revisit date. This is what makes BR-008 real: a deferred deal
    // resurfaces on the assignee's own follow-up list without anyone
    // needing to remember to check back manually.
    if (toStage === "DEFERRED" && revisitAt) {
      await tx.followup.create({
        data: {
          title: `Revisit deferred opportunity: ${current.title}`,
          dueDate: revisitAt,
          opportunityId,
          assignedToId: changedById,
          createdById: changedById,
        },
      });
    }

    return updated;
  });
}