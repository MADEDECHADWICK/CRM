// packages/core/src/rag.ts
//
// Red/Amber/Green tracking for BD-issued proposal drafting deadlines (BR-017).
//
// THE ONE RULE: this is computed, never stored. A `ragStatus` column on
// Opportunity would be correct for exactly one instant and silently wrong
// from then on — the moment the clock crosses midnight, the moment a job
// fails, the moment someone edits a deadline directly in the database. The
// status is a function of (deadline, now, stage) and nothing else, so it is
// derived at read time in the API and rendered in the clients. There is
// deliberately no way to persist a RAG value.
//
// This lives in @crm/core beside the transition table for the same reason
// canTransition does: the API filters on it and the mobile/web clients colour
// from it, so a single definition means a deal can never be amber on the
// phone and green on the dashboard.

import type { Stage } from "./crm-types";
import { DEADLINE_APPLICABLE_STAGES } from "./business-rules";

/**
 * Five states, not three.
 *
 * The business asked for red/amber/green. A three-state model is not
 * sufficient here because the system has two other real states that the
 * three-state version has to lie about:
 *
 *  - NO_DEADLINE — BD has not issued one yet. A legitimate state, and a
 *    missing deadline is itself worth seeing, so it gets its own value
 *    rather than defaulting to green ("fine") and hiding the gap.
 *  - SUBMITTED — the clock stopped. A submitted proposal has no meaningful
 *    countdown, and showing it red for the rest of the month would be noise.
 *  - OVERDUE — the deadline has passed. This is the state that triggers
 *    BR-019's automatic move to NOT_SUBMITTED, and it cannot be represented
 *    as "red" without conflating "due tomorrow" with "missed three weeks ago".
 */
export type RagStatus =
  /** No BD deadline has been issued for this deal. */
  | "NO_DEADLINE"
  /** Deadline issued, comfortably more than 15 days remain. */
  | "GREEN"
  /** 5 to 15 days remain. */
  | "AMBER"
  /** 5 days or fewer remain. */
  | "RED"
  /** The deadline passed and nothing was submitted. */
  | "OVERDUE"
  /** The proposal went out; the countdown no longer applies. */
  | "SUBMITTED";

/** Upper bound (exclusive) of the green band, in days remaining. */
export const RAG_AMBER_THRESHOLD_DAYS = 15;

/** Upper bound (exclusive) of the amber band, in days remaining. */
export const RAG_RED_THRESHOLD_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The inputs a RAG decision needs. Deliberately minimal and string-tolerant. */
export type RagInput = {
  /** The BD-issued internal drafting deadline. Absent means none was issued. */
  proposalDueAt?: string | Date | null;
  /** When the proposal actually went to the client, if it has. */
  proposalSubmittedAt?: string | Date | null;
  /** The deal's current pipeline stage. */
  stage: Stage;
};

export type RagResult = {
  status: RagStatus;
  /**
   * Whole days until the deadline. Negative once overdue.
   * null when there is no deadline or the clock has already stopped.
   */
  daysRemaining: number | null;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Classifies a deal's proposal deadline.
 *
 * Precedence is deliberate and load-bearing:
 *   1. Already submitted wins over everything, including an expired deadline.
 *      A proposal that was sent on time but is read the day after its
 *      internal deadline is not overdue — the internal date exists to make
 *      room for review before sending, and once it is sent the question is
 *      moot. Without this ordering a late-submitted-but-already-sent
 *      proposal would be wrongly dragged into the breach sweep.
 *   2. No deadline means no countdown.
 *   3. A deadline only means something while the draft is actually in
 *      progress. Out of scope in every other stage.
 */
export function ragFor(input: RagInput, now: Date = new Date()): RagResult {
  const submittedAt = toDate(input.proposalSubmittedAt);
  if (submittedAt) {
    return { status: "SUBMITTED", daysRemaining: null };
  }

  const dueAt = toDate(input.proposalDueAt);
  if (!dueAt) {
    return { status: "NO_DEADLINE", daysRemaining: null };
  }

  if (!DEADLINE_APPLICABLE_STAGES.includes(input.stage)) {
    return { status: "NO_DEADLINE", daysRemaining: null };
  }

  // Floor, not round: at 09:00 on the deadline day, a 17:00 deadline has
  // under a day left and should read as RED, not "0 days, therefore AMBER".
  const msRemaining = dueAt.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / MS_PER_DAY);

  // Strictly negative, so a deadline that expires at some point today still
  // reads as RED for the whole of today and only becomes OVERDUE tomorrow.
  if (daysRemaining < 0) {
    return { status: "OVERDUE", daysRemaining };
  }

  if (daysRemaining <= RAG_RED_THRESHOLD_DAYS) {
    return { status: "RED", daysRemaining };
  }

  if (daysRemaining <= RAG_AMBER_THRESHOLD_DAYS) {
    return { status: "AMBER", daysRemaining };
  }

  return { status: "GREEN", daysRemaining };
}

/**
 * True when a deal is genuinely late and the breach sweep should act.
 *
 * Separate from ragFor() on purpose: this is a decision, not a colour. It
 * requires OVERDUE *and* no submission *and* a stage the sweep is allowed
 * to touch, so no caller can accidentally trigger an automatic stage change
 * by reusing the display helper.
 */
export function isProposalOverdue(
  input: RagInput,
  now: Date = new Date()
): boolean {
  if (toDate(input.proposalSubmittedAt)) return false;
  if (!DEADLINE_APPLICABLE_STAGES.includes(input.stage)) return false;
  const rag = ragFor(input, now);
  return rag.status === "OVERDUE";
}

/** Compact form for list rows and API responses: just the label. */
export function ragStatusFor(
  input: RagInput,
  now: Date = new Date()
): RagStatus {
  return ragFor(input, now).status;
}

export const RAG_LABELS: Record<RagStatus, string> = {
  NO_DEADLINE: "No deadline",
  GREEN: "On track",
  AMBER: "Due soon",
  RED: "Due now",
  OVERDUE: "Overdue",
  SUBMITTED: "Submitted",
};
