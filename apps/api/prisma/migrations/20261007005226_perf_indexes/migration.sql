-- CreateIndex
CREATE INDEX "Followup_createdById_idx" ON "Followup"("createdById");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_stageEnteredAt_idx" ON "Opportunity"("ownerId", "stageEnteredAt");
