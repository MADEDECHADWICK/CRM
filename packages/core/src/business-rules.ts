// packages/core/src/business-rules.ts
//
// The pipeline state machine — BR-004 in executable form. This is the ONE
// place the transition rules live. apps/api enforces it on every request
// and the frontends use it to decide which buttons to enable, so the two
// can never drift apart.

import type { Stage } from "./crm-types";

export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  PROSPECT: ["LEAD"],
  // A drafting deadline is issued from qualification onward, so a deal can
  // breach while it is still a LEAD — the date was set before the proposal
  // was ever written. NOT_SUBMITTED is therefore reachable from here, or
  // the automated sweep would move a deal the state machine forbids.
  LEAD: ["PROPOSAL", "NOT_SUBMITTED"],
  // A proposal first gets prepared, then sent. Sending moves it to
  // AWAITING_FEEDBACK, which is a live state — the client is still inside
  // their response window, so it is not an outcome yet.
  PROPOSAL: ["AWAITING_FEEDBACK", "NOT_SUBMITTED", "WON", "LOST", "NO_REPLY", "DEFERRED"],
  // Can go back to PROPOSAL for a revision, or resolve once the client replies.
  AWAITING_FEEDBACK: ["PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED"],
  // The system put it here when a BD drafting deadline passed with nothing
  // submitted. Recovering to PROPOSAL is the expected, common outcome — a
  // proposal that was 90% drafted must not be destroyed because a date
  // slipped. Back to LEAD also stays legal for the rarer case where the
  // decision was to drop back to qualification rather than finish the draft.
  //
  // AWAITING_FEEDBACK is deliberately absent: that stage asserts the
  // proposal was sent, and nothing was sent. Jumping straight there would
  // let a never-submitted deal claim a submission date it never had and
  // read as SUBMITTED in the RAG column. The work has to go back through
  // PROPOSAL first.
  NOT_SUBMITTED: ["PROPOSAL", "LEAD", "LOST", "DEFERRED"],
  DEFERRED: ["PROPOSAL", "AWAITING_FEEDBACK", "WON", "LOST", "NO_REPLY"],
  WON: [],
  LOST: [],
  NO_REPLY: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The stages reachable from a given stage.
 *
 * The UI renders one button per legal target, so it needs the list rather
 * than a boolean. Returning a copy prevents a caller from mutating the
 * transition table itself, which would silently disable enforcement
 * everywhere at once.
 */
export function allowedTargets(from: Stage): Stage[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/**
 * Stages in which a proposal is actively being drafted, and therefore the
 * only stages where a BD drafting deadline is meaningful.
 *
 * A deadline does not apply to AWAITING_FEEDBACK (the draft is finished and
 * the client has it — the internal clock has served its purpose) nor to any
 * outcome stage. `NOT_SUBMITTED` is included because the sweep runs against
 * these same stages, so the overdue query and the RAG indicator can never
 * disagree about which deals a deadline applies to.
 */
export const DEADLINE_APPLICABLE_STAGES: readonly Stage[] = [
  "LEAD",
  "PROPOSAL",
  "NOT_SUBMITTED",
];

/**
 * Stages a missed drafting deadline can escalate out of.
 *
 * A narrow list on purpose: the sweep must never touch a deal that has
 * already been sent, won, lost or parked. Anything wider risks moving live
 * revenue out of the pipeline because of a job.
 */
export const BREACHABLE_STAGES: readonly Stage[] = ["LEAD", "PROPOSAL"];