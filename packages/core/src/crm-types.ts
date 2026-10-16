import type { ReportPeriod } from "./reporting";
import type { LeadSource } from "./lead-source";
import type { RagResult } from "./rag";

export type { LeadSource };

export type Role = "MARKETING_BD" | "PARTNER" | "MANAGER";

/**
 * The single source of truth for the pipeline stages, in pipeline order.
 * `Stage` is derived from this so the union can never drift from the list —
 * and so API validators, report loops and UI ordering all read one array
 * instead of hand-copied literals that silently go stale.
 */
export const STAGES = [
  "PROSPECT",
  "LEAD",
  "PROPOSAL",
  "AWAITING_FEEDBACK",
  "NOT_SUBMITTED",
  "WON",
  "LOST",
  "NO_REPLY",
  "DEFERRED",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Stages that represent live, undecided money. Used by reporting so a deal
 * awaiting client feedback still counts toward the pipeline forecast —
 * it is genuinely still in play.
 *
 * NOT_SUBMITTED is in PROPOSAL_STAGES but deliberately not here: a missed
 * drafting deadline is an internal process failure, not money sitting with a
 * client, so counting it as active pipeline value would overstate the
 * forecast. It is still visible on the pipeline — it is simply not valued.
 */
export const ACTIVE_PROPOSAL_STAGES: readonly Stage[] = [
  "PROPOSAL",
  "AWAITING_FEEDBACK",
];

/** Every stage that represents a proposal that exists but is not yet sent. */
export const PROPOSAL_STAGES: readonly Stage[] = [
  "PROPOSAL",
  "AWAITING_FEEDBACK",
  "NOT_SUBMITTED",
];

/** Stages that close an opportunity out for good. */
export const TERMINAL_STAGES: readonly Stage[] = ["WON", "LOST", "NO_REPLY"];

export type FollowupStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export type FollowupType = "CALL" | "EMAIL" | "MEETING";

/** How a proposal was submitted (review: RFP/RFQ together, prequal separately). */
export type SubmissionType = "RFP" | "RFQ" | "PREQUALIFICATION";

/** Commercial nature of a won job (review: acquisition vs account expansion). */
export type BusinessType = "NEW_BUSINESS" | "CROSS_SELL" | "UPSELL";

export const SUBMISSION_TYPES: readonly SubmissionType[] = [
  "RFP",
  "RFQ",
  "PREQUALIFICATION",
];

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  RFP: "RFP",
  RFQ: "RFQ",
  PREQUALIFICATION: "Prequalification",
};

export const BUSINESS_TYPES: readonly BusinessType[] = [
  "NEW_BUSINESS",
  "CROSS_SELL",
  "UPSELL",
];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  NEW_BUSINESS: "New business",
  CROSS_SELL: "Cross-selling",
  UPSELL: "Upselling",
};

export type Department = {
  id: string;
  name: string;
  description?: string | null;
  /// The person appointed to run this department, if one has been appointed.
  headId?: string | null;
  head?: Pick<UserLite, "id" | "name" | "role"> | null;
};

export type Organization = {
  id: string;
  name: string;
  /** Short client reference number, auto-assigned (e.g. CL-0001). */
  clientNumber?: string | null;
  industry?: string | null;
  /** Client country — drives country-level reporting. */
  country?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
};

// A named person at a client organization. Distinct from
// Organization.email / phone, which are the generic company details —
// this is the individual you actually email or call.
export type Contact = {
  id: string;
  name: string;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  notes?: string | null;
  organizationId: string;
  organization?: Organization;
  createdAt?: string;
  updatedAt?: string;
};

export type Opportunity = {
  id: string;
  title: string;
  description?: string | null;
  stage: Stage;
  amount?: number | string | null;
  currency: string;
  service: string;
  stageEnteredAt: string;
  revisitAt?: string | null;
  lostReason?: string | null;
  organizationId: string;
  departmentId: string;
  ownerId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  wonAt?: string | null;
  lostAt?: string | null;

  // --- Proposal drafting lifecycle (BR-016 … BR-019) ---

  /** Where the lead came from. Mandatory — no default, ever. */
  leadSource: LeadSource;
  /** Free text describing the source; required only when source = OTHER. */
  leadSourceNote?: string | null;
  /** When the lead itself arrived, which may predate the typed record. */
  leadReceivedAt: string;
  /** The BD-issued INTERNAL deadline for having the draft ready. */
  proposalDueAt?: string | null;
  /** The BD who issued that deadline. */
  proposalDueSetById?: string | null;
  /** When the deadline was issued, as distinct from when it falls due. */
  proposalDueSetAt?: string | null;
  /** When the finished proposal actually went to the client. */
  proposalSubmittedAt?: string | null;
  /** When the system moved this deal to NOT_SUBMITTED. */
  proposalBreachedAt?: string | null;
  /** Whether the assignee still owes an explanation for the missed deadline. */
  breachNoteRequired: boolean;
  /** When that explanation is due — owed after the flag, not at it. */
  breachNoteDueAt?: string | null;
  /** When the explanation was given and the debt cleared. */
  breachNoteClearedAt?: string | null;

  /** How the proposal was submitted (RFP/RFQ/prequalification). */
  submissionType?: SubmissionType | null;
  /** For a won job: new business / cross-selling / upselling. */
  businessType?: BusinessType | null;
  /** The Partner who signed the engagement. */
  signingPartnerId?: string | null;
  signingPartner?: Pick<UserLite, "id" | "name" | "role"> | null;

  organization?: Organization;
  department?: Department;
  /** Computed on the server, never stored (see rag.ts). */
  rag?: RagResult;
};

