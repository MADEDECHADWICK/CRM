// apps/api/src/modules/opportunities/deadlines.ts
//
// BD-issued proposal drafting deadlines and the breach-explanation debt
// (BR-016, BR-019).

import { prisma } from "../../lib/prisma";
import { DEADLINE_APPLICABLE_STAGES, STAGES } from "@crm/core";

export class DeadlineRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineRejected";
  }
}

/**
 * Issues or revises the internal drafting deadline for a proposal.
 *
 * The deadline is INTERNAL: the date by which the draft must be finished,
 * reviewed and amended so BD and marketing still have room to change things
 * before it goes to the client. It is not the client's submission date, and
 * the two are never stored in the same field.
 *
 * Recording who set it and when, separately from when it falls due, is what
 * makes "who gave this person six days?" answerable — and that
 * accountability is the entire reason the business wants deadlines at all.
 */
export async function setProposalDeadline(input: {
  opportunityId: string;
  dueAt: Date;
  setById: string;
}) {
  const { opportunityId, dueAt, setById } = input;

  const opp = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    select: { id: true, stage: true, title: true, proposalSubmittedAt: true, proposalBreachedAt: true },
  });

  if (!DEADLINE_APPLICABLE_STAGES.includes(opp.stage)) {
    throw new DeadlineRejected(
      `A drafting deadline only applies while a proposal is in progress. This deal is ${opp.stage}.`
    );
  }

  // Re-dating a proposal that has already gone out would be rewriting a
  // completed measurement, and the RAG indicator would then claim a
  // submitted proposal is still counting down.
  if (opp.proposalSubmittedAt) {
    throw new DeadlineRejected("This proposal has already been submitted, so it no longer has a drafting deadline.");
  }

  // A deadline in the past would be flagged overdue by the very next sweep.
  // Allowing that is how a typo silently destroys a live deal, so it is
  // rejected here instead and the user picks today or later.
  if (dueAt.getTime() < Date.now() - 60 * 1000) {
    throw new DeadlineRejected("A drafting deadline cannot be in the past.");
  }

  const rearming = Boolean(opp.proposalBreachedAt);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        proposalDueAt: dueAt,
        proposalDueSetById: setById,
        proposalDueSetAt: new Date(),
        // Re-arming the clock on a breached deal: if the assignee is picking
        // the work back up, a fresh deadline is legitimate, and the old breach
        // record is cleared so the deal is not simultaneously "recovered" and
        // "flagged as failed". The stage change itself is still a manual,
        // reasoned decision by the owner.
        ...(rearming
          ? { stage: "PROPOSAL" as const, proposalBreachedAt: null, breachNoteRequired: false, breachNoteDueAt: null, breachNoteClearedAt: null }
          : {}),
      },
    });

    // Re-arming discharges the missed-deadline debt, so close the reminder the
    // sweep raised rather than leaving it stranded on the assignee's list
    // forever (it was only ever closable by a breach-note that re-arming has
    // just made unnecessary).
    if (rearming) {
      await tx.followup.updateMany({
        where: {
          opportunityId,
          status: "PENDING",
          note: { contains: "was not submitted by its BD deadline" },
        },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    return updated;
  });
}

/** Removes a deadline entirely — the legitimate "no deadline was needed" case. */
export async function clearProposalDeadline(opportunityId: string) {
  const opp = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    select: { id: true, stage: true, proposalSubmittedAt: true },
  });

  if (!DEADLINE_APPLICABLE_STAGES.includes(opp.stage)) {
    throw new DeadlineRejected(
      `A drafting deadline only applies while a proposal is in progress. This deal is ${opp.stage}.`
    );
  }

  return prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      proposalDueAt: null,
      proposalDueSetById: null,
      proposalDueSetAt: null,
    },
  });
}

/**
 * Records the assignee's explanation for a missed deadline and clears the
 * debt (BR-019).
 *
 * The note is written to the opportunity's own note trail AND stamped on
 * the deal, so the explanation is visible where someone reading the deal
 * will look and not only in a chronology.
 *
 * Clearing the debt does NOT close the opportunity. What happens next to a
 * breached deal — resume it, defer it, drop it — stays a human decision.
 */
export async function recordBreachExplanation(input: {
  opportunityId: string;
  authorId: string;
  explanation: string;
}) {
  const { opportunityId, authorId, explanation } = input;

  if (!explanation || !explanation.trim()) {
    throw new DeadlineRejected("An explanation is required.");
  }

  const opp = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    select: { id: true, title: true, ownerId: true, breachNoteRequired: true, breachNoteClearedAt: true, proposalBreachedAt: true },
  });

  // Idempotent-ish: re-submitting an explanation updates it rather than
  // stacking duplicates, but a deal that neither carries the breach marker nor
  // still owes the note cannot acquire an explanation, which would be a
  // fabricated record. The `breachNoteRequired` clause is what keeps the debt
  // closable after a recovery has already nulled proposalBreachedAt — otherwise
  // the assignee is told they owe an explanation the system then refuses.
  if (!opp.proposalBreachedAt && !opp.breachNoteRequired) {
    throw new DeadlineRejected("This opportunity was never flagged as not submitted.");
  }

  if (opp.breachNoteClearedAt) {
    throw new DeadlineRejected("An explanation has already been recorded for this deadline.");
  }

  const trimmed = explanation.trim();

  return prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        body: `Missed proposal deadline — ${trimmed}`,
        opportunityId,
        authorId,
      },
    });

    const updated = await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        breachNoteRequired: false,
        breachNoteClearedAt: new Date(),
      },
    });

    // Close the reminder the sweep created, so it stops nagging now that
    // the thing it was nagging about has been dealt with.
    await tx.followup.updateMany({
      where: {
        opportunityId,
        status: "PENDING",
        note: { contains: "was not submitted by its BD deadline" },
      },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    return { opportunity: updated, note };
  });
}

/** Validates a raw stage string against the canonical list. */
export function isKnownStage(value: string): value is (typeof STAGES)[number] {
  return (STAGES as readonly string[]).includes(value);
}
