-- CreateEnum
CREATE TYPE "UnlockPolicy" AS ENUM ('ALL', 'ANY');

-- CreateEnum
CREATE TYPE "UnlockRuleType" AS ENUM ('CREDENTIAL_HELD', 'BADGE_HELD', 'COHORT_MEMBER', 'DATE_WINDOW', 'MANUAL_GRANT', 'MODULES_COMPLETED');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "cohorts" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "outcomes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "overview" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "unlockPolicy" "UnlockPolicy" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT,
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "unlock_rules" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "type" "UnlockRuleType" NOT NULL,
    "requiredProgrammeCode" TEXT,
    "requiredBadgeCode" TEXT,
    "requiredCohortId" TEXT,
    "threshold" INTEGER,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "label" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlock_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_grants" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT,
    "institutionName" TEXT NOT NULL DEFAULT 'AIM Academy',
    "title" TEXT NOT NULL DEFAULT 'Certificate of Achievement',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "statement" TEXT NOT NULL DEFAULT 'has successfully completed the requirements for',
    "scopeNote" TEXT NOT NULL DEFAULT '',
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "signatoryTitle" TEXT NOT NULL DEFAULT '',
    "signatureSvg" TEXT,
    "sealSvg" TEXT,
    "logoSvg" TEXT,
    "footnote" TEXT NOT NULL DEFAULT '',
    "accentColor" TEXT NOT NULL DEFAULT '#B4752A',
    "orientation" TEXT NOT NULL DEFAULT 'LANDSCAPE',
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unlock_rules_programmeId_active_idx" ON "unlock_rules"("programmeId", "active");

-- CreateIndex
CREATE INDEX "track_grants_userId_idx" ON "track_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "track_grants_programmeId_userId_key" ON "track_grants"("programmeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_programmeId_key" ON "certificate_templates"("programmeId");

-- AddForeignKey
ALTER TABLE "unlock_rules" ADD CONSTRAINT "unlock_rules_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_rules" ADD CONSTRAINT "unlock_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_grants" ADD CONSTRAINT "track_grants_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_grants" ADD CONSTRAINT "track_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_grants" ADD CONSTRAINT "track_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
