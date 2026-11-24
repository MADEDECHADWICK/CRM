-- CreateEnum
CREATE TYPE "OpportunityOutcome" AS ENUM ('OPEN', 'ON_HOLD', 'WON', 'LOST', 'WITHDRAWN', 'CLIENT_CANCELLED', 'NO_AWARD', 'NO_BID', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('UNQUALIFIED', 'QUALIFIED', 'NO_GO', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "LossReasonCode" AS ENUM ('PRICE_FEES', 'TECHNICAL_SCORE', 'EXPERIENCE_CREDENTIALS', 'RELATIONSHIP_INCUMBENT', 'SCOPE_MISMATCH', 'PROCUREMENT_COMPLIANCE', 'OTHER', 'NOT_SUPPLIED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING_INPUTS', 'IN_PREPARATION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUBMITTED', 'NOT_SUBMITTED');

-- CreateEnum
CREATE TYPE "ChecklistVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'COMPLETE', 'REVIEWED', 'NOT_APPLICABLE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('REVIEW', 'APPROVAL');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateEnum
CREATE TYPE "PrequalificationStatus" AS ENUM ('DRAFT', 'PENDING_INPUTS', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AllocationBasis" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'REASSIGN', 'ARCHIVE', 'RESTORE', 'DISABLE', 'MERGE', 'EXPORT', 'SUBMIT', 'INVALIDATE', 'QUALIFY', 'OUTCOME', 'HANDOVER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AwardVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EngagementLetterStatus" AS ENUM ('NOT_STARTED', 'SENT', 'SIGNED', 'RECEIVED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "TaxBasis" AS ENUM ('UNKNOWN', 'EXCLUSIVE', 'INCLUSIVE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('UNKNOWN', 'ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'PROPOSAL_COORDINATOR';
ALTER TYPE "Role" ADD VALUE 'TECHNICAL_REVIEWER';
ALTER TYPE "Role" ADD VALUE 'COUNTRY_LEAD';
ALTER TYPE "Role" ADD VALUE 'IT_ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Stage" ADD VALUE 'WITHDRAWN';
ALTER TYPE "Stage" ADD VALUE 'CLIENT_CANCELLED';
ALTER TYPE "Stage" ADD VALUE 'NO_AWARD';
ALTER TYPE "Stage" ADD VALUE 'NO_BID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FollowupType" ADD VALUE 'TASK';
ALTER TYPE "FollowupType" ADD VALUE 'HANDOVER';

-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'RENEWAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "contractingEntityId" TEXT,
ADD COLUMN     "duplicateReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "officeId" TEXT,
ADD COLUMN     "parentOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "approvedQuotedFee" DECIMAL(18,2),
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "awardApprovedById" TEXT,
ADD COLUMN     "awardCurrency" TEXT,
ADD COLUMN     "awardDate" TIMESTAMP(3),
ADD COLUMN     "awardEvidenceReference" TEXT,
ADD COLUMN     "awardVerificationStatus" "AwardVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "bidCostCurrency" TEXT,
ADD COLUMN     "bidPurchaseCost" DECIMAL(18,2),
ADD COLUMN     "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "budgetCurrency" TEXT,
ADD COLUMN     "budgetKnown" DECIMAL(18,2),
ADD COLUMN     "clientDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAwardValue" DECIMAL(18,2),
ADD COLUMN     "conflictCheckNotes" TEXT,
ADD COLUMN     "conflictCheckStatus" TEXT DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "conflictCheckedAt" TIMESTAMP(3),
ADD COLUMN     "conflictCheckedById" TEXT,
ADD COLUMN     "contractingEntityId" TEXT,
ADD COLUMN     "decisionMakerContactId" TEXT,
ADD COLUMN     "eligibilityNotes" TEXT,
ADD COLUMN     "engagementLetterReference" TEXT,
ADD COLUMN     "engagementLetterStatus" "EngagementLetterStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "estimatedValue" DECIMAL(18,2),
ADD COLUMN     "feedbackActionId" TEXT,
ADD COLUMN     "feedbackRequestedAt" TIMESTAMP(3),
ADD COLUMN     "goNoGoAt" TIMESTAMP(3),
ADD COLUMN     "goNoGoById" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legacyStage" TEXT,
ADD COLUMN     "lossReasonCode" "LossReasonCode",
ADD COLUMN     "lossReasonDetail" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDueAt" TIMESTAMP(3),
ADD COLUMN     "nextActionOwnerId" TEXT,
ADD COLUMN     "noGoReason" TEXT,
ADD COLUMN     "noGoReasonCode" TEXT,
ADD COLUMN     "officeId" TEXT,
ADD COLUMN     "onHoldReason" TEXT,
ADD COLUMN     "outcome" "OpportunityOutcome" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "qualificationDate" TIMESTAMP(3),
ADD COLUMN     "qualificationNotes" TEXT,
ADD COLUMN     "qualificationRequirement" TEXT,
ADD COLUMN     "qualificationStatus" "QualificationStatus" NOT NULL DEFAULT 'UNQUALIFIED',
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "serviceCategoryId" TEXT,
ADD COLUMN     "sourceCampaign" TEXT,
ADD COLUMN     "sourceEvent" TEXT,
ADD COLUMN     "sourcePrequalificationId" TEXT,
ADD COLUMN     "sourceReferrerName" TEXT,
ADD COLUMN     "sourceReferrerOrganization" TEXT,
ADD COLUMN     "submittedFee" DECIMAL(18,2),
ADD COLUMN     "taxBasis" "TaxBasis" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "termMonths" INTEGER,
ADD COLUMN     "wonValueVarianceReason" TEXT;

-- CreateTable
CREATE TABLE "ContractingEntity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "country" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'KES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractingEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "entityId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccessScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT,
    "contractingEntityId" TEXT,
    "officeId" TEXT,
    "departmentId" TEXT,
    "organizationId" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityContributor" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityAllocation" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contractingEntityId" TEXT,
    "amount" DECIMAL(18,2),
    "percentage" DECIMAL(9,4),
    "currency" TEXT,
    "basis" "AllocationBasis" NOT NULL DEFAULT 'PERCENT',
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING_INPUTS',
    "checklistTemplateVersionId" TEXT,
    "summary" TEXT,
    "feeAmount" DECIMAL(18,2),
    "feeCurrency" TEXT,
    "scopeSummary" TEXT,
    "keyTerms" TEXT,
    "materialSnapshot" JSONB,
    "materialVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvalInvalidatedAt" TIMESTAMP(3),
    "approvalInvalidationReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalSubmission" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "externalReference" TEXT,
    "proofReference" TEXT,
    "isFirstSubmission" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "submittedById" TEXT NOT NULL,

    CONSTRAINT "ProposalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ChecklistVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "configuration" JSONB,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "responsibleRole" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalChecklistItem" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "responsibleRole" TEXT,
    "responsibleUserId" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityId" TEXT,
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "requiredRole" "Role",
    "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
    "prohibitsSelfApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalApproval" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL DEFAULT 'APPROVAL',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT,
    "actorRole" "Role",
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "amountAtDecision" DECIMAL(18,2),
    "currency" TEXT,
    "selfApproval" BOOLEAN NOT NULL DEFAULT false,
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedById" TEXT,
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "reference" TEXT,
    "version" TEXT,
    "expiryAt" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalCredentialReference" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "credentialVersion" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalCredentialReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prequalification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "departmentId" TEXT,
    "ownerId" TEXT,
    "status" "PrequalificationStatus" NOT NULL DEFAULT 'DRAFT',
    "applicationDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cost" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "validityFrom" TIMESTAMP(3),
    "expiryAt" TIMESTAMP(3),
    "renewalOfId" TEXT,
    "externalReference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Prequalification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "deliveryError" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "calculationBasis" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReportView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReportView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "cadence" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "deliveryMechanism" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "primaryOrganizationId" TEXT NOT NULL,
    "candidateOrganizationId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "matchReasons" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decision" TEXT,
    "notes" TEXT,
    "mergedOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractingEntity_name_key" ON "ContractingEntity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ContractingEntity_code_key" ON "ContractingEntity"("code");

-- CreateIndex
CREATE INDEX "ContractingEntity_country_idx" ON "ContractingEntity"("country");

-- CreateIndex
CREATE UNIQUE INDEX "Office_name_key" ON "Office"("name");

-- CreateIndex
CREATE INDEX "Office_entityId_idx" ON "Office"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_name_key" ON "ServiceCategory"("name");

-- CreateIndex
CREATE INDEX "UserAccessScope_userId_idx" ON "UserAccessScope"("userId");

-- CreateIndex
CREATE INDEX "UserAccessScope_country_idx" ON "UserAccessScope"("country");

-- CreateIndex
CREATE INDEX "UserAccessScope_contractingEntityId_idx" ON "UserAccessScope"("contractingEntityId");

-- CreateIndex
CREATE INDEX "UserAccessScope_organizationId_idx" ON "UserAccessScope"("organizationId");

-- CreateIndex
CREATE INDEX "UserAccessScope_opportunityId_idx" ON "UserAccessScope"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityContributor_userId_idx" ON "OpportunityContributor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityContributor_opportunityId_userId_key" ON "OpportunityContributor"("opportunityId", "userId");

-- CreateIndex
CREATE INDEX "OpportunityAllocation_opportunityId_idx" ON "OpportunityAllocation"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityAllocation_country_idx" ON "OpportunityAllocation"("country");

-- CreateIndex
CREATE INDEX "Proposal_opportunityId_idx" ON "Proposal"("opportunityId");

-- CreateIndex
CREATE INDEX "ProposalRevision_status_idx" ON "ProposalRevision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalRevision_proposalId_revisionNumber_key" ON "ProposalRevision"("proposalId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ProposalSubmission_revisionId_submittedAt_idx" ON "ProposalSubmission"("revisionId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_name_key" ON "ChecklistTemplate"("name");

-- CreateIndex
CREATE INDEX "ChecklistTemplateVersion_status_idx" ON "ChecklistTemplateVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateVersion_templateId_version_key" ON "ChecklistTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateItem_versionId_code_key" ON "ChecklistTemplateItem"("versionId", "code");

-- CreateIndex
CREATE INDEX "ProposalChecklistItem_revisionId_idx" ON "ProposalChecklistItem"("revisionId");

-- CreateIndex
CREATE INDEX "ProposalChecklistItem_status_idx" ON "ProposalChecklistItem"("status");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_isActive_idx" ON "ApprovalPolicy"("isActive");

-- CreateIndex
CREATE INDEX "ProposalApproval_revisionId_status_idx" ON "ProposalApproval"("revisionId", "status");

-- CreateIndex
CREATE INDEX "Credential_expiryAt_idx" ON "Credential"("expiryAt");

-- CreateIndex
CREATE INDEX "Credential_status_idx" ON "Credential"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalCredentialReference_revisionId_credentialId_credent_key" ON "ProposalCredentialReference"("revisionId", "credentialId", "credentialVersion");

-- CreateIndex
CREATE INDEX "Prequalification_organizationId_status_idx" ON "Prequalification"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Prequalification_expiryAt_idx" ON "Prequalification"("expiryAt");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "ReportSnapshot_reportKey_generatedAt_idx" ON "ReportSnapshot"("reportKey", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReportView_ownerId_name_key" ON "SavedReportView"("ownerId", "name");

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_status_idx" ON "DuplicateCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_primaryOrganizationId_candidateOrganizat_key" ON "DuplicateCandidate"("primaryOrganizationId", "candidateOrganizationId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_contractingEntityId_fkey" FOREIGN KEY ("contractingEntityId") REFERENCES "ContractingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentOrganizationId_fkey" FOREIGN KEY ("parentOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_decisionMakerContactId_fkey" FOREIGN KEY ("decisionMakerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_goNoGoById_fkey" FOREIGN KEY ("goNoGoById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_awardApprovedById_fkey" FOREIGN KEY ("awardApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_nextActionOwnerId_fkey" FOREIGN KEY ("nextActionOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contractingEntityId_fkey" FOREIGN KEY ("contractingEntityId") REFERENCES "ContractingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourcePrequalificationId_fkey" FOREIGN KEY ("sourcePrequalificationId") REFERENCES "Prequalification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ContractingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_contractingEntityId_fkey" FOREIGN KEY ("contractingEntityId") REFERENCES "ContractingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContributor" ADD CONSTRAINT "OpportunityContributor_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContributor" ADD CONSTRAINT "OpportunityContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContributor" ADD CONSTRAINT "OpportunityContributor_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAllocation" ADD CONSTRAINT "OpportunityAllocation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_checklistTemplateVersionId_fkey" FOREIGN KEY ("checklistTemplateVersionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSubmission" ADD CONSTRAINT "ProposalSubmission_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSubmission" ADD CONSTRAINT "ProposalSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateVersion" ADD CONSTRAINT "ChecklistTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateVersion" ADD CONSTRAINT "ChecklistTemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateVersion" ADD CONSTRAINT "ChecklistTemplateVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalChecklistItem" ADD CONSTRAINT "ProposalChecklistItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalChecklistItem" ADD CONSTRAINT "ProposalChecklistItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ChecklistTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalChecklistItem" ADD CONSTRAINT "ProposalChecklistItem_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalChecklistItem" ADD CONSTRAINT "ProposalChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalChecklistItem" ADD CONSTRAINT "ProposalChecklistItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ContractingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_invalidatedById_fkey" FOREIGN KEY ("invalidatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalCredentialReference" ADD CONSTRAINT "ProposalCredentialReference_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalCredentialReference" ADD CONSTRAINT "ProposalCredentialReference_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prequalification" ADD CONSTRAINT "Prequalification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prequalification" ADD CONSTRAINT "Prequalification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prequalification" ADD CONSTRAINT "Prequalification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prequalification" ADD CONSTRAINT "Prequalification_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "Prequalification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prequalification" ADD CONSTRAINT "Prequalification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReportView" ADD CONSTRAINT "SavedReportView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_primaryOrganizationId_fkey" FOREIGN KEY ("primaryOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_candidateOrganizationId_fkey" FOREIGN KEY ("candidateOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ── Conservative backfill ──────────────────────────────────────────────────
-- Existing IDs, stages, amounts and timestamps are preserved. The single
-- legacy amount is NOT copied into estimate/quote/award columns because the
-- repository does not establish which value it represented.

UPDATE "Opportunity" SET
  "legacyStage" = "stage"::text,
  "outcome" = CASE
    WHEN "stage" = 'WON' THEN 'WON'::"OpportunityOutcome"
    WHEN "stage" = 'LOST' THEN 'LOST'::"OpportunityOutcome"
    WHEN "stage" = 'NO_REPLY' THEN 'NO_RESPONSE'::"OpportunityOutcome"
    WHEN "stage" = 'DEFERRED' THEN 'ON_HOLD'::"OpportunityOutcome"
    ELSE 'OPEN'::"OpportunityOutcome"
  END,
  "outcomeAt" = CASE
    WHEN "stage" = 'WON' THEN "wonAt"
    WHEN "stage" = 'LOST' THEN "lostAt"
    ELSE NULL
  END,
  "qualificationStatus" = CASE
    WHEN "stage" = 'PROSPECT' THEN 'UNQUALIFIED'::"QualificationStatus"
    ELSE 'QUALIFIED'::"QualificationStatus"
  END;

-- The legacy amount is ambiguous. Flag rather than invent an estimate, quote
-- or award mapping. Existing won values are also flagged for review.
UPDATE "Opportunity" SET
  "reviewRequired" = true,
  "reviewReason" = 'Existing single amount preserved; confirm whether it represents an estimate, submitted fee or confirmed award before relying on it in value reports.'
WHERE "amount" IS NOT NULL AND "reviewRequired" = false;

-- Legacy prequalification submissions were only a SubmissionType. They need a
-- deliberate mapping into the new Prequalification model; do not create rows.
UPDATE "Opportunity" SET
  "reviewRequired" = true,
  "reviewReason" = 'Legacy PREQUALIFICATION submission type: create or link a Prequalification application; panel acceptance must not count as a win.',
  "outcome" = CASE WHEN "stage" = 'WON' THEN 'NO_AWARD'::"OpportunityOutcome" ELSE "outcome" END
WHERE "submissionType" = 'PREQUALIFICATION';

-- Legacy NOT_SUBMITTED rows were created by the old automatic sweep. Preserve
-- them and their history, but expose them for review instead of asserting a
-- confirmed not-submitted outcome in the new model.
UPDATE "Opportunity" SET
  "reviewRequired" = true,
  "reviewReason" = COALESCE("reviewReason" || ' ', '') || 'Legacy NOT_SUBMITTED stage was set by the old deadline sweep; overdue is a flag, not a confirmed outcome.'
WHERE "stage" = 'NOT_SUBMITTED';

-- Configurable defaults. These are fallbacks for the administrator to confirm,
-- not an assertion of Ronalds final policy.
INSERT INTO "SystemSetting" ("key", "value", "category", "description", "createdAt", "updatedAt")
VALUES
  ('service.acknowledgementTargetMinutes', '60'::jsonb, 'Service levels', 'Proposed one-business-hour acknowledgement target; confirm with Ronalds.', now(), now()),
  ('approval.prohibitSelfApproval', 'true'::jsonb, 'Approvals', 'Prohibit self-approval unless an administrator changes this setting.', now(), now()),
  ('proposal.dispatchRequiresChecklist', 'true'::jsonb, 'Proposal', 'Block dispatch until required checklist items and approvals are complete.', now(), now()),
  ('outcome.lossFeedbackActionEnabled', 'true'::jsonb, 'Outcomes', 'Create a feedback action when a loss reason is not supplied.', now(), now()),
  ('reporting.defaultCurrency', '"KES"'::jsonb, 'Reporting', 'Reporting base currency. KES is never converted a second time.', now(), now())
ON CONFLICT ("key") DO NOTHING;