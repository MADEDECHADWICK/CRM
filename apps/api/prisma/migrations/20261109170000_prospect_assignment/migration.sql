ALTER TABLE "Organization"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "assignedById" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "Organization_assignedToId_idx" ON "Organization"("assignedToId");

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
