-- CI-ONLY legacy SPIRE baseline.
--
-- The production database predates prisma/migrations/ and already contains
-- these core identity/application tables. The migration history begins by
-- extending them, so a disposable migration smoke database must recreate this
-- supported starting contract before running `prisma migrate deploy`.
-- This file is never executed by Railway or production predeploy.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM (
      'ADMINISTRATOR',
      'PROGRAM_MANAGER',
      'AUDITOR',
      'DSP',
      'DELEGATING_NURSE',
      'LPN',
      'RN',
      'HOUSE_MANAGER',
      'HR_MANAGER',
      'SCHEDULER',
      'BILLING_SPECIALIST',
      'ADMINISTRATIVE_ASSISTANT',
      'CEO'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Sulandra Health',
  "slug" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "email" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'DSP',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EmployeeApplication" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "firstName" TEXT,
  "middleName" TEXT,
  "lastName" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "appliedRole" TEXT NOT NULL DEFAULT 'GENERAL',
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeApplication_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmployeeApplication_org_status_idx"
  ON "EmployeeApplication"("organizationId","status","submittedAt");

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL DEFAULT 'LEGACY_BASELINE',
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
