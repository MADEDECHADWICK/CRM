// Proposal revision workflow, dispatch gates and material-change rules.
//
// This is the single definition the API enforces and the clients explain. No
// final Ronalds checklist is encoded here: the checklist items and approval
// limits come from configurable template versions and approval policies.

import type {
  ApprovalStatus,
  ChecklistItemStatus,
  ProposalStatus,
  ProposalChecklistItemView,
  ProposalApprovalView,
} from "./enterprise-types";

/**
 * Proposal progress is a separate state machine from the opportunity Stage.
 * A proposal may be SUBMITTED while the opportunity is WON.
 */
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  PENDING_INPUTS: ["IN_PREPARATION", "NOT_SUBMITTED"],
  IN_PREPARATION: ["IN_REVIEW", "PENDING_INPUTS", "NOT_SUBMITTED"],
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "IN_PREPARATION"],
  CHANGES_REQUESTED: ["IN_PREPARATION", "IN_REVIEW", "NOT_SUBMITTED"],
  APPROVED: ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "NOT_SUBMITTED"],
  SUBMITTED: ["CHANGES_REQUESTED", "IN_PREPARATION"],
  NOT_SUBMITTED: ["IN_PREPARATION", "IN_REVIEW"],
};

export function canTransitionProposal(
  from: ProposalStatus,
  to: ProposalStatus
): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

export function proposalTargets(from: ProposalStatus): ProposalStatus[] {
  return [...PROPOSAL_TRANSITIONS[from]];
}

const COMPLETE_ITEM_STATUSES: readonly ChecklistItemStatus[] = [
  "COMPLETE",
  "REVIEWED",
  "NOT_APPLICABLE",
];

const SATISFIED_APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
  "INVALIDATED",
];

export type DispatchGateInput = {
  items: Pick<
    ProposalChecklistItemView,
    "code" | "label" | "required" | "requiresReview" | "status"
  >[];
  approvals: Pick<ProposalApprovalView, "id" | "status" | "invalidatedAt">[];
  requiredApprovals?: number;
  requiresChecklist?: boolean;
};

export type DispatchGateResult = {
  allowed: boolean;
  missingChecklist: string[];
  missingReviews: string[];
  reason: string | null;
};

/**
 * Dispatch is blocked until every applicable required checklist item is
 * complete and reviewed, and the configured number of valid approvals exists.
 *
 * Approvals invalidated by a material change do not count. This is what stops
 * an old signature being reused after the fee or scope changed.
 */
export function evaluateDispatchGate(
  input: DispatchGateInput
): DispatchGateResult {
  const missingChecklist: string[] = [];
  const missingReviews: string[] = [];

  for (const item of input.items) {
    if (!item.required) continue;
    if (!COMPLETE_ITEM_STATUSES.includes(item.status)) {
      missingChecklist.push(item.label);
      continue;
    }
    if (item.requiresReview && item.status !== "REVIEWED" && item.status !== "NOT_APPLICABLE") {
      missingReviews.push(item.label);
    }
  }

  const validApprovals = input.approvals.filter(
    (a) => a.status === "APPROVED" && !a.invalidatedAt
  ).length;
  const requiredApprovals = input.requiredApprovals ?? 1;

  if (input.requiresChecklist !== false && missingChecklist.length) {
    return {
      allowed: false,
      missingChecklist,
      missingReviews,
      reason: `${missingChecklist.length} required checklist item${missingChecklist.length === 1 ? "" : "s"} outstanding.`,
    };
  }

  if (missingReviews.length) {
    return {
      allowed: false,
      missingChecklist,
      missingReviews,
      reason: `${missingReviews.length} required review${missingReviews.length === 1 ? "" : "s"} outstanding.`,
    };
  }

  if (validApprovals < requiredApprovals) {
    return {
      allowed: false,
      missingChecklist,
      missingReviews,
      reason: `Approval is incomplete: ${validApprovals} of ${requiredApprovals} required approval${requiredApprovals === 1 ? "" : ""} recorded.`,
    };
  }

  // A rejected or invalidated approval is a hard stop, even if the numeric
  // count would otherwise be satisfied.
  const blocking = input.approvals.find(
    (a) =>
      !a.invalidatedAt &&
      SATISFIED_APPROVAL_STATUSES.includes(a.status) &&
      (a.status === "REJECTED" || a.status === "INVALIDATED")
  );
  if (blocking) {
    return {
      allowed: false,
      missingChecklist,
      missingReviews,
      reason: "The latest approval decision blocks dispatch.",
    };
  }

  return {
    allowed: true,
    missingChecklist: [],
    missingReviews: [],
    reason: null,
  };
}

