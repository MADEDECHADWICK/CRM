// apps/api/src/modules/opportunities/breachSweep.ts
//
// The automated NOT_SUBMITTED flow (BR-019).
//
// ── How this reconciles two apparently conflicting requirements ──
//
// The business asked for two things that cannot both happen at once:
//   (a) "the system automatically flags this as not submitted and does not
//        require manual input"
//   (b) "the person assigned should be required to write a note explaining
//        why it was not submitted"
//
// You cannot demand a justification at the instant the system takes an action
// the person never performed. There is nobody there to explain themselves.
//
// So the flag and the obligation are separated in time:
//
//   1. Deadline passes, nothing submitted  -> system raises an OVERDUE FLAG
//      and a *note debt* on the assignee, due in BREACH_NOTE_DUE_DAYS. The
//      stage is preserved: an overdue internal date is not proof that the
//      proposal was never submitted.
//   2. Assignee writes the explanation     -> debt cleared.
//   3. Assignee ignores it past its due date -> escalated to a Manager/BD.
//
// The obligation is real and is tracked, it is simply owed *afterwards*.
// The legacy NOT_SUBMITTED stage remains available for explicit/legacy
// records, but this sweep no longer asserts it automatically.
//
// ── Design constraint ──
//
// This runs as an in-process hourly job, which is correct for the current
// single-instance modular monolith. If the API is ever scaled to more than
// one instance this must move to a dedicated worker, or every replica will
// run the sweep. The unique guard below makes concurrent runs harmless, but
// it is a safety net rather than the intended production answer.

import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import { isProposalOverdue, BREACHABLE_STAGES, ragFor } from "@crm/core";

/**
 * How long the assignee has to explain a missed deadline.
 *
 * Three days: long enough to not be a trap for someone on leave, short
 * enough that the explanation is still about the decision rather than a
 * vague recollection weeks later.
 */
export const BREACH_NOTE_DUE_DAYS = 3;

export type SweepResult = {
  /** Deals moved to NOT_SUBMITTED by this run. */
  breached: number;
  /** Ids touched, for logging and for the idempotency guard. */
  ids: string[];
  /** Notes still outstanding past their due date — the escalation queue. */
  escalated: string[];
  /** True when nothing matched, so callers can log cheaply. */
  noop: boolean;
};

/** Atomically flags one overdue deal, once, with its history and reminder. */
export async function flagOverdueProposal(tx: Prisma.TransactionClient, opportunityId: string, now: Date): Promise<boolean> {
  // Re-read inside the transaction. Between the SELECT above and this
  // write, a person may have submitted the proposal — and a job must
  // never be the reason a real submission is overwritten.
  const fresh = await tx.opportunity.findUnique({ where: { id: opportunityId } });
  if (
    !fresh ||
    !BREACHABLE_STAGES.includes(fresh.stage) ||
    fresh.proposalSubmittedAt ||
    !fresh.proposalDueAt ||
    fresh.proposalDueAt >= now
  ) {
    return false;
  }

  const noteDueAt = new Date(now.getTime() + BREACH_NOTE_DUE_DAYS * 86400000);
  const rag = ragFor(fresh, now);
  // The conditional claim makes the sweep idempotent under concurrency:
  // only the runner that finds proposalBreachedAt still null wins. Two
  // concurrent sweeps previously each passed the findUnique above and
  // both wrote — duplicate history and duplicate reminders. PostgreSQL
  // re-checks the predicate after resolving the row lock, so the loser
  // matches zero rows.
  //
  // IMPORTANT: the stage is deliberately NOT changed. An overdue internal
  // deadline is an exception, not proof that the proposal was never
  // submitted. The legacy NOT_SUBMITTED stage remains available for explicit
  // records and historical data, but the sweep no longer asserts it.
  const claimed = await tx.opportunity.updateMany({
    where: {
      id: opportunityId,
      stage: { in: [...BREACHABLE_STAGES] },
      proposalSubmittedAt: null,
      proposalBreachedAt: null,
      proposalDueAt: { lt: now },
    },
    data: {
      proposalBreachedAt: now,
      breachNoteRequired: true,
      breachNoteDueAt: noteDueAt,
      breachNoteClearedAt: null,
      reviewRequired: true,
      reviewReason: `Internal proposal deadline passed on ${fresh.proposalDueAt.toISOString().slice(0, 10)}. Overdue flag raised; submission status not asserted.`,
    },
  });
  if (claimed.count === 0) return false;

  // The system is the actor here, not a person. The audit event records the
  // overdue flag/escalation without inventing a stage transition.
  await tx.auditEvent.create({
    data: {
      actorId: null,
      actorType: "SYSTEM",
      action: "UPDATE",
      entityType: "Opportunity",
      entityId: opportunityId,
      summary: "Proposal deadline overdue — escalation raised",
      metadata: {
        proposalDueAt: fresh.proposalDueAt.toISOString(),
        daysOverdue: rag.daysRemaining,
        stagePreserved: fresh.stage,
        note: "Overdue flag does not assert a not-submitted outcome.",
      },
    },
  });

  // The debt becomes a real reminder on the assignee's own list rather
  // than a column nobody looks at. Assigned to the owner when there is
  // one; a deal with no owner is escalated in the reporting view
  // instead, which is the more urgent problem anyway.
  const assigneeId = fresh.ownerId;
  if (assigneeId) {
    await tx.followup.create({
      data: {
        note: `Explain why "${fresh.title}" missed its BD drafting deadline`,
        type: "CALL",
        dueAt: noteDueAt,
        opportunityId: fresh.id,
        assignedToId: assigneeId,
        createdById: assigneeId,
      },
    });
  }

  return true;
}

