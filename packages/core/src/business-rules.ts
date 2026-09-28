// packages/core/src/business-rules.ts
//
// The pipeline state machine — BR-004 in executable form. This is the ONE
// place the transition rules live. apps/api enforces it on every request
// and the frontends use it to decide which buttons to enable, so the two
// can never drift apart.

import type { Stage } from "./crm-types";

export const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  PROSPECT: ["LEAD"],
  LEAD: ["PROPOSAL"],
  // A proposal first gets prepared, then sent. Sending moves it to
  // AWAITING_FEEDBACK, which is a live state — the client is still inside
  // their response window, so it is not an outcome yet.
  PROPOSAL: ["AWAITING_FEEDBACK", "WON", "LOST", "NO_REPLY", "DEFERRED"],
  // Can go back to PROPOSAL for a revision, or resolve once the client replies.
  AWAITING_FEEDBACK: ["PROPOSAL", "WON", "LOST", "NO_REPLY", "DEFERRED"],
  DEFERRED: ["PROPOSAL", "AWAITING_FEEDBACK", "WON", "LOST", "NO_REPLY"],
  WON: [],
  LOST: [],
  NO_REPLY: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}