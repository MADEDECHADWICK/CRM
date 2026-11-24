// Role capabilities. Data scope is enforced separately by the API (assigned
// account, department, portfolio or explicit record). This file answers only
// "what kind of action may this role perform?" — never "which records?".

import type { Role } from "./crm-types";

export const GROUP_OVERSIGHT_ROLES: readonly Role[] = ["MARKETING_BD"];
export const APPROVER_ROLES: readonly Role[] = ["MARKETING_BD", "PARTNER", "MANAGER"];
export const OPPORTUNITY_CREATOR_ROLES: readonly Role[] = [
  "MARKETING_BD",
  "PARTNER",
  "MANAGER",
  "PROPOSAL_COORDINATOR",
  "COUNTRY_LEAD",
];
export const EXPORT_ROLES: readonly Role[] = [
  "MARKETING_BD",
  "PARTNER",
  "MANAGER",
  "COUNTRY_LEAD",
  "PROPOSAL_COORDINATOR",
];

export function isGroupCommercialOversight(role: Role, isAdmin = false): boolean {
  return isAdmin || GROUP_OVERSIGHT_ROLES.includes(role);
}

/** System configuration and support. IT does not get commercial approval. */
export function canConfigureSystem(role: Role, isAdmin = false): boolean {
  return isAdmin || role === "IT_ADMIN" || role === "MARKETING_BD";
}

export function canManageUsers(role: Role, isAdmin = false): boolean {
  return isAdmin || role === "MARKETING_BD" || role === "IT_ADMIN";
}

export function canCreateOpportunityByRole(role: Role): boolean {
  return OPPORTUNITY_CREATOR_ROLES.includes(role);
}

export function canRecordOutcomeRole(role: Role): boolean {
  return ["MARKETING_BD", "PARTNER", "MANAGER", "COUNTRY_LEAD"].includes(role);
}

export function canApproveProposalRole(role: Role): boolean {
  return APPROVER_ROLES.includes(role);
}

export function canReviewProposalRole(role: Role): boolean {
  return ["PARTNER", "MANAGER", "TECHNICAL_REVIEWER", "MARKETING_BD"].includes(role);
}

export function canExportReportsRole(role: Role): boolean {
  return EXPORT_ROLES.includes(role);
}

export function canMergeAccountsRole(role: Role, isAdmin = false): boolean {
  return isAdmin || role === "MARKETING_BD";
}

export function canArchiveRole(role: Role, isAdmin = false): boolean {
  return isAdmin || role === "MARKETING_BD";
}

export function canApproveAwardRole(role: Role): boolean {
  return ["PARTNER", "MANAGER", "MARKETING_BD"].includes(role);
}

/** IT administrators are explicitly excluded from commercial approval. */
export function isCommercialApprover(role: Role, isAdmin = false): boolean {
  if (role === "IT_ADMIN") return false;
  return isAdmin || APPROVER_ROLES.includes(role);
}

/** A user may never approve their own proposal when policy forbids it. */
export function isSelfApproval(
  actorId: string,
  proposalOwnerId: string | null | undefined,
  createdById?: string | null
): boolean {
  return actorId === proposalOwnerId || actorId === createdById;
}

/**
 * Whether the actor's amount falls inside a configured approval band.
 * A null/undefined limit means the band is open on that side.
 */
export function isWithinApprovalLimit(
  amount: number | null | undefined,
  policy: { minAmount?: number | null; maxAmount?: number | null }
): boolean {
  if (amount == null) return true;
  if (policy.minAmount != null && amount < policy.minAmount) return false;
  if (policy.maxAmount != null && amount > policy.maxAmount) return false;
  return true;
}
