-- CreateEnum
CREATE TYPE "PerformanceStatus" AS ENUM ('DRAFT', 'RELEASED');

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectRole" "Role" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerRole" "Role" NOT NULL,
    "cycle" TEXT NOT NULL,
    "scores" INTEGER[],
    "index" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "strengths" TEXT NOT NULL DEFAULT '',
    "concerns" TEXT NOT NULL DEFAULT '',
    "actions" TEXT NOT NULL DEFAULT '',
    "status" "PerformanceStatus" NOT NULL DEFAULT 'DRAFT',
    "releasedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_reviews_subjectId_status_idx" ON "performance_reviews"("subjectId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_reviewerId_idx" ON "performance_reviews"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_subjectId_reviewerId_cycle_key" ON "performance_reviews"("subjectId", "reviewerId", "cycle");

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
