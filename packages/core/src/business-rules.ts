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
  LEAD: ["PROPOSAL", "NOT_SUBMITTED", "NO_BID", "WITHDRAWN"],
  // A proposal first gets prepared, then sent. Sending moves it to
  // AWAITING_FEEDBACK, which is a live state — the client is still inside
  // their response window, so it is not an outcome yet.
  PROPOSAL: ["AWAITING_FEEDBACK", "NOT_SUBMITTED", "WON", "LOST", "NO_REPLY", "DEFERRED", "NO_BID", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD"],
  // Can go back to PROPOSAL for a revision, or resolve once the client replies.
  AWAITING_FEEDBACK: ["PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD"],
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
  NOT_SUBMITTED: ["PROPOSAL", "LEAD", "LOST", "DEFERRED", "NO_BID", "WITHDRAWN"],
  DEFERRED: ["PROPOSAL", "AWAITING_FEEDBACK", "WON", "LOST", "NO_REPLY", "NO_BID", "WITHDRAWN", "CLIENT_CANCELLED", "NO_AWARD"],
  WON: [],
  LOST: [],
  WITHDRAWN: [],
  CLIENT_CANCELLED: [],
  NO_AWARD: [],
  NO_BID: [],
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
// ── Opportunity outcome, qualification and loss rules ──────────────────────
//
// The legacy Stage state machine above remains for compatibility. These rules
// govern the separate commercial outcome and qualification axes.

import type {
  LossReasonCode,
  OpportunityOutcome,
  QualificationStatus,
} from "./enterprise-types";
import { CLOSED_OUTCOMES, COMPETITIVE_OUTCOMES } from "./enterprise-types";

export const OUTCOME_REQUIRES_DATE: readonly OpportunityOutcome[] = [
  "WON",
  "LOST",
  "WITHDRAWN",
  "CLIENT_CANCELLED",
  "NO_AWARD",
  "NO_BID",
  "NO_RESPONSE",
];

export function isClosedOutcome(outcome: OpportunityOutcome): boolean {
  return CLOSED_OUTCOMES.includes(outcome);
}

/** Only Won/Lost enter the competitive win-rate denominator. */
export function isCompetitiveDecision(outcome: OpportunityOutcome): boolean {
  return COMPETITIVE_OUTCOMES.includes(outcome);
}

/**
 * No-go and disqualification are qualification decisions, never a competitive
 * loss. Keeping this helper explicit prevents a no-go being counted in the
 * win-rate denominator.
 */
export function isQualificationNoGo(status: QualificationStatus): boolean {
  return status === "NO_GO" || status === "DISQUALIFIED";
}

export type OutcomeValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validateOutcome(input: {
  outcome: OpportunityOutcome;
  outcomeAt?: Date | string | null;
  lossReasonCode?: LossReasonCode | null;
  lossReasonDetail?: string | null;
  hasAwardEvidenceReference?: boolean;
  confirmedAwardValue?: number | string | null;
}): OutcomeValidation {
  const errors: string[] = [];
  const { outcome } = input;

  if (OUTCOME_REQUIRES_DATE.includes(outcome) && !input.outcomeAt) {
    errors.push("An outcome date is required.");
  }

  if (outcome === "WON") {
    if (input.confirmedAwardValue == null) {
      errors.push("A confirmed award value is required for a win.");
    }
  }

  if (outcome === "LOST") {
    if (!input.lossReasonCode) {
      errors.push("Record a loss reason, including 'Reason not supplied' when unknown.");
    }
    if (input.lossReasonCode === "OTHER" && !input.lossReasonDetail?.trim()) {
      errors.push("Explain the 'Other' loss reason.");
    }
  }

  // Silence is not a loss. A no-response outcome is recorded separately, and
  // an overdue follow-up must never be converted into a competitive loss.
  if (outcome === "NO_RESPONSE") {
    // No special metadata is required; the distinction itself is the record.
  }

  if (
    outcome === "WITHDRAWN" ||
    outcome === "NO_BID" ||
    outcome === "CLIENT_CANCELLED" ||
    outcome === "NO_AWARD"
  ) {
    // These are deliberately not competitive losses and require only a date.
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/** A loss without a reason creates a feedback action rather than a guess. */
export function lossNeedsFeedbackAction(lossReasonCode?: LossReasonCode | null): boolean {
  return lossReasonCode === "NOT_SUPPLIED" || lossReasonCode == null;
}
