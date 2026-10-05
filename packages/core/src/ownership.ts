// packages/core/src/ownership.ts
//
// Who may do what to an opportunity's ownership — the single source of truth
// for the rules the API enforces on every request and the clients use to
// decide which controls to render, so the two can never drift apart.
//
// This file exists because the rules used to be copy-pasted. "PARTNER or
// MANAGER" appeared as a literal in five places in the mobile app and three in
// the API; `user?.role === "MARKETING_BD"` appeared in three unrelated files,
// twice within the same file. None of those copies disagreed yet, which is
// precisely the danger: the first copy to be missed when the model changed
// would have been a silent authorization hole rather than a compile error.

import type { Role, UserLite } from "./crm-types";

/**
 * Roles that are allowed to own an opportunity.
 *
 * Ownership is a reporting responsibility, not a personal inbox: a deal has to
 * sit with somebody accountable for its outcome and for the staff working it.
 * Marketing & BD raise and qualify deals, so they source work rather than own
 * it — an owner who cannot be measured on what the book produces is not an
 * owner in any useful sense.
 *
 * A single definition, because every consumer should be asking the same
 * question. Anything else spreads silently.
 */
export const OWNER_ROLES = ["PARTNER", "MANAGER"] as const;

export type OwnerRole = (typeof OWNER_ROLES)[number];

/**
 * Roles allowed to raise a new opportunity.
 *
 * Deliberately an allowlist rather than "anyone signed in", even though it
 * currently contains every Role. The old behaviour — any authenticated user
 * could POST a deal — was an omission rather than a decision: the mobile UI
 * hid the button from non-BD users and nothing checked on the server, so the
 * rule existed only in the pixels. Encoding the same three roles explicitly
 * means the next role added to the enum is denied by default and somebody has
 * to choose otherwise, instead of inheriting a permission nobody granted.
 */
export const CREATOR_ROLES = ["MARKETING_BD", "PARTNER", "MANAGER"] as const;

export type CreatorRole = (typeof CREATOR_ROLES)[number];

/** Whether this role can hold ownership of an opportunity. */
export function canOwnOpportunity(role: Role): role is OwnerRole {
  return (OWNER_ROLES as readonly Role[]).includes(role);
}

/** Whether this role may raise a new opportunity. */
export function canCreateOpportunity(role: Role): boolean {
  return (CREATOR_ROLES as readonly Role[]).includes(role);
}

/**
 * Whether this role is permitted to administer staff and departments.
 *
 * Marketing & BD own lead generation, so they own the roster that generates
 * it. Kept here rather than as a `role === "MARKETING_BD"` test at each call
 * site for the same reason as everything else in this file.
 */
export function canManageStaff(role: Role): boolean {
  return role === "MARKETING_BD";
}

/**
 * Runtime narrowing to owner-eligible users, preserving the extra fields the
 * caller already selected.
 *
 * The `StaffUser` type in crm-types has always existed but had no runtime
 * counterpart, which is why every screen that wanted "just the people who can
 * own things" re-implemented the filter by hand and passed the result to a
 * typed variable with a cast. This is that counterpart.
 */
export function isOwnerEligible<T extends Pick<UserLite, "role">>(
  user: T
): user is T & { role: OwnerRole } {
  return canOwnOpportunity(user.role);
}

/** The owner-eligible subset of a list, order otherwise preserved. */
export function ownerEligible<T extends Pick<UserLite, "role">>(
  users: readonly T[]
): T[] {
  return users.filter(isOwnerEligible);
}

/**
 * Why a reassignment was refused.
 *
 * A code rather than a bare boolean, so the API can map each to a distinct
 * status and so the client can tell "you may not do this" apart from "that
 * person cannot receive this deal" — two failures with completely different
 * remedies that a single boolean would flatten into the same message.
 */
export type ReassignRejectionCode =
  | "NOT_PERMITTED"
  | "INVALID_TARGET_ROLE"
  | "NO_CHANGE"
  | "UNKNOWN_TARGET";

