ALTER TABLE "Organization" ADD COLUMN "assignedDepartmentId" TEXT;
CREATE INDEX "Organization_assignedDepartmentId_idx" ON "Organization"("assignedDepartmentId");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_assignedDepartmentId_fkey"
  FOREIGN KEY ("assignedDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
