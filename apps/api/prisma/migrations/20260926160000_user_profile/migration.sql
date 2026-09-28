-- The profile completed on first sign-in (organisation, job title, country,
-- phone, address). Additive only: every column is nullable, nothing existing
-- is rewritten, and an account with no profile simply has not completed it.
ALTER TABLE "users" ADD COLUMN "organisation" TEXT;
ALTER TABLE "users" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "users" ADD COLUMN "country" TEXT;
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "address" TEXT;
ALTER TABLE "users" ADD COLUMN "profileCompletedAt" TIMESTAMP(3);