/**
 * Changes that invalidate an existing approval. Defined here rather than in a
 * route so the policy is one documented list. Ronalds can extend the list
 * through configuration, but these are the conservative defaults.
 */
export const DEFAULT_MATERIAL_CHANGE_FIELDS = [
  "service",
  "scope",
  "description",
  "currency",
  "estimatedValue",
  "approvedQuotedFee",
  "submittedFee",
  "taxBasis",
  "billingFrequency",
  "termMonths",
  "deliveryAllocations",
  "credentialReferences",
  "requiredChecklistItems",
] as const;

export type MaterialChangeField = (typeof DEFAULT_MATERIAL_CHANGE_FIELDS)[number];

export type MaterialComparable = Partial<Record<MaterialChangeField, unknown>>;

const stable = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export function materialChanges(
  previous: MaterialComparable,
  next: MaterialComparable,
  fields: readonly MaterialChangeField[] = DEFAULT_MATERIAL_CHANGE_FIELDS
): MaterialChangeField[] {
  return fields.filter((field) => stable(previous[field]) !== stable(next[field]));
}

export type AllocationInput = {
  country: string;
  amount?: number | string | null;
  percentage?: number | string | null;
  basis: "PERCENT" | "AMOUNT";
  isFinalized?: boolean;
};

export type AllocationReconciliation = {
  valid: boolean;
  errors: string[];
  allocatedAmount: number | null;
  allocatedPercentage: number | null;
};

/**
 * Multi-country allocations must reconcile when they are finalized.
 * Percentages reconcile to 100. Amounts reconcile to the opportunity value
 * (within a one-cent tolerance). Neither is inferred from partial history.
 */
export function reconcileAllocations(
  allocations: AllocationInput[],
  opportunityValue: number | null | undefined
): AllocationReconciliation {
  const errors: string[] = [];
  let amountTotal = 0;
  let percentageTotal = 0;
  let hasAmount = false;
  let hasPercentage = false;

  for (const allocation of allocations) {
    if (!allocation.country?.trim()) errors.push("Every allocation needs a country.");
    if (allocation.basis === "AMOUNT") {
      if (allocation.amount == null) {
        errors.push(`Allocation for ${allocation.country || "unknown country"} has no amount.`);
      } else {
        hasAmount = true;
        amountTotal += Number(allocation.amount);
      }
    } else {
      if (allocation.percentage == null) {
        errors.push(`Allocation for ${allocation.country || "unknown country"} has no percentage.`);
      } else {
        hasPercentage = true;
        percentageTotal += Number(allocation.percentage);
      }
    }
  }

  if (hasAmount && hasPercentage) {
    errors.push("Use either amount-based or percentage-based allocations, not both.");
  }

  if (hasPercentage && Math.abs(percentageTotal - 100) > 0.01) {
    errors.push(`Percentages total ${percentageTotal.toFixed(2)}%, not 100%.`);
  }

  if (
    hasAmount &&
    opportunityValue != null &&
    Math.abs(amountTotal - Number(opportunityValue)) > 0.01
  ) {
    errors.push(
      `Allocated amounts total ${amountTotal.toFixed(2)}, not the opportunity value ${Number(opportunityValue).toFixed(2)}.`
    );
  }

  if (hasAmount && opportunityValue == null) {
    errors.push("An opportunity value is required before amount-based allocations can be finalized.");
  }

  return {
    valid: errors.length === 0,
    errors,
    allocatedAmount: hasAmount ? amountTotal : null,
    allocatedPercentage: hasPercentage ? percentageTotal : null,
  };
}
