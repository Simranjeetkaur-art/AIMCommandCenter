-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "moduleId" TEXT;

-- AlterTable
ALTER TABLE "question_banks" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "moduleId" TEXT,
ADD COLUMN     "programmeId" TEXT,
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "question_banks_programmeId_moduleId_idx" ON "question_banks"("programmeId", "moduleId");

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
