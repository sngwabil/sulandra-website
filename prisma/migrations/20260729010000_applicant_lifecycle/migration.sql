-- Applicant workflow, portal access, document storage, scoring, and delivery tracking.
-- This migration extends the existing Careers tables without replacing the working opening/application flow.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GENERAL';

ALTER TABLE "EmployeeApplication"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "workflowStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS "preferredCommunication" TEXT NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN IF NOT EXISTS "applicantUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "assessmentScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "assessmentMaxScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "assessmentPercent" NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "assessmentBreakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "applicationData" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeApplication_workflowStatus_check'
  ) THEN
    ALTER TABLE "EmployeeApplication"
      ADD CONSTRAINT "EmployeeApplication_workflowStatus_check"
      CHECK ("workflowStatus" IN (
        'RECEIVED','REVIEWING','DOCUMENTS_NEEDED','INTERVIEW','OFFER_PENDING',
        'HIRED','NOT_SELECTED','WITHDRAWN','TERMINATED','POSITION_FILLED'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeApplication_preferredCommunication_check'
  ) THEN
    ALTER TABLE "EmployeeApplication"
      ADD CONSTRAINT "EmployeeApplication_preferredCommunication_check"
      CHECK ("preferredCommunication" IN ('EMAIL','SMS'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EmployeeApplication_workflowStatus_idx"
  ON "EmployeeApplication"("organizationId","workflowStatus","submittedAt");
CREATE INDEX IF NOT EXISTS "EmployeeApplication_applicantUsername_idx"
  ON "EmployeeApplication"("applicantUsername");

ALTER TABLE "ApplicantDocument"
  ADD COLUMN IF NOT EXISTS "fileData" BYTEA,
  ADD COLUMN IF NOT EXISTS "contentSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

ALTER TABLE "ApplicantMessage"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ApplicantPortalAccount" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantPortalAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicantPortalAccount_applicationId_key" UNIQUE ("applicationId"),
  CONSTRAINT "ApplicantPortalAccount_username_key" UNIQUE ("username"),
  CONSTRAINT "ApplicantPortalAccount_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ApplicantPortalAccount_username_lower_idx"
  ON "ApplicantPortalAccount"(LOWER("username"));

CREATE TABLE IF NOT EXISTS "ApplicantStatusHistory" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "note" TEXT,
  "visibleToApplicant" BOOLEAN NOT NULL DEFAULT TRUE,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicantStatusHistory_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ApplicantStatusHistory_applicationId_createdAt_idx"
  ON "ApplicantStatusHistory"("applicationId","createdAt");

UPDATE "EmployeeApplication"
   SET "workflowStatus" = COALESCE(NULLIF("status"::text,''),'RECEIVED')
 WHERE "workflowStatus" = 'RECEIVED'
   AND "status"::text IN (
     'RECEIVED','REVIEWING','DOCUMENTS_NEEDED','INTERVIEW','OFFER_PENDING',
     'HIRED','NOT_SELECTED','WITHDRAWN','TERMINATED','POSITION_FILLED'
   );