/** Selects overdue, unsubmitted proposals and processes each independently. */
export async function sweepOverdueProposals(now: Date = new Date()): Promise<SweepResult> {
  // Over-fetch a little past the boundary rather than trusting a rounding
  // boundary to land exactly. isProposalOverdue() then makes the final call
  // in JS, so an off-by-one in this filter cannot mis-flag a deal.
  const candidates = await prisma.opportunity.findMany({
    where: {
      stage: { in: [...BREACHABLE_STAGES] },
      proposalDueAt: { not: null, lt: now },
      proposalSubmittedAt: null,
    },
    select: {
      id: true,
      stage: true,
      title: true,
      proposalDueAt: true,
      proposalSubmittedAt: true,
      ownerId: true,
      breachNoteRequired: true,
    },
  });

  const trulyOverdue = candidates.filter((row) =>
    isProposalOverdue(
      {
        stage: row.stage,
        proposalDueAt: row.proposalDueAt,
        proposalSubmittedAt: row.proposalSubmittedAt,
      },
      now
    )
  );

  const breached: string[] = [];

  // One row must never be able to abandon the rest. A single transaction that
  // fails — a dropped connection, a lock, a constraint on one record — used to
  // throw straight out of this function and silently skip every remaining
  // overdue deal until the next hourly run. Failures are counted and reported
  // instead, so the sweep is best-effort per row rather than all-or-nothing.
  const failures: string[] = [];

  for (const row of trulyOverdue) {

    try {
      const flagged = await prisma.$transaction(tx => flagOverdueProposal(tx, row.id, now));

      // Only counted when this run actually moved the deal. The re-read above
      // can legitimately decline, and reporting a decline as a breach would
      // make the log lie about what the sweep did.
      if (flagged) {
        breached.push(row.id);
      }
    } catch (err) {
      failures.push(row.id);
      console.error(`[breach-sweep] could not sweep opportunity ${row.id}:`, err);
    }
  }

  if (failures.length) {
    console.error(
      `[breach-sweep] ${failures.length} of ${trulyOverdue.length} overdue proposal(s) could not be swept this run`
    );
  }

  return {
    breached: breached.length,
    ids: breached,
    escalated: await listEscalatedBreaches(now),
    noop: breached.length === 0,
  };
}

/**
 * Breaches whose explanation was never given and is now itself overdue.
 *
 * Nothing is actioned here on purpose. Auto-escalating by reassigning or
 * closing the deal would be the system making a management decision nobody
 * authorised. This is the reporting surface that tells a Manager or BD who
 * has stopped accounting for their own deadlines — the human decides what to
 * do about it.
 */
export async function listEscalatedBreaches(now: Date = new Date()): Promise<string[]> {
  const rows = await prisma.opportunity.findMany({
    where: {
      breachNoteRequired: true,
      breachNoteClearedAt: null,
      breachNoteDueAt: { lte: now },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Runs the sweep once, at boot.
 *
 * Deliberately fire-and-forget and deliberately wrapped: a database blip at
 * startup must not stop the API from serving requests. The hourly job will
 * catch up.
 */
export async function runSweepAtStartup(): Promise<void> {
  try {
    const result = await sweepOverdueProposals();
    if (!result.noop) {
      console.log(
        `[breach-sweep] startup: flagged ${result.breached} overdue proposal(s) as NOT_SUBMITTED`
      );
    }
    if (result.escalated.length) {
      console.log(
        `[breach-sweep] startup: ${result.escalated.length} breach explanation(s) now overdue`
      );
    }
  } catch (err) {
    console.error("[breach-sweep] startup sweep failed:", err);
  }
}
