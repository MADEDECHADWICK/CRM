-- CreateIndex
CREATE INDEX "Opportunity_stageEnteredAt_idx" ON "Opportunity"("stageEnteredAt");

-- CreateIndex
CREATE INDEX "Opportunity_stage_stageEnteredAt_idx" ON "Opportunity"("stage", "stageEnteredAt");

-- CreateIndex
CREATE INDEX "Opportunity_leadReceivedAt_idx" ON "Opportunity"("leadReceivedAt");

-- CreateIndex
CREATE INDEX "Opportunity_breachNoteRequired_breachNoteDueAt_idx" ON "Opportunity"("breachNoteRequired", "breachNoteDueAt");
