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
  PROPOSAL: ["WON", "LOST", "NO_REPLY", "DEFERRED"],
  DEFERRED: ["PROPOSAL", "WON", "LOST", "NO_REPLY"],
  WON: [],
  LOST: [],
  NO_REPLY: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}