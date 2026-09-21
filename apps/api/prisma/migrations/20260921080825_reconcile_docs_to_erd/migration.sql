/*
  Warnings:

  - You are about to drop the column `description` on the `Followup` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `Followup` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Followup` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `Note` table. All the data in the column will be lost.
  - Added the required column `dueAt` to the `Followup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `note` to the `Followup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `body` to the `Note` table without a default value. This is not possible if the table is not empty.
  - Added the required column `service` to the `Opportunity` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FollowupType" AS ENUM ('CALL', 'EMAIL', 'MEETING');

-- DropIndex
DROP INDEX "Followup_dueDate_idx";

-- DropIndex
DROP INDEX "Followup_opportunityId_dueDate_idx";

-- AlterTable
ALTER TABLE "Followup" DROP COLUMN "description",
DROP COLUMN "dueDate",
DROP COLUMN "title",
ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "note" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "type" "FollowupType" NOT NULL DEFAULT 'CALL',
ALTER COLUMN "opportunityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "content",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT,
ALTER COLUMN "opportunityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "revisitAt" TIMESTAMP(3),
ADD COLUMN     "service" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill the single pre-existing seeded opportunity, then drop the
-- transient default so the column ends up with no default (matching the
-- schema — app-level creation always supplies `service`, BR-003).
UPDATE "Opportunity" SET "service" = 'Not specified' WHERE "service" = '';
ALTER TABLE "Opportunity" ALTER COLUMN "service" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Followup_dueAt_idx" ON "Followup"("dueAt");

-- CreateIndex
CREATE INDEX "Followup_opportunityId_dueAt_idx" ON "Followup"("opportunityId", "dueAt");

-- CreateIndex
CREATE INDEX "Followup_organizationId_dueAt_idx" ON "Followup"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "Note_organizationId_createdAt_idx" ON "Note"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Followup" ADD CONSTRAINT "Followup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
