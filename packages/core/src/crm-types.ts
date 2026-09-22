import type { ReportPeriod } from "./reporting";

export type Role = "MARKETING_BD" | "PARTNER" | "MANAGER";

export type Stage =
  | "PROSPECT"
  | "LEAD"
  | "PROPOSAL"
  | "WON"
  | "LOST"
  | "NO_REPLY"
  | "DEFERRED";

export type FollowupStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export type FollowupType = "CALL" | "EMAIL" | "MEETING";

export type Department = {
  id: string;
  name: string;
  description?: string | null;
};

export type Organization = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
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

  organization?: Organization;
  department?: Department;
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
  totalClients: number;
  activeProposalValue: number;
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
};

// Staff records via POST/PATCH /users — only Partner and Manager roles can
// be created today (a BD user is created by the seed, not the staff form).
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

export type OpportunityDetail = Opportunity & {
  owner?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  notes?: OpportunityNote[];
  stageHistory?: StageHistoryEntry[];
};