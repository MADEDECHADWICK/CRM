import { prisma } from "../../lib/prisma";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  missingForProposal,
  type MissingField,
  type Stage,
} from "@crm/core";

type TransitionInput = {
  opportunityId: string;
  toStage: Stage;
  changedById: string;
  reason: string;        // REQUIRED on every transition — BR-010, stored on StageHistoryEntry
  amount?: number;       // required specifically when toStage is WON
  revisitAt?: Date;      // required specifically when toStage is DEFERRED
  lostReason?: string;   // optional structured reason when toStage is LOST (BR-007)
};

export class TransitionRejected extends Error {
  readonly missing: MissingField[];
  constructor(message: string, missing: MissingField[] = []) {
    super(message);
    this.name = "TransitionRejected";
    this.missing = missing;
  }
}

export async function transitionOpportunity(input: TransitionInput) {
  const { opportunityId, toStage, changedById, reason, amount, revisitAt, lostReason } = input;

  // Field-level validation before touching the database.
  if (!reason || !reason.trim()) {
    throw new TransitionRejected("A reason explaining this decision is required.");
  }
  if (toStage === "WON" && (amount === undefined || amount <= 0)) {
    throw new TransitionRejected("Amount is required to mark an opportunity Won.");
  }
  if (toStage === "DEFERRED") {
    if (!revisitAt) throw new TransitionRejected("A revisit date is required to defer an opportunity.");
    if (revisitAt <= new Date()) throw new TransitionRejected("Revisit date must be in the future.");
  }
  // AWAITING_FEEDBACK never *requires* a chase date — the client may be
  // reading it today — but if one is supplied it must still be sensible, and
  // it drives an automatic follow-up just like a deferral does.
  if (toStage === "AWAITING_FEEDBACK" && revisitAt && revisitAt <= new Date()) {
    throw new TransitionRejected("Feedback due date must be in the future.");
  }

  return prisma.$transaction(async (tx) => {
    // Re-fetch and validate the state machine INSIDE the transaction, so a
    // concurrent edit can't slip an illegal transition through between the
    // check and the write.
    //
    // Contacts hang off the Organization, not the Opportunity — the same
    // client's people serve every deal they have — so the completeness gate
    // reaches them through organization.contacts.
    const current = await tx.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      include: { organization: { include: { contacts: true } } },
    });

    if (!canTransition(current.stage, toStage)) {
      throw new TransitionRejected(`Cannot move an opportunity from ${current.stage} directly to ${toStage}.`);
    }

    // BR-020: completeness is gated on the moment the firm is about to
    // commit to a number in writing, not on the moment the record was
    // created. This is the only point at which a missing decision-maker
    // email or phone starts costing real money, and the last cheap moment
    // to collect it.
    if (toStage === "PROPOSAL") {
      const missing = missingForProposal({
        organization: current.organization,
        contacts: current.organization.contacts,
      });
      if (missing.length) {
        throw new TransitionRejected(
          `Complete the client record before writing a proposal. ${missing.length} field${missing.length === 1 ? "" : "s"} outstanding.`,
          missing
        );
      }
    }

    const now = new Date();

    // Moving to AWAITING_FEEDBACK *is* the act of sending the proposal, so
    // this is the only moment at which the real submission date can be
    // captured honestly. Recorded here rather than on a separate screen so
    // it can never drift from the stage that means it happened (BR-016).
    const submittedNow = toStage === "AWAITING_FEEDBACK";

    // Recovering out of NOT_SUBMITTED clears the debt the breach raised. The
    // assignee is not absolved — the breach note is still owed and
    // breachNoteRequired is deliberately left alone — but the deal is moving
    // again, so the *escalation* stops here. Demanding the explanation before
    // allowing a recovery would trap people in a stage they cannot leave,
    // which is the opposite of what the recoverable stage is for.
    const recovering = current.stage === "NOT_SUBMITTED" && toStage === "PROPOSAL";

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: toStage,
        amount: amount ?? current.amount,
        wonAt: toStage === "WON" ? now : current.wonAt,
        lostAt: toStage === "LOST" ? now : current.lostAt,
        // The stage clock resets on every transition — this is what powers
        // "days in stage".
        stageEnteredAt: now,
        // BR-008: DEFERRED carries the revisit date that drives its follow-up.
        revisitAt: toStage === "DEFERRED" ? revisitAt : null,
        // BR-007: structured lost reason, only meaningful on a LOST outcome.
        lostReason: toStage === "LOST" ? lostReason ?? null : null,

        // BR-016: the submission stamp. Never overwritten — the first send
        // is the one that matters for velocity, and a later revision
        // resubmission must not rewrite history.
        proposalSubmittedAt: submittedNow ? now : current.proposalSubmittedAt,
        // Recovery clears the breach marker but not the obligation, for the
        // reason given above.
        proposalBreachedAt: recovering ? null : current.proposalBreachedAt,
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
        actorType: "USER",
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
