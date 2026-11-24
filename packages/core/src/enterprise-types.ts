// Shared domain vocabulary for the enterprise CRM extensions.
//
// These types deliberately mirror the Prisma enums but remain independent of
// generated code so both web and mobile can consume them. The legacy Stage
// pipeline stays in crm-types; opportunity outcome, qualification and proposal
// progress are separate axes and must never be collapsed back into Stage.

export const ROLES = [
  "MARKETING_BD",
  "PARTNER",
  "MANAGER",
  "PROPOSAL_COORDINATOR",
  "TECHNICAL_REVIEWER",
  "COUNTRY_LEAD",
  "IT_ADMIN",
] as const;

export type EnterpriseRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<EnterpriseRole, string> = {
  MARKETING_BD: "Head of Marketing & BD",
  PARTNER: "Partner / Director",
  MANAGER: "Manager",
  PROPOSAL_COORDINATOR: "BD team member",
  TECHNICAL_REVIEWER: "Technical reviewer",
  COUNTRY_LEAD: "Country lead",
  IT_ADMIN: "IT administrator",
};

export const OPPORTUNITY_OUTCOMES = [
  "OPEN",
  "ON_HOLD",
  "WON",
  "LOST",
  "WITHDRAWN",
  "CLIENT_CANCELLED",
  "NO_AWARD",
  "NO_BID",
  "NO_RESPONSE",
] as const;

export type OpportunityOutcome = (typeof OPPORTUNITY_OUTCOMES)[number];

export const OPPORTUNITY_OUTCOME_LABELS: Record<OpportunityOutcome, string> = {
  OPEN: "Open",
  ON_HOLD: "On hold",
  WON: "Won",
  LOST: "Lost",
  WITHDRAWN: "Withdrawn",
  CLIENT_CANCELLED: "Client cancelled",
  NO_AWARD: "No award",
  NO_BID: "No-bid",
  NO_RESPONSE: "No response",
};

/** Outcomes that close an opportunity out. */
export const CLOSED_OUTCOMES: readonly OpportunityOutcome[] = [
  "WON",
  "LOST",
  "WITHDRAWN",
  "CLIENT_CANCELLED",
  "NO_AWARD",
  "NO_BID",
  "NO_RESPONSE",
];

/** Only these two are competitive decisions for win-rate reporting. */
export const COMPETITIVE_OUTCOMES: readonly OpportunityOutcome[] = ["WON", "LOST"];

export const QUALIFICATION_STATUSES = [
  "UNQUALIFIED",
  "QUALIFIED",
  "NO_GO",
  "DISQUALIFIED",
] as const;

export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  UNQUALIFIED: "Unqualified",
  QUALIFIED: "Qualified",
  NO_GO: "No-go",
  DISQUALIFIED: "Disqualified",
};

export const PROPOSAL_STATUSES = [
  "PENDING_INPUTS",
  "IN_PREPARATION",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SUBMITTED",
  "NOT_SUBMITTED",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  PENDING_INPUTS: "Pending inputs",
  IN_PREPARATION: "In preparation",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  NOT_SUBMITTED: "Not submitted",
};

export const LOSS_REASON_CODES = [
  "PRICE_FEES",
  "TECHNICAL_SCORE",
  "EXPERIENCE_CREDENTIALS",
  "RELATIONSHIP_INCUMBENT",
  "SCOPE_MISMATCH",
  "PROCUREMENT_COMPLIANCE",
  "OTHER",
  "NOT_SUPPLIED",
] as const;

export type LossReasonCode = (typeof LOSS_REASON_CODES)[number];

export const LOSS_REASON_LABELS: Record<LossReasonCode, string> = {
  PRICE_FEES: "Price or fees",
  TECHNICAL_SCORE: "Technical score",
  EXPERIENCE_CREDENTIALS: "Experience or credentials",
  RELATIONSHIP_INCUMBENT: "Relationship or incumbent",
  SCOPE_MISMATCH: "Scope mismatch",
  PROCUREMENT_COMPLIANCE: "Procurement compliance",
  OTHER: "Other (explain)",
  NOT_SUPPLIED: "Reason not supplied",
};

