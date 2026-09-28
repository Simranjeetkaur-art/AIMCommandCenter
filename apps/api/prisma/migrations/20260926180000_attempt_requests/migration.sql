-- Learners asking for more attempts after using them all without passing;
-- decided by an assigned examiner or a manager. Additive: one enum, one table.

-- CreateEnum
CREATE TYPE "AttemptRequestStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED');

-- CreateTable
CREATE TABLE "attempt_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AttemptRequestStatus" NOT NULL DEFAULT 'PENDING',
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_requests_status_createdAt_idx" ON "attempt_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "attempt_requests_userId_assessmentId_idx" ON "attempt_requests"("userId", "assessmentId");

-- AddForeignKey
ALTER TABLE "attempt_requests" ADD CONSTRAINT "attempt_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_requests" ADD CONSTRAINT "attempt_requests_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_requests" ADD CONSTRAINT "attempt_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

