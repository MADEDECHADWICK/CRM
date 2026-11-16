ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isAdmin" = true WHERE "role" = 'MARKETING_BD';
