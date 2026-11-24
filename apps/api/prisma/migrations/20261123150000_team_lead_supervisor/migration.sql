-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supervisorPartnerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorPartnerId_fkey" FOREIGN KEY ("supervisorPartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