export type ReassignDecision =
  | { allowed: true }
  | { allowed: false; code: ReassignRejectionCode; message: string };

/**
 * The caller, as far as a reassignment decision is concerned.
 *
 * Just a role and an id. Deliberately not the whole user record: this is a
 * pure function so it can be unit tested and reasoned about without a
 * database, and because role plus identity is genuinely all the rule needs.
 */
export type ReassignActor = {
  id: string;
  role: Role;
};

/**
 * The opportunity being handed on, reduced to the three facts the rule reads.
 */
export type ReassignSubject = {
  /** Current owner, or null if the deal is unowned. */
  ownerId: string | null;
  /** Whoever raised the deal originally. */
  createdById: string;
};

/**
 * Whether `actor` may hand `subject` to somebody else.
 *
 * The business rule is that a deal moves when the person accountable for it
 * concludes they cannot execute it, so three groups qualify:
 *
 *   - the current owner, because the judgement that started this is their own;
 *   - any Partner, who carries the firm regardless of which deal is in play;
 *   - any Manager, because a Manager heads their own department and a deal in
 *     that department is theirs to redirect.
 *
 * Marketing & BD can reassign the deals they raised. They cannot reassign
 * somebody else's — once a deal has an owner, lead generation has handed it
 * over and the new owner's judgement governs it. That is the one place this
 * function encodes an opinion rather than restating a role list, so it is
 * stated here explicitly: createdById is what makes a BD the author of a deal
 * rather than a bystander to it.
 */
export function canReassign(
  actor: ReassignActor,
  subject: ReassignSubject
): ReassignDecision {
  if (actor.id === subject.ownerId) {
    return { allowed: true };
  }

  if (canOwnOpportunity(actor.role)) {
    return { allowed: true };
  }

  if (actor.role === "MARKETING_BD" && actor.id === subject.createdById) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "NOT_PERMITTED",
    message:
      "Only the current owner, a Partner, a Manager, or the Marketing & BD user who raised this deal can hand it on.",
  };
}

/**
 * Whether assigning this deal to this owner needs a stated reason.
 *
 * The default owner for a department is its head. Anyone else is a deliberate
 * deviation — the head is over-committed, the work is really another
 * department's, the head is on leave — and each of those is worth being able
 * to read about later. Requiring a reason turns "someone quietly filed the
 * Audit deal under the Tax manager" from invisible into a query.
 *
 * A department with no appointed head cannot be deviated from, so nothing is
 * required: with nobody named as the default, every eligible owner is as
 * reasonable as any other and forcing a justification would be noise.
 */
export function needsOwnerOverrideReason(
  departmentHeadId: string | null,
  ownerId: string
): boolean {
  return departmentHeadId !== null && departmentHeadId !== ownerId;
}

/**
 * The rejection for assigning to somebody who cannot own a deal.
 *
 * Returned as a function so the caller and the message cannot diverge, and so
 * the reason is written once.
 */
export function ownerOverrideRejection(departmentHeadName: string): string {
  return `This deal belongs to ${departmentHeadName}'s department, so ${departmentHeadName} should own it. Assigning someone else needs a reason.`;
}

/**
 * Order owner candidates so the department head comes first.
 *
 * Presentation only — the API will still accept any eligible owner, with a
 * reason. Sorting rather than filtering is the point: the default is one tap
 * away, but so is every other valid choice, and burying the alternatives
 * behind a search field would push people toward filing under whoever they
 * could find fastest.
 *
 * Stable within each group, so a deliberate ordering by the caller (alphabetical,
 * by workload) survives the promotion of the head to the front.
 */
export function rankOwnerCandidates<T extends { id: string }>(
  candidates: readonly T[],
  departmentHeadId: string | null
): T[] {
  if (departmentHeadId === null) {
    return [...candidates];
  }

  const head: T[] = [];
  const rest: T[] = [];

  for (const candidate of candidates) {
    (candidate.id === departmentHeadId ? head : rest).push(candidate);
  }

  return [...head, ...rest];
}