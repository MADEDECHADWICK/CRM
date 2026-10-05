-- Additive only: no column is dropped, renamed or retyped, and nothing is
-- made NOT NULL. Existing rows stay valid throughout, which is why this can be
-- applied to a live database without a backfill or a maintenance window.
--
-- Department.headId is deliberately left NULL on every existing department.
-- Appointing a head is a business decision — who actually runs each department
-- is not something this migration can know — so the UI appoints them, and an
-- unheaded department behaves as "any Partner or Manager may own" until then.

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "headId" TEXT;

-- CreateTable
CREATE TABLE "OwnerChange" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromOwnerId" TEXT,
    "toOwnerId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerChange_opportunityId_changedAt_idx" ON "OwnerChange"("opportunityId", "changedAt");

-- CreateIndex
CREATE INDEX "OwnerChange_toOwnerId_idx" ON "OwnerChange"("toOwnerId");

-- CreateIndex
CREATE INDEX "OwnerChange_fromOwnerId_idx" ON "OwnerChange"("fromOwnerId");

-- CreateIndex
CREATE INDEX "OwnerChange_changedById_idx" ON "OwnerChange"("changedById");

-- CreateIndex
-- One person leads at most one department. Enforced by the database rather
-- than by the route that appoints heads, so a second appointment fails loudly
-- instead of silently producing two departments with one leader.
CREATE UNIQUE INDEX "Department_headId_key" ON "Department"("headId");

-- AddForeignKey
-- SetNull: deleting a user must never delete the department they ran.
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerChange" ADD CONSTRAINT "OwnerChange_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerChange" ADD CONSTRAINT "OwnerChange_fromOwnerId_fkey" FOREIGN KEY ("fromOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: ownership history is an audit trail. Losing it because somebody
-- was deleted from the firm would defeat the point of keeping it.
ALTER TABLE "OwnerChange" ADD CONSTRAINT "OwnerChange_toOwnerId_fkey" FOREIGN KEY ("toOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerChange" ADD CONSTRAINT "OwnerChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;