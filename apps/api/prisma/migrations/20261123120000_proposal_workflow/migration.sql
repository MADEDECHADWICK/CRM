-- CreateEnum
CREATE TYPE "ProposalWorkflowStage" AS ENUM ('TECHNICAL_PREPARATION', 'BD_QUALITY_REVIEW', 'RETURNED_TO_TECHNICAL', 'PARTNER_SIGNOFF', 'APPROVED_FOR_SUBMISSION', 'SUBMITTED');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "bdOwnerId" TEXT,
ADD COLUMN     "technicalOwnerId" TEXT;

-- AlterTable
ALTER TABLE "ProposalRevision" ADD COLUMN     "bdReviewedAt" TIMESTAMP(3),
ADD COLUMN     "bdReviewedById" TEXT,
ADD COLUMN     "partnerSignedAt" TIMESTAMP(3),
ADD COLUMN     "partnerSignedById" TEXT,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "technicalCompletedAt" TIMESTAMP(3),
ADD COLUMN     "technicalCompletedById" TEXT,
ADD COLUMN     "workflowStage" "ProposalWorkflowStage" NOT NULL DEFAULT 'TECHNICAL_PREPARATION';

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_technicalOwnerId_fkey" FOREIGN KEY ("technicalOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_bdOwnerId_fkey" FOREIGN KEY ("bdOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_technicalCompletedById_fkey" FOREIGN KEY ("technicalCompletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_bdReviewedById_fkey" FOREIGN KEY ("bdReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_partnerSignedById_fkey" FOREIGN KEY ("partnerSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

