-- Proposal drafting deadlines, RAG tracking, lead-source attribution, and the
-- automatic NOT_SUBMITTED breach flow (BR-016 … BR-019).
--
-- Two deliberate departures from the auto-generated SQL, both explained inline.

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'PARTNER_REFERRAL', 'WALK_IN', 'WEBSITE', 'SOCIAL_MEDIA', 'MARKETING_CAMPAIGN', 'EXHIBITION', 'TENDER', 'COLD_OUTREACH', 'OTHER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- AlterEnum
-- NOT_SUBMITTED sits next to the other live-but-unresolved states rather than
-- down with the terminal outcomes, because it is recoverable (BR-019).
ALTER TYPE "Stage" ADD VALUE IF NOT EXISTS 'NOT_SUBMITTED' BEFORE 'WON';

-- AlterTable
-- leadReceivedAt is deliberately added WITHOUT a default. The three-step
-- add -> backfill -> constrain below cannot work otherwise: with
-- DEFAULT CURRENT_TIMESTAMP in the ADD COLUMN, every pre-existing row is
-- stamped with the moment the migration ran, and the subsequent backfill has
-- nothing left to match on. The default is attached at the very end, once
-- the historical rows hold their real values.
ALTER TABLE "Opportunity" ADD COLUMN     "breachNoteClearedAt" TIMESTAMP(3),
ADD COLUMN     "breachNoteDueAt" TIMESTAMP(3),
ADD COLUMN     "breachNoteRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leadReceivedAt" TIMESTAMP(3),
ADD COLUMN     "leadSource" "LeadSource",
ADD COLUMN     "leadSourceNote" TEXT,
ADD COLUMN     "proposalBreachedAt" TIMESTAMP(3),
ADD COLUMN     "proposalDueAt" TIMESTAMP(3),
ADD COLUMN     "proposalDueSetAt" TIMESTAMP(3),
ADD COLUMN     "proposalDueSetById" TEXT,
ADD COLUMN     "proposalSubmittedAt" TIMESTAMP(3);

-- leadSource is added NULLABLE first, then backfilled, then tightened.
--
-- The generated migration wanted a NOT NULL column on a table that already
-- holds 18 rows, which Postgres refuses outright. The three-step version
-- below is the only way to introduce a required column to a populated table
-- without dropping data.
--
-- Backfilled as OTHER deliberately. Every existing row predates channel
-- tracking, and OTHER is the only value that is actually true of them —
-- "we did not record where this came from". Guessing REFERRAL or WEBSITE
-- after the fact would put confident, false numbers into the one report the
-- business most wants to trust. The column still ends up NOT NULL, with no
-- database default, so every row written from here on must state its source
-- explicitly and no buggy code path can quietly smuggle in a default.
UPDATE "Opportunity" SET "leadSource" = 'OTHER' WHERE "leadSource" IS NULL;

-- OTHER requires a note (the API enforces it), so a backfilled row with no
-- note would be data the application would itself reject. Recording WHY it
-- is OTHER keeps the row honest — and distinguishable from a real
-- walk-in or a real partner referral, both of which are also OTHER-adjacent
-- answers a user might type.
UPDATE "Opportunity"
SET "leadSourceNote" = 'Not recorded — row predates channel tracking'
WHERE "leadSource" = 'OTHER' AND "leadSourceNote" IS NULL;

ALTER TABLE "Opportunity" ALTER COLUMN "leadSource" SET NOT NULL;

-- Historical leadReceivedAt is a faithful copy of createdAt: these rows were
-- entered when the lead was raised, so the existing timestamp is already
-- correct and inventing a separate value would only add noise. Runs while
-- the column is still nullable, so every existing row is guaranteed to be
-- rewritten.
UPDATE "Opportunity"
SET "leadReceivedAt" = "createdAt"
WHERE "leadReceivedAt" IS NULL;

ALTER TABLE "Opportunity" ALTER COLUMN "leadReceivedAt" SET NOT NULL;

-- Only now, with the history correct, is the default attached for future
-- inserts. Matches @default(now()) in the Prisma schema.
ALTER TABLE "Opportunity" ALTER COLUMN "leadReceivedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
-- changedById goes nullable so the automated sweep can record a transition
-- with no human actor. actorType is what tells the two cases apart: BR-010's
-- mandatory reason still applies to every USER transition, and SYSTEM rows
-- carry a systemReason instead. Without this the audit trail — the system's
-- strongest feature — could not record the one transition that most needs an
-- audit trail.
ALTER TABLE "StageHistoryEntry" ADD COLUMN     "actorType" "ActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN     "systemReason" TEXT,
ALTER COLUMN "changedById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Opportunity_stage_proposalDueAt_idx" ON "Opportunity"("stage", "proposalDueAt");

-- CreateIndex
CREATE INDEX "Opportunity_proposalDueAt_idx" ON "Opportunity"("proposalDueAt");

-- CreateIndex
CREATE INDEX "Opportunity_leadSource_idx" ON "Opportunity"("leadSource");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_proposalDueSetById_fkey" FOREIGN KEY ("proposalDueSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
