ALTER TABLE "Organization"
  ADD COLUMN "isExistingClient" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceData" JSONB;

CREATE UNIQUE INDEX "Organization_sourceKey_key" ON "Organization"("sourceKey");
