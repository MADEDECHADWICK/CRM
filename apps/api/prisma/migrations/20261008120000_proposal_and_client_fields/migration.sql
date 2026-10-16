-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('RFP', 'RFQ', 'PREQUALIFICATION');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('NEW_BUSINESS', 'CROSS_SELL', 'UPSELL');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "businessType" "BusinessType",
ADD COLUMN     "signingPartnerId" TEXT,
ADD COLUMN     "submissionType" "SubmissionType";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "clientNumber" TEXT,
ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "Opportunity_submissionType_idx" ON "Opportunity"("submissionType");

-- CreateIndex
CREATE INDEX "Opportunity_businessType_idx" ON "Opportunity"("businessType");

-- CreateIndex
CREATE INDEX "Opportunity_signingPartnerId_idx" ON "Opportunity"("signingPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_clientNumber_key" ON "Organization"("clientNumber");

-- CreateIndex
CREATE INDEX "Organization_country_idx" ON "Organization"("country");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_signingPartnerId_fkey" FOREIGN KEY ("signingPartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
