-- Password lifecycle and session control.
--
-- Three things arrive together because they are one feature: an account can be
-- locked by repeated failure, held at the password screen until it is changed,
-- and let back in through a single-use token.

-- AlterTable: the password's own history, kept apart from updatedAt
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- Existing accounts have a password set at some point; the honest value for
-- when is the row's own creation, not now. Backfilled so "never changed since
-- the account was made" reads as such rather than as "changed at migration".
UPDATE "users" SET "passwordChangedAt" = "createdAt" WHERE "passwordChangedAt" IS NULL;

-- AlterTable: why a session ended, and who ended it
ALTER TABLE "sessions" ADD COLUMN     "revokedReason" TEXT;
ALTER TABLE "sessions" ADD COLUMN     "revokedById" TEXT;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_usedAt_idx" ON "password_reset_tokens"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
