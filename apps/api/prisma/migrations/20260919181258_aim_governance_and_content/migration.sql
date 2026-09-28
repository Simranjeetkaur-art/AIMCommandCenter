-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('GOVERNED', 'ATTENTION', 'CRITICAL', 'RETIRED');

-- CreateEnum
CREATE TYPE "LastCommandStatus" AS ENUM ('VERIFIED', 'PENDING', 'MISSING');

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "bodyHtml" TEXT;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "meta" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerRole" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "purpose" TEXT NOT NULL,
    "aai" DOUBLE PRECISION,
    "band" TEXT,
    "lastCommand" "LastCommandStatus" NOT NULL DEFAULT 'PENDING',
    "status" "AgentStatus" NOT NULL DEFAULT 'ATTENTION',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostics" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "agentName" TEXT NOT NULL,
    "agentOwner" TEXT NOT NULL,
    "agentPurpose" TEXT NOT NULL,
    "scores" INTEGER[],
    "aai" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "isPractice" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "diagnosticId" TEXT NOT NULL,
    "envelope" JSONB NOT NULL DEFAULT '{}',
    "actionClasses" JSONB NOT NULL DEFAULT '{}',
    "controls" JSONB NOT NULL DEFAULT '[]',
    "narrative" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_code_key" ON "agents"("code");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "diagnostics_createdById_createdAt_idx" ON "diagnostics"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "diagnostics_agentId_idx" ON "diagnostics"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_diagnosticId_key" ON "prescriptions"("diagnosticId");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "diagnostics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
