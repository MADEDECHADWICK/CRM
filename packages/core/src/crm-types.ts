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