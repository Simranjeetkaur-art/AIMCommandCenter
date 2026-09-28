-- CreateEnum
CREATE TYPE "QuestionPool" AS ENUM ('QUIZ', 'SIMULATOR');

-- DropForeignKey
ALTER TABLE "credential_events" DROP CONSTRAINT "credential_events_actorId_fkey";

-- DropForeignKey
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_issuedById_fkey";

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "drawCount" INTEGER,
ADD COLUMN     "finalExam" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "questionIds" JSONB;

-- AlterTable
ALTER TABLE "credential_events" ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "autoIssued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "examAttemptId" TEXT,
ADD COLUMN     "examScore" INTEGER,
ALTER COLUMN "issuedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "pool" "QuestionPool" NOT NULL DEFAULT 'QUIZ';

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_events" ADD CONSTRAINT "credential_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill ----------------------------------------------------------------

-- A question already on a simulator is a simulator mission; everything else
-- stays in the quiz pool. (No question sat on both before this migration.)
UPDATE "questions" q SET "pool" = 'SIMULATOR'
WHERE EXISTS (
  SELECT 1 FROM "assessment_questions" aq
  JOIN "assessments" a ON a."id" = aq."assessmentId"
  WHERE aq."questionId" = q."id" AND a."kind" = 'SIMULATION'
);

-- Module quizzes were only ever linked to their module by code suffix
-- ("CP-001-ASSESS", or "V2-CP-001-ASSESS" on a later version).
UPDATE "assessments" a SET "moduleId" = m."id"
FROM "modules" m
WHERE a."moduleId" IS NULL
  AND m."programmeVersionId" = a."programmeVersionId"
  AND m."code" IS NOT NULL
  AND (a."code" = m."code" || '-ASSESS' OR a."code" ~ ('^V[0-9]+-' || m."code" || '-ASSESS$'));

UPDATE "assessments" SET "finalExam" = true
WHERE "kind" = 'QUIZ' AND "moduleId" IS NULL AND "code" ~ '-EXAM$';

UPDATE "assessments" SET "drawCount" = 10 WHERE "kind" = 'QUIZ' AND "moduleId" IS NOT NULL;
UPDATE "assessments" SET "drawCount" = 20 WHERE "kind" = 'SIMULATION';
UPDATE "assessments" SET "drawCount" = 50 WHERE "finalExam" = true;