export type Followup = {
  id: string;
  type: FollowupType;
  note: string;
  status: FollowupStatus;
  dueAt: string;
  completedAt?: string | null;
  opportunityId?: string | null;
  organizationId?: string | null;
  assignedToId?: string | null;
  createdById: string;
  opportunity?: Opportunity;
  organization?: Organization;
};

export type ReportingSummary = {
  totalProspects: number;
  totalLeads: number;
  totalProposals: number;
  /** Proposals sent to the client, still inside their response window. */
  totalAwaitingFeedback?: number;
  totalClients: number;
  /** Value of everything still undecided (proposal + awaiting feedback). */
  activeProposalValue: number;
  activeProposalCount?: number;
  wonValue: number;
  wonCount?: number;
  lostValue: number;
  lostCount?: number;
  period?: ReportPeriod;
  periodFrom?: string | null;
  periodTo?: string | null;
};

// Users surfaced by GET /users — never passwordHash. Partner and Manager
// rows are the "staff" a Marketing/BD admin manages; the BD user appears
// too so the same list can feed owner pickers and admin views.
export type UserLite = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string | null;
  department?: Department | null;
  /**
   * The department this user runs, when they run one.
   *
   * Carried on the user rather than left for the client to join up from the
   * department list, because the client mostly needs the answer in the other
   * direction: when appointing somebody as a head, the question is whether
   * they already head a department somewhere else. A person can only head one,
   * so the answer decides whether the action is even legal.
   */
  headsDepartmentId?: string | null;
};

// Staff records via POST/PATCH /users — only Partner and Manager roles can
// be created today (a BD user is created by the seed, not the staff form).
//
// This is the compile-time half of the rule. The runtime half is
// isOwnerEligible() in ownership.ts, which narrows to exactly this shape and
// preserves any extra fields the caller selected. Reach for that rather than
// re-filtering by hand: the two are kept aligned deliberately, and a screen
// that hand-rolls its own filter is the place a fourth role would be missed.
export type StaffUser = UserLite & {
  role: "PARTNER" | "MANAGER";
};

// GET /departments — name plus live member count for the Team screen.
export type DepartmentDetail = Department & {
  memberCount: number;
};

// One row of the breakdown report: a staff member or department plus its
// pipeline counts and financial rollups for the chosen period. Zeros are
// always present so every member/department shows up even with no activity
// in the window.
export type StageCounts = Record<Stage, number>;

export type BreakdownRow = {
  id: string;
  name: string;
  subtitle?: string | null;
  counts: StageCounts;
  wonValue: number;
  wonCount: number;
  lostValue: number;
  lostCount: number;
  activeProposalValue: number;
};

export type ReportingBreakdown = {
  dimension: "owner" | "department";
  period: ReportPeriod;
  periodFrom?: string | null;
  periodTo?: string | null;
  rows: BreakdownRow[];
  totals: Omit<BreakdownRow, "id" | "name" | "subtitle">;
};

// The richer shapes returned by GET /opportunities/:id — the note and
// stage-history trails behind every deal.
export type StageHistoryEntry = {
  id: string;
  fromStage: Stage | null;
  toStage: Stage;
  reason: string;
  changedAt: string;
  /** A person, or the automated deadline sweep. */
  actorType: "USER" | "SYSTEM";
  /** Why the system acted, present only on SYSTEM entries. */
  systemReason?: string | null;
  changedBy?: { id: string; name: string } | null;
};

export type OpportunityNote = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
};

/**
 * One entry in an opportunity's ownership history.
 *
 * Distinct from StageHistoryEntry, and deliberately so. A stage change and an
 * ownership change are independent decisions that frequently happen at
 * different times: a deal can move from Grace to Ken while sitting in PROPOSAL
 * the whole time, and Ken can then move it on again without the stage ever
 * changing. Folding both into one timeline made "who has owned this?" and
 * "what stage was it in when they got it?" impossible to answer separately.
 */
export type OwnerChange = {
  id: string;
  /** Null only on the initial assignment, where there was no previous owner. */
  fromOwnerId?: string | null;
  toOwnerId: string;
  changedById: string;
  /** Mandatory, including on the initial assignment. */
  reason: string;
  changedAt: string;
  fromOwner?: { id: string; name: string } | null;
  toOwner: { id: string; name: string };
  changedBy: { id: string; name: string };
};

export type OpportunityDetail = Opportunity & {
  owner?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  notes?: OpportunityNote[];
  stageHistory?: StageHistoryEntry[];
  /** Newest first, matching stageHistory's ordering. */
  ownerChanges?: OwnerChange[];
};