export const COMMERCIAL_CATEGORIES = [
  "NEW_BUSINESS",
  "RENEWAL",
  "CROSS_SELL",
  "UPSELL",
] as const;

export type CommercialCategory = (typeof COMMERCIAL_CATEGORIES)[number];

export const COMMERCIAL_CATEGORY_LABELS: Record<CommercialCategory, string> = {
  NEW_BUSINESS: "New client",
  RENEWAL: "Renewal",
  CROSS_SELL: "Cross-selling",
  UPSELL: "Upselling",
};

export const PREQUALIFICATION_STATUSES = [
  "DRAFT",
  "PENDING_INPUTS",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

export type PrequalificationStatus = (typeof PREQUALIFICATION_STATUSES)[number];

export const PREQUALIFICATION_STATUS_LABELS: Record<PrequalificationStatus, string> = {
  DRAFT: "Draft",
  PENDING_INPUTS: "Pending inputs",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

export const CREDENTIAL_STATUSES = [
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "REVOKED",
  "PENDING",
] as const;

export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const CHECKLIST_ITEM_STATUSES = [
  "PENDING",
  "COMPLETE",
  "REVIEWED",
  "NOT_APPLICABLE",
  "BLOCKED",
] as const;

export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "INVALIDATED",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const AWARD_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "DISPUTED",
] as const;

export type AwardVerificationStatus = (typeof AWARD_VERIFICATION_STATUSES)[number];

export const ENGAGEMENT_LETTER_STATUSES = [
  "NOT_STARTED",
  "SENT",
  "SIGNED",
  "RECEIVED",
  "NOT_REQUIRED",
] as const;

export type EngagementLetterStatus = (typeof ENGAGEMENT_LETTER_STATUSES)[number];

export const TAX_BASES = ["UNKNOWN", "EXCLUSIVE", "INCLUSIVE", "EXEMPT"] as const;
export type TaxBasis = (typeof TAX_BASES)[number];

export const BILLING_FREQUENCIES = [
  "UNKNOWN",
  "ONE_OFF",
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL",
  "OTHER",
] as const;

export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

/** External metadata only. No files are uploaded to or stored in the CRM. */
export type CredentialMetadata = {
  id: string;
  name: string;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  reference?: string | null;
  version?: string | null;
  expiryAt?: string | null;
  status: CredentialStatus;
  notes?: string | null;
};

export type ProposalChecklistItemView = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  required: boolean;
  requiresReview: boolean;
  sortOrder: number;
  status: ChecklistItemStatus;
  responsibleRole?: string | null;
  responsibleUserId?: string | null;
  completedAt?: string | null;
  reviewedAt?: string | null;
  comment?: string | null;
};

export type ProposalApprovalView = {
  id: string;
  kind: "REVIEW" | "APPROVAL";
  status: ApprovalStatus;
  actorId?: string | null;
  actorRole?: string | null;
  decidedAt?: string | null;
  comment?: string | null;
  selfApproval: boolean;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
};

export type ProposalRevisionView = {
  id: string;
  revisionNumber: number;
  status: ProposalStatus;
  checklistTemplateVersionId?: string | null;
  summary?: string | null;
  approvedAt?: string | null;
  approvalInvalidatedAt?: string | null;
  approvalInvalidationReason?: string | null;
  createdAt: string;
  submissions?: {
    id: string;
    submittedAt: string;
    channel: string;
    externalReference?: string | null;
    proofReference?: string | null;
    isFirstSubmission: boolean;
  }[];
  checklistItems?: ProposalChecklistItemView[];
  approvals?: ProposalApprovalView[];
  credentialReferences?: {
    id: string;
    credentialId: string;
    credentialVersion?: string | null;
    note?: string | null;
    credential?: CredentialMetadata;
  }[];
};

export type ProposalView = {
  id: string;
  opportunityId: string;
  title: string;
  currentRevisionNumber: number;
  createdAt: string;
  revisions?: ProposalRevisionView[];
};
