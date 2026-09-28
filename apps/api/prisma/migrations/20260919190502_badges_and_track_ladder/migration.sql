/*
  Warnings:

  - Added the required column `createdById` to the `badges` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `badges` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BadgeAwardMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- AlterTable
ALTER TABLE "badge_awards" ADD COLUMN     "awardedById" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT;

-- AlterTable
ALTER TABLE "badges" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "awardMode" "BadgeAwardMode" NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "programmeCode" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "cardStats" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "gateSteps" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "prerequisiteCode" TEXT;

-- CreateIndex
CREATE INDEX "badge_awards_userId_awardedAt_idx" ON "badge_awards"("userId", "awardedAt");

-- CreateIndex
CREATE INDEX "badges_programmeCode_active_idx" ON "badges"("programmeCode", "active");

-- AddForeignKey
ALTER TABLE "badges" ADD CONSTRAINT "badges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: badges that predate authorship are attributed to the institution,
-- not invented an owner. The first administrator by creation date is used.
UPDATE "badges" SET
  "createdById" = (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1),
  "updatedAt" = COALESCE("updatedAt", NOW())
WHERE "createdById" IS NULL;

-- A badge with no author would be a rule nobody set.
DELETE FROM "badges" WHERE "createdById" IS NULL;

ALTER TABLE "badges" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "badges" ALTER COLUMN "updatedAt" SET NOT NULL;
