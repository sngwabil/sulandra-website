ALTER TABLE "ApplicantPortalAccount"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ApplicantPasswordReset" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantPasswordReset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicantPasswordReset_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "ApplicantPasswordReset_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ApplicantPortalAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ApplicantPasswordReset_accountId_expiresAt_idx"
  ON "ApplicantPasswordReset"("accountId", "expiresAt");